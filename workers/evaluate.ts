import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import type { Database, Json } from "../src/types/database";
import { emptySettings, type Onboarding, type TestSnapshot } from "../src/lib/deployment/types";
import { decryptCredential } from "../src/lib/deployment/crypto";
import { safeModelFetch } from "../src/lib/deployment/network";
import { OpenAiCompatibleExecutor, resolveOperatorCredential, modelEndpoint } from "../src/lib/evaluation/providers";
import { runAutomaticEvaluation } from "../src/lib/evaluation/orchestrator";
import type { ExecutableModelConfiguration, ModelExecutionRequest } from "../src/lib/evaluation/pipeline-types";
import type { AiCompletionProvider } from "../src/lib/ai/types";
import { buildEvaluationDataset } from "../src/lib/evaluation/engine";
import { buildRunReportData } from "../src/lib/evaluation/report-data";
import { buildEvidenceGroundedRecommendations } from "../src/lib/evaluation/recommendations";
import { HindsightClient } from "@vectorize-io/hindsight-client";
import { retainMemoryWithClient } from "../src/lib/hindsight/core";
import { getBaseEvaluationMetadata, getEvaluationFailureEventId, getEvaluationOutcomeEventId } from "../src/lib/hindsight/formatter";

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const id = process.argv[2]; const owner = process.argv[3]; const lease = randomUUID();
let operation: Onboarding; let heartbeat: ReturnType<typeof setInterval> | undefined;
let previousUsed = 0;
const started = Date.now();
function check<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> { if (result.error) throw new Error(result.error.message); if(result.data===null||result.data===undefined)throw new Error("Worker record not found.");return result.data as NonNullable<T>; }
function optional<T>(result: { data: T; error: { message: string } | null }): T { if(result.error)throw new Error(result.error.message);return result.data; }
async function patch(values: Partial<Onboarding>) {
  let query=db.from("model_onboarding").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id).eq("owner_user_id", owner).eq("lease_token", lease);
  if(values.stage && !["failed","cancelled"].includes(values.stage))query=query.eq("cancel_requested",false);
  const updated=optional(await query.select("id").maybeSingle());
  if(!updated)throw new Error("Worker lease changed or evaluation cancelled.");
}
async function authorized() {
  const op = check(await db.from("model_onboarding").select("*").eq("id", id).eq("owner_user_id", owner).single());
  const project = optional(await db.from("models").select("id").eq("id", op.model_id).eq("owner_user_id", owner).maybeSingle());
  if (!project || op.lease_token !== lease || !op.lease_expires_at || Date.parse(op.lease_expires_at)<Date.now()) throw new Error("Worker ownership or lease changed.");
  if (op.cancel_requested) throw new Error("Evaluation cancelled.");
  if (op.reserved_seconds && previousUsed+(Date.now() - started) / 1000 > op.reserved_seconds) throw new Error("Your deployment allowance for this job has been reached.");
  return op;
}
function controlHeaders() { return { "Content-Type": "application/json", "Modal-Key": process.env.MODAL_PROXY_TOKEN_ID!, "Modal-Secret": process.env.MODAL_PROXY_TOKEN_SECRET! }; }
async function control(path: string, target = id, payload: object = {}) {
  await authorized();
  const response = await fetch(`${process.env.MODAL_CONTROL_URL}${path}`, { method: "POST", headers: controlHeaders(), body: JSON.stringify({ operation_id: target, job_id: id, owner_user_id: owner, lease_token: lease, ...payload }), signal: AbortSignal.timeout(Math.max(1000, ((operation.reserved_seconds || 1800)-previousUsed) * 1000 - (Date.now() - started))) });
  if (!response.ok) throw new Error(`Model service failed (${response.status}). Check model compatibility or retry preparation.`);
  return response.json();
}
async function secret(target: string) {
  const row = optional(await db.from("model_private_credentials").select("ciphertext").eq("operation_id", target).maybeSingle());
  return row ? decryptCredential(row.ciphertext) : null;
}
const judge: AiCompletionProvider = async input => {
  const endpoint = `${(process.env.LLM_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "")}/chat/completions`;
  const response = await safeModelFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LLM_API_KEY || process.env.NVIDIA_API_KEY || process.env.OPENAI_API_KEY || ""}` }, body: JSON.stringify({ model: process.env.LLM_MODEL, messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }], temperature: 0, response_format: { type: "json_object" } }), signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error("Evaluation judge is unavailable.");
  const body = await response.json(); return JSON.parse(body.choices[0].message.content);
};
function stableResultId(run: string, test: string) {
  const hex = createHash("sha256").update(`${run}:${test}`).digest("hex").slice(0, 32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20)}`;
}
async function evaluateVersion(target: Onboarding, tests: TestSnapshot[], baseline = false) {
  const configRow = optional(await db.from("model_version_configurations").select("*").eq("model_version_id", target.model_version_id).maybeSingle());
  const legacy=baseline && target.id===target.model_version_id;
  const config: ExecutableModelConfiguration = {
    modelVersionId: target.model_version_id, provider: configRow?.provider || (legacy ? "nvidia-nim" : "openai-compatible"), modelName: target.settings.model || configRow?.model_name || (legacy ? process.env.LLM_MODEL : null) || `modelledger-${target.id}`,
    baseUrl: configRow ? configRow.base_url : legacy ? process.env.LLM_BASE_URL || null : null, endpointUrl: target.settings.endpoint || configRow?.endpoint_url || null,
    systemPrompt: target.settings.systemPrompt, temperature: 0, maxTokens: 512, providerSettings: {}, credentialReference: `private:${target.id}`,
  };
  let runId = baseline ? null : operation.evaluation_id;
  const processed = new Set<string>();
  if(runId && !baseline) {
    const saved=check(await db.from("evaluation_results").select("test_case_id").eq("evaluation_id",runId).eq("execution_status","SUCCESS").eq("evaluator_status","SUCCESS"));
    saved.forEach(row=>{if(row.test_case_id)processed.add(row.test_case_id);});
    await patch({completed_tests:processed.size});
  }
  const executor = target.settings.source === "api"
    ? new OpenAiCompatibleExecutor({ allowAnonymous:true, resolveCredential: async () => (await secret(target.id)) || (legacy ? resolveOperatorCredential(configRow?.credential_reference || "NVIDIA_API_KEY",modelEndpoint(config)) : null), fetch: safeModelFetch as typeof fetch })
    : { execute: async (request: ModelExecutionRequest) => {
      const then = Date.now(); const response = await control("/inference", target.id, { messages: [...(request.configuration.systemPrompt ? [{ role: "system", content: request.configuration.systemPrompt }] : []), { role: "user", content: request.testCase.input }], max_tokens: 512 });
      return { output: String(response.choices[0].message.content), latencyMs: Date.now() - then, tokenUsage: { inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens, totalTokens: response.usage.total_tokens }, estimatedCostUsd: null, providerMetadata: { model: config.modelName, revision: target.artifact_revision }, status: "SUCCESS" as const, error: null };
    } };
  return runAutomaticEvaluation({
    modelId: target.model_id, modelVersionId: target.model_version_id, name: `${baseline ? "Baseline" : "Guided"} evaluation`, configuration: config,
    testCases: tests.map(t => ({ id: t.id, stableKey: t.stable_key, modelId: target.model_id, name: t.name, category: t.category, input: t.input, expectedOutput: t.expected_output, evaluationCriteria: t.evaluation_criteria, evaluatorType: t.evaluator_type, threshold: t.threshold, severity: t.severity, tags: t.tags })),
    executor, judge: { complete: judge }, strictPersistence: true, beforeCase: async () => { await authorized(); },
    repository: {
      createRun: async values => {
        if (!runId && baseline) {
          const previous = optional(await db.from("evaluations").select("id,evaluated_at").eq("model_id",target.model_id).eq("model_version_id", target.model_version_id).contains("run_metadata", { guidedBaseline: id }).limit(1).maybeSingle());
          if(previous) runId=previous.id;
        }
        if (runId) return check(await db.from("evaluations").select("id,evaluated_at").eq("id", runId).eq("model_id",target.model_id).single());
        const run = check(await db.from("evaluations").insert({ ...values, run_metadata: { mode: "automatic", deployment: target.id, artifactRevision: target.artifact_revision, guidedBaseline: baseline ? id : null, configuration: config as unknown as Json, tests: tests as unknown as Json } }).select("id,evaluated_at").single());
        runId = run.id; if (!baseline) { operation.evaluation_id=run.id; await patch({ evaluation_id: run.id }); } return run;
      },
      findCheckpoint: async testId => {
        if (!runId) return null;
        const row = optional(await db.from("evaluation_results").select("*").eq("id",stableResultId(runId,testId)).eq("evaluation_id",runId).maybeSingle());
        if (!row) return null;
        if(row.execution_status!=="SUCCESS" || row.evaluator_status!=="SUCCESS")return null;
        return { execution: { output: row.actual_result || "", latencyMs: row.model_latency_ms, tokenUsage: { inputTokens:row.input_tokens,outputTokens:row.output_tokens,totalTokens:row.total_tokens }, estimatedCostUsd:row.estimated_cost_usd, providerMetadata:row.provider_metadata, status:row.execution_status || "SUCCESS",error:row.provider_error }, evaluation: { score:row.score || 0,passed:!!row.passed,reason:row.evaluator_reason || "",evidence:row.evaluator_evidence || {},evaluatorType:row.evaluator_type || "exact_match",status:row.evaluator_status || "SUCCESS" } };
      },
      createResult: async values => {
        await authorized();
        const result = check(await db.from("evaluation_results").upsert({ ...values,id:stableResultId(runId!, values.test_case_id!) }, { onConflict:"id" }).select("id").single());
        if(!baseline) { processed.add(values.test_case_id!); await patch({completed_tests:processed.size}); }
        return result;
      },
      updateRun: async (run,values) => { optional(await db.from("evaluations").update(values).eq("id",run).eq("model_id",target.model_id)); },
    },
  });
}
async function optionalReportServices() {
  if(!operation.evaluation_id)return;
  await authorized();
  const runs=check(await db.from("evaluations").select("*").eq("model_id",operation.model_id));
  const versions=check(await db.from("model_versions").select("*").eq("model_id",operation.model_id));
  const results=check(await db.from("evaluation_results").select("*").in("evaluation_id",runs.map(run=>run.id)));
  const dataset=buildEvaluationDataset({versions,evaluations:runs,results});
  const run=runs.find(run=>run.id===operation.evaluation_id);
  if(!run)return;
  const configuration=optional(await db.from("model_version_configurations").select("*").eq("model_version_id",operation.model_version_id).maybeSingle());
  const report=buildRunReportData({evaluation:run,results:results.filter(r=>r.evaluation_id===run.id),dataset,configuration});
  const recommendations=buildEvidenceGroundedRecommendations({report});
  await authorized();
  if(recommendations.length)optional(await db.from("evaluation_recommendations").upsert(recommendations.map(r=>({id:stableResultId(run.id,r.id),evaluation_id:run.id,test_key:r.testKey || null,priority:r.priority,title:r.title,action:r.action,evidence:{deterministicFacts:r.evidence,generatedAction:r.action}})),{onConflict:"id"}));
  if(!process.env.HINDSIGHT_API_KEY)return;
  const sdk=new HindsightClient({apiKey:process.env.HINDSIGHT_API_KEY,baseUrl:process.env.HINDSIGHT_BASE_URL || "https://api.hindsight.vectorize.io"});
  const client={retain:sdk.retain.bind(sdk),recall:sdk.recall.bind(sdk),createBank:sdk.createBank.bind(sdk)};
  await Promise.all(dataset.facts.filter(f=>f.evaluationId===run.id).slice(0,100).map(fact=> {
    const eventType=fact.result==="FAIL"?"evaluation_failure" as const:"evaluation_outcome" as const;
    return retainMemoryWithClient(client,{modelId:operation.model_id,eventId:fact.result==="FAIL"?getEvaluationFailureEventId(fact.id):getEvaluationOutcomeEventId(fact.id),eventType,content:`${fact.version} ${fact.result}: ${fact.testName}. Expected: ${fact.expectedResult}. Actual: ${fact.actualResult}.`,timestamp:fact.evaluatedAt,metadata:getBaseEvaluationMetadata({modelId:operation.model_id,fact},eventType)});
  }));
}
async function main() {
  const claimed = optional(await db.rpc("claim_model_job", {p_id:id,p_owner:owner,p_lease:lease}));
  if (!claimed) return;
  operation = claimed as unknown as Onboarding;
  previousUsed=operation.used_seconds;
  heartbeat=setInterval(()=> { void patch({lease_expires_at:new Date(Date.now()+120_000).toISOString(),used_seconds:Math.min(operation.reserved_seconds,previousUsed+Math.ceil((Date.now()-started)/1000))}).catch(()=>{}); },30_000);
  try {
    await authorized();
    if(operation.settings.source !== "api" && process.env.MODELLEDGER_DEPLOY_GPU === "false")throw new Error("GPU hosting is disabled. Connect an existing model API or save this setup as a draft.");
    if (!operation.test_snapshot?.length) {
      operation.test_snapshot = check(await db.from("test_cases").select("*").eq("model_id",operation.model_id).eq("model_version_id",operation.model_version_id));
      if (!operation.test_snapshot.length) throw new Error("Add reviewed tests before evaluating.");
      await patch({test_snapshot:operation.test_snapshot,total_tests:operation.test_snapshot.length});
    }
    if(operation.settings.source !== "api") {
      await patch({stage:"validating"});
      const prepared = await control("/prepare");
      operation.artifact_revision=prepared.revision;
      await patch({stage:"preparing",artifact_revision:prepared.revision});
      await control("/inference",id,{messages:[{role:"user",content:"Hello"}],max_tokens:1});
    }
    const model=operation.settings.model || `modelledger-${id}`;
    optional(await db.from("model_version_configurations").upsert({model_version_id:operation.model_version_id,provider:"openai-compatible",model_name:model,endpoint_url:operation.settings.source==="api"?operation.settings.endpoint:null,credential_reference:`PRIVATE_${id.replaceAll("-", "_").toUpperCase()}`,system_prompt:operation.settings.systemPrompt,temperature:0,max_tokens:512,provider_settings:operation.settings.source==="api"?{}:{deploymentId:id,artifactRevision:operation.artifact_revision}}, {onConflict:"model_version_id"}));
    await patch({stage:"evaluating"});
    const evaluated=await evaluateVersion(operation,operation.test_snapshot!);
    if(evaluated.status!=="COMPLETED")throw new Error(`${evaluated.counters.errorCount} test cases could not execute or be scored. Your report is saved. Check credentials, model responses, or judge configuration, then retry; completed cases will be reused.`);
    if(operation.baseline_version_id) {
      const existing=check(await db.from("evaluations").select("id").eq("model_id",operation.model_id).eq("model_version_id",operation.baseline_version_id).eq("status","COMPLETED").order("evaluated_at",{ascending:false}).limit(1));
      const baseline=optional(await db.from("model_onboarding").select("*").eq("model_id",operation.model_id).eq("owner_user_id",owner).eq("model_version_id",operation.baseline_version_id).maybeSingle());
      const target = baseline || { ...operation, id: operation.baseline_version_id, model_version_id: operation.baseline_version_id, settings: { ...emptySettings, source: "api" as const, model: "" }, evaluation_id: null };
      const savedTests=baseline?.test_snapshot?.length ? baseline.test_snapshot : check(await db.from("test_cases").select("*").eq("model_id",operation.model_id).or(`model_version_id.eq.${target.model_version_id},model_version_id.is.null`));
      const byKey=new Map<string,TestSnapshot>();
      for(const test of savedTests) {
        if(!byKey.has(test.stable_key) || ("model_version_id" in test && test.model_version_id===target.model_version_id))byKey.set(test.stable_key,test);
      }
      const baselineTests=[...byKey.values()];
      const shared=operation.test_snapshot!.filter(test=>baselineTests.some(b=>b.stable_key===test.stable_key && b.input===test.input && b.expected_output===test.expected_output && b.evaluator_type===test.evaluator_type && b.threshold===test.threshold && JSON.stringify(b.evaluation_criteria)===JSON.stringify(test.evaluation_criteria)));
      const previous=existing.length ? check(await db.from("evaluation_results").select("test_key,input_snapshot,expected_output_snapshot,evaluator_type,threshold,evaluation_criteria_snapshot").eq("evaluation_id",existing[0].id)) : [];
      const comparable=existing.length>0 && shared.every(test=>previous.some(row=>row.test_key===test.stable_key && row.input_snapshot===test.input && row.expected_output_snapshot===test.expected_output && row.evaluator_type===test.evaluator_type && row.threshold===test.threshold && JSON.stringify(row.evaluation_criteria_snapshot)===JSON.stringify(test.evaluation_criteria)));
      if(!comparable) {
        if(!baselineTests.length)throw new Error("Your current report is saved. Add tests to the baseline version before comparing.");
        if(target.settings.source!=="api" && !target.artifact_revision) {
          const prepared=await control("/prepare",target.id);
          target.artifact_revision=prepared.revision;
          optional(await db.from("model_onboarding").update({artifact_revision:prepared.revision}).eq("id",target.id).eq("owner_user_id",owner));
        }
        const evaluatedBaseline=await evaluateVersion(target,baselineTests,true);
        if(evaluatedBaseline.status!=="COMPLETED")throw new Error("Your current report is saved, but the baseline run failed. Check the baseline model connection and retry to finish the comparison.");
      }
    }
    await authorized(); await patch({stage:"ready",error:null});
    // The report is available before optional services run; their failures cannot undo it.
    let optionalTimeout:ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([optionalReportServices(),new Promise<void>((_,reject)=>{optionalTimeout=setTimeout(()=>reject(new Error("Optional report services timed out.")),20_000);})]);
    } catch { console.warn("Optional report enrichment unavailable; evaluation report remains complete."); }
    finally { if(optionalTimeout)clearTimeout(optionalTimeout); }
  } catch(error) {
    const message=error instanceof Error?error.message:"Model preparation failed.";
    const current=await db.from("model_onboarding").select("cancel_requested").eq("id",id).single();
    if (operation.evaluation_id) {
      const valid = await authorized().catch(() => null);
      // Never let an expired worker overwrite a successor's report.
      const leased = optional(await db.from("model_onboarding").select("id").eq("id",id).eq("lease_token",lease).maybeSingle());
      if(valid || leased) {
        const count=await db.from("evaluation_results").select("id",{count:"exact",head:true}).eq("evaluation_id",operation.evaluation_id);
        optional(await db.from("evaluations").update({status:(count.count || 0)>0?"PARTIAL":"FAILED",notes:message.slice(0,1000)}).eq("id",operation.evaluation_id).eq("model_id",operation.model_id).eq("status","RUNNING"));
      }
    }
    await patch({stage:current.data?.cancel_requested?"cancelled":"failed",error:message.slice(0,1000)});
  } finally {
    if(heartbeat)clearInterval(heartbeat);
    const seconds=Math.min(operation.reserved_seconds,previousUsed+Math.ceil((Date.now()-started)/1000));
    const {error}=await db.rpc("finish_model_job",{p_id:id,p_lease:lease,p_used:seconds});
    if(error)console.error("Usage settlement failed; reserved allowance retained.");
  }
}
main().catch(async error=> { if(heartbeat)clearInterval(heartbeat); console.error(error instanceof Error?error.message:"Worker failed."); if(operation)await patch({stage:"failed",error:"Worker could not finish. Your saved results remain available."}).catch(()=>{}); process.exitCode=1; });
