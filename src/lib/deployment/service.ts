import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireUserId } from "@/lib/auth";
import { requireOwnedModel } from "@/lib/data/models";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseAndValidateTestCasesCsv, stableKeyForCsvTest } from "@/lib/data/test-case-csv";
import type { Database, Json } from "@/types/database";
import type { GuidedInput, ModelSettings, Onboarding } from "./types";
import { encryptCredential } from "./crypto";
import { assertPublicEndpoint } from "./network";
import { validateManifest, manifestSignature, settingsSignature } from "./validation";
import { modelRemovalBlockReason } from "./model-management";
import { r2Configured, r2ObjectSize, removeR2Artifacts } from "./r2";
import { artifactKey } from "./r2-upload-policy";

async function artifactSize(op: Onboarding, path: string) {
  const key = artifactKey(op.owner_user_id, op.id, path);
  if (op.settings.artifactStorage === "r2") return r2ObjectSize(key);
  const { data, error } = await deploymentAdmin().storage.from("model-artifacts").info(key);
  if (error && String(error.status) !== "404") throw new Error("Existing model storage could not be checked.");
  return data ? Number(data.size) : null;
}
async function removeArtifacts(op: Onboarding) {
  const paths = op.settings.files.map(file => artifactKey(op.owner_user_id, op.id, file.path));
  if (op.settings.artifactStorage === "r2") return removeR2Artifacts(`${op.owner_user_id}/${op.id}/`, paths);
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { error } = await deploymentAdmin().storage.from("model-artifacts").remove(paths.slice(offset, offset + 100));
    if (error) throw new Error("Previous model files could not be removed. Retry cleanup.");
  }
}

export function guidedEnabled() { return process.env.GUIDED_DEPLOYMENT_ENABLED === "true"; }
export function publicOperation(operation: Onboarding): Onboarding {
  return { ...operation, lease_token: null, lease_expires_at: null, worker_id: null, test_snapshot: undefined };
}
export function deploymentAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Deployment storage is not configured. Ask the administrator to finish setup.");
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function infrastructureStatus() {
  const worker = Boolean(process.env.MODAL_CONTROL_URL && process.env.MODAL_PROXY_TOKEN_ID && process.env.MODAL_PROXY_TOKEN_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.MODEL_CREDENTIAL_KEY_V1);
  const hosted = worker && process.env.MODELLEDGER_DEPLOY_GPU !== "false";
  return { worker, hosted, message: !worker ? "Background evaluation is not configured yet. Save a draft while your administrator connects the worker service." : hosted ? "Models run privately. Hosting starts only after submission and requires a deployment allowance." : "Connect an existing model API to evaluate now. GPU hosting is disabled; model uploads and repository imports can be saved as drafts." };
}
export async function ownedOperation(id: string) {
  const uid = await requireUserId();
  const client = await createSupabaseServerClient();
  const { data, error } = await client.from("model_onboarding").select("*").eq("id", id).eq("owner_user_id", uid).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Setup not found.");
  await requireOwnedModel(data.model_id);
  return data;
}
export async function latestOperation(projectId: string) {
  if (!guidedEnabled()) return null;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.from("model_onboarding").select("*").eq("model_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Apply the guided deployment migration before enabling the feature.");
  return data ? publicOperation(data) : null;
}
export async function versionOperation(projectId: string, versionId: string) {
  if(!guidedEnabled())return null;
  await requireOwnedModel(projectId);
  const client=await createSupabaseServerClient();
  const {data,error}=await client.from("model_onboarding").select("*").eq("model_id",projectId).eq("model_version_id",versionId).maybeSingle();
  if(error)throw new Error(error.message);
  return data ? publicOperation(data) : null;
}
const inputSchema = z.object({
  name: z.string().trim().min(1).max(120), purpose: z.string().trim().max(1000), version: z.string().trim().min(1).max(80),
  projectId: z.string().uuid().optional(), versionId: z.string().uuid().optional(), operationId: z.string().uuid().optional(), idempotencyKey: z.string().uuid(),
  csv: z.string().max(4_000_000), credential: z.string().max(10000).optional(), intent: z.enum(["draft", "evaluate", "upload"]),
  settings: z.object({ source: z.enum(["upload", "huggingface", "api"]), repository: z.string().max(200), revision: z.string().max(200), endpoint: z.string().max(2000), model: z.string().max(160), systemPrompt: z.string().max(12000), reuseTests: z.boolean(), displayName: z.string().max(200).optional(), files: z.array(z.object({ path: z.string().max(500), size: z.number().int().positive(), modified:z.number().int().nonnegative().optional() })).max(1000) }),
});
export async function saveOnboarding(raw: GuidedInput): Promise<Onboarding> {
  if (!guidedEnabled()) throw new Error("Guided deployment is not enabled.");
  const input = inputSchema.parse(raw);
  const uid = await requireUserId();
  if (input.projectId) await requireOwnedModel(input.projectId);
  const parsed = input.csv.trim() ? parseAndValidateTestCasesCsv(input.csv) : { rows: [], errors: [] };
  if (parsed.errors.length && input.intent !== "draft") throw new Error(parsed.errors.slice(0, 3).map(e => `CSV row ${e.row}: ${e.message}`).join(" "));
  const tests = (parsed.errors.length ? [] : parsed.rows).map(row => ({ stable_key: stableKeyForCsvTest(row), name: row.name, category: row.category, input: row.input, expected_output: row.expectedOutput, evaluator_type: row.evaluatorType || "exact_match", threshold: row.threshold ?? 1, severity: row.severity || "LOW", tags: row.tags || [], evaluation_criteria: (row.evaluationCriteria || {}) as Json }));
  const settings: ModelSettings = { ...input.settings, draftCsv: input.csv };
  if (settings.source === "upload") settings.artifactStorage = "r2";
  if (settings.source === "upload" && input.intent !== "draft" && !r2Configured()) throw new Error("Configure Cloudflare R2 before uploading model files.");
  if (settings.files.length) { const issue = validateManifest(settings.files); if (issue) throw new Error(issue); }
  if (input.intent === "evaluate") {
    if (!infrastructureStatus().worker) throw new Error(infrastructureStatus().message);
    if (settings.source !== "api" && !infrastructureStatus().hosted) throw new Error("GPU hosting is disabled. Save this setup as a draft or connect an existing model API to evaluate now.");
    if (settings.source === "upload") { const issue = validateManifest(settings.files); if (issue) throw new Error(issue); }
    if (settings.source === "huggingface" && !/^[\w.-]+\/[\w.-]+$/.test(settings.repository)) throw new Error("Enter a Hugging Face repository as owner/model.");
    if (settings.source === "api") { if (!settings.model.trim()) throw new Error("Enter the exact model identifier."); await assertPublicEndpoint(settings.endpoint); }
  }
  const admin = deploymentAdmin();
  let operation: Onboarding;
  if (input.intent === "upload") {
    if (!input.projectId || !input.versionId || settings.source !== "upload") throw new Error("Choose an existing project and version before uploading.");
    const client = await createSupabaseServerClient();
    const { data: version, error: versionError } = await client.from("model_versions").select("id").eq("id", input.versionId).eq("model_id", input.projectId).maybeSingle();
    if (versionError || !version) throw new Error("Version not found in this project.");
    const issue = validateManifest(settings.files); if (issue) throw new Error(issue);
    // One operation per existing version; concurrent requests must never create another version.
    const { error: insertError } = await admin.from("model_onboarding").upsert({ owner_user_id: uid, model_id: input.projectId, model_version_id: input.versionId, idempotency_key: input.idempotencyKey, settings }, { onConflict: "model_version_id", ignoreDuplicates: true });
    if (insertError) throw new Error(insertError.message);
    const existing = await versionOperation(input.projectId, input.versionId);
    if (!existing) throw new Error("Upload could not be saved.");
    if (existing.settings.deleting) throw new Error("This model is being deleted. Refresh before uploading another model.");
    if (input.operationId && input.operationId !== existing.id) throw new Error("Upload does not belong to the selected version.");
    if (existing.evaluation_id || !["draft", "uploading", "failed", "cancelled"].includes(existing.stage) || (existing.lease_expires_at && new Date(existing.lease_expires_at).getTime() > Date.now())) throw new Error("This version is already being evaluated. Choose another existing version.");
    if (existing.stage === "uploading" && manifestSignature(existing.settings.files) !== manifestSignature(settings.files)) throw new Error("An upload is already in progress for this version. Resume with the same folder or choose another version.");
    if (manifestSignature(existing.settings.files) !== manifestSignature(settings.files) || existing.settings.artifactStorage !== "r2") await removeArtifacts(existing);
    const { data: updated, error: updateError } = await admin.from("model_onboarding").update({ settings: { ...existing.settings, ...settings, draftCsv: existing.settings.draftCsv }, artifact_bytes: 0, artifact_revision: null, stage: "draft", error: null, cancel_requested: false, updated_at: new Date().toISOString() }).eq("id", existing.id).eq("owner_user_id", uid).eq("updated_at", existing.updated_at).is("evaluation_id", null).select("id").maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updated) throw new Error("This version changed in another request. Refresh before uploading.");
    const { error: uploadError } = await admin.rpc("begin_model_upload", { p_id: existing.id, p_owner: uid });
    if (uploadError) throw new Error(uploadError.message);
    return ownedOperation(existing.id);
  }
  if (input.operationId) {
    operation = await ownedOperation(input.operationId);
    if (operation.settings.source === "upload" && manifestSignature(operation.settings.files) === manifestSignature(settings.files)) settings.artifactStorage = operation.settings.artifactStorage;
    if (operation.settings.deleting) throw new Error("This model is being deleted. Refresh before changing its settings.");
    if (operation.lease_expires_at && new Date(operation.lease_expires_at).getTime()>Date.now()) throw new Error("Your worker is finishing the previous request. Wait briefly before changing setup.");
    if (["queued", "validating", "preparing", "evaluating", "ready"].includes(operation.stage)) return operation;
    // Frozen completed cases require a new version rather than modifying the evaluated snapshot.
    if (operation.evaluation_id) {
      if(settingsSignature(operation.settings)!==settingsSignature(settings))throw new Error("Add a new version to change the model configuration after evaluation has started.");
      if(input.csv!==operation.settings.draftCsv)throw new Error("Add a new version to change tests after evaluation has started.");
    }
    const modelChanged=settingsSignature({...operation.settings,reuseTests:false})!==settingsSignature({...settings,reuseTests:false});
    if(!operation.evaluation_id && operation.settings.source==="upload" && manifestSignature(operation.settings.files)!==manifestSignature(settings.files)) {
      await removeArtifacts(operation);
    }
    const { error } = await admin.from("model_onboarding").update({ settings, error: null, cancel_requested: false, stage: "draft", attempt:0, ...(!operation.evaluation_id && modelChanged ? {artifact_revision:null,artifact_bytes:0,test_snapshot:[]} : {}), updated_at: new Date().toISOString() }).eq("id", operation.id).eq("owner_user_id", uid);
    if (error) throw new Error(error.message);
    const {error:projectError}=await admin.from("models").update({purpose:input.purpose,updated_at:new Date().toISOString()}).eq("id",operation.model_id).eq("owner_user_id",uid);
    if(projectError)throw new Error(projectError.message);
    if(!parsed.errors.length && !operation.evaluation_id) {
      const {data:oldTests,error:oldTestError}=await admin.from("test_cases").select("id,stable_key").eq("model_id",operation.model_id).eq("model_version_id",operation.model_version_id);
      if(oldTestError)throw new Error(oldTestError.message);
      const keep=new Set(tests.map(t=>t.stable_key));
      const removed=(oldTests || []).filter(t=>!keep.has(t.stable_key)).map(t=>t.id);
      if(removed.length){const {error:deleteError}=await admin.from("test_cases").delete().eq("model_id",operation.model_id).eq("model_version_id",operation.model_version_id).in("id",removed);if(deleteError)throw new Error(deleteError.message);}
    }
    if (tests.length && !operation.evaluation_id) {
      const { error: testError } = await admin.from("test_cases").upsert(tests.map(test => ({ ...test, model_id: operation.model_id, model_version_id: operation.model_version_id })), { onConflict: "model_id,model_version_id,stable_key" });
      if (testError) throw new Error(testError.message);
    }
  } else {
    const client = await createSupabaseServerClient();
    const { data: id, error } = await client.rpc("create_guided_project", { p_key: input.idempotencyKey, p_name: input.name, p_purpose: input.purpose, p_version: input.version, p_settings: settings as unknown as Json, p_tests: tests as Json, ...(input.projectId ? { p_project: input.projectId } : {}) });
    if (error) throw new Error(error.message);
    operation = await ownedOperation(id);
  }
  if (input.credential?.trim()) {
    const { error } = await admin.from("model_private_credentials").upsert({ operation_id: operation.id, ciphertext: encryptCredential(input.credential.trim()), updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  }
  operation = await ownedOperation(operation.id);
  if (input.intent === "evaluate") {
    try {
    if (operation.settings.source === "upload") {
      if(operation.evaluation_id)await queueOperation(operation.id);
      else {
        const {error:uploadError}=await admin.rpc("begin_model_upload",{p_id:operation.id,p_owner:uid});
        if(uploadError)throw new Error(uploadError.message);
      }
    } else await queueOperation(operation.id);
    } catch (error) {
      await admin.from("model_onboarding").update({ stage: "failed", error: error instanceof Error ? error.message : "Setup could not start.", updated_at: new Date().toISOString() }).eq("id", operation.id).eq("owner_user_id", uid);
    }
  }
  return ownedOperation(operation.id);
}
export async function queueOperation(id: string) {
  const op = await ownedOperation(id);
  if (op.settings.deleting || op.cancel_requested) throw new Error("This model is being removed or stopped. Refresh before evaluating.");
  if (["queued", "validating", "preparing", "evaluating", "ready"].includes(op.stage)) return;
  if (!infrastructureStatus().worker) throw new Error(infrastructureStatus().message);
  if (op.settings.source !== "api" && !infrastructureStatus().hosted) throw new Error("GPU hosting is disabled. Save a draft or connect an existing model API.");
  if (op.baseline_version_id && !infrastructureStatus().hosted) {
    const {data:baseline,error:baselineError}=await adminBaseline(op.model_id,op.baseline_version_id);
    if(baselineError)throw new Error(baselineError.message);
    if(baseline && baseline.settings.source !== "api")throw new Error("This comparison needs GPU hosting for its baseline. Connect API models for both versions or save a draft until hosting is available.");
  }
  const admin = deploymentAdmin();
  const { data: tests, error } = await admin.from("test_cases").select("*").eq("model_id", op.model_id).eq("model_version_id", op.model_version_id);
  if (error) throw new Error(error.message);
  if (!tests?.length) throw new Error("Add reviewed tests with expected answers before starting evaluation.");
  if (op.settings.source === "upload") {
    const issue = validateManifest(op.settings.files); if (issue) throw new Error(issue);
    for (const file of op.settings.files) {
      if (await artifactSize(op, file.path) !== file.size) throw new Error(`Upload is incomplete: ${file.path}. Select the same folder to resume.`);
    }
  }
  const { data: queued, error: updateError } = await admin.from("model_onboarding").update({ stage: "queued", error: null, total_tests: tests.length, cancel_requested: false, updated_at: new Date().toISOString() }).eq("id", id).eq("owner_user_id", op.owner_user_id).eq("stage", op.stage).eq("updated_at", op.updated_at).eq("cancel_requested", false).select("id").maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (!queued) throw new Error("This model changed in another request. Refresh before evaluating.");
  // Durable row remains queued if dispatch fails. The Modal reconciler will pick it up.
  try {
    const response = await fetch(`${process.env.MODAL_CONTROL_URL}/submit`, { method: "POST", headers: { "Content-Type": "application/json", "Modal-Key": process.env.MODAL_PROXY_TOKEN_ID!, "Modal-Secret": process.env.MODAL_PROXY_TOKEN_SECRET! }, body: JSON.stringify({ operation_id: id, owner_user_id: op.owner_user_id }), signal: AbortSignal.timeout(15000) });
    if([401,403].includes(response.status)) {
      const {error:authError}=await admin.from("model_onboarding").update({stage:"failed",error:"The worker service rejected its operator credentials. Your model and tests are saved. Ask the administrator to reconnect the worker, then retry.",updated_at:new Date().toISOString()}).eq("id",id).eq("owner_user_id",op.owner_user_id).eq("stage","queued");
      if(authError)throw new Error(authError.message);
    }
    if (!response.ok) console.error("Modal dispatch failed", response.status);
  } catch { console.error("Modal dispatch delayed; operation remains queued."); }
}
function adminBaseline(projectId:string,versionId:string) {
  return deploymentAdmin().from("model_onboarding").select("settings").eq("model_id",projectId).eq("model_version_id",versionId).maybeSingle();
}
export async function cancelOperation(id: string) {
  const op = await ownedOperation(id);
  if (op.stage === "ready") throw new Error("This evaluation has already completed.");
  const { error } = await deploymentAdmin().from("model_onboarding").update({ cancel_requested: true, stage: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("owner_user_id", op.owner_user_id);
  if (error) throw new Error(error.message);
}
export async function enqueueVersionEvaluation(projectId: string, versionId: string, selectedIds?: string[]) {
  if(!guidedEnabled())return null;
  await requireOwnedModel(projectId);
  const client=await createSupabaseServerClient();
  const {data:op,error}=await client.from("model_onboarding").select("*").eq("model_id",projectId).eq("model_version_id",versionId).maybeSingle();
  if(error)throw new Error(error.message);
  if(!op)return null;
  if(op.settings.deleting)throw new Error("This model is being deleted. Upload another model before evaluating.");
  if(["queued","validating","preparing","evaluating"].includes(op.stage))return op;
  const uploaded = op.stage === "draft" && op.settings.source === "upload" && Boolean(op.artifact_bytes);
  if(op.stage!=="ready" && !uploaded)throw new Error("Finish uploading this version’s model before evaluating.");
  if(op.lease_expires_at && new Date(op.lease_expires_at).getTime()>Date.now())throw new Error("The previous worker is finishing. Wait briefly before starting another evaluation.");
  const {data:tests,error:testError}=await client.from("test_cases").select("*").eq("model_id",projectId).eq("model_version_id",versionId);
  if(testError)throw new Error(testError.message);
  const selected=(tests || []).filter(t=>!selectedIds?.length||selectedIds.includes(t.id));
  if(!selected.length)throw new Error("Select tests saved for this model version.");
  const {data:reset,error:resetError}=await deploymentAdmin().from("model_onboarding").update({stage:"draft",evaluation_id:null,completed_tests:0,test_snapshot:selected,reviewed_at:null,cancel_requested:false,attempt:0}).eq("id",op.id).eq("owner_user_id",op.owner_user_id).eq("stage",op.stage).eq("updated_at",op.updated_at).is("lease_token",null).select("id").maybeSingle();
  if(resetError)throw new Error(resetError.message);
  if(!reset)throw new Error("Another request is already starting this evaluation. Follow your saved project progress.");
  await queueOperation(op.id);
  return ownedOperation(op.id);
}
export async function getUploadContext(id: string) {
  const op = await ownedOperation(id);
  if (op.stage !== "uploading" || op.cancel_requested || op.settings.deleting) throw new Error("This project is not accepting uploads. Continue setup first.");
  if (op.settings.artifactStorage !== "r2") throw new Error("This upload used the previous storage provider. Restart it from Upload Model to use R2.");
  const completed: string[] = [];
  for(const file of op.settings.files) {
    if (await artifactSize(op, file.path) === file.size) completed.push(file.path);
  }
  return { provider: "r2", files: op.settings.files, completed };
}

export async function completeModelUpload(id: string) {
  const op = await ownedOperation(id);
  if (op.stage !== "uploading" || op.settings.source !== "upload") throw new Error("This version is not accepting model files.");
  const context = await getUploadContext(id);
  if (context.completed.length !== op.settings.files.length) throw new Error("Upload is incomplete. Select the same folder to resume.");
  const { error } = await deploymentAdmin().from("model_onboarding").update({ stage: "draft", artifact_bytes: op.settings.files.reduce((sum, file) => sum + file.size, 0), updated_at: new Date().toISOString() }).eq("id", id).eq("owner_user_id", op.owner_user_id).eq("stage", "uploading");
  if (error) throw new Error(error.message);
}

export async function getModelRemovalBlockReason(operation: Onboarding) {
  const { data, error } = await deploymentAdmin().from("model_onboarding").select("stage,lease_expires_at,reserved_seconds").eq("owner_user_id", operation.owner_user_id).eq("model_id", operation.model_id).eq("baseline_version_id", operation.model_version_id).neq("id", operation.id);
  if (error) throw new Error(error.message);
  return modelRemovalBlockReason(operation, data || []);
}

export async function deleteUploadedModel(id: string) {
  const operation = await ownedOperation(id);
  const blocked = await getModelRemovalBlockReason(operation);
  if (blocked) throw new Error(blocked);
  const admin = deploymentAdmin();
  // Stop new uploads and jobs before removing files. Keep the record on failure so deletion can be retried.
  const { data: locked, error: lockError } = await admin.from("model_onboarding").update({ stage: "cancelled", cancel_requested: true, settings: { ...operation.settings, deleting: true }, updated_at: new Date().toISOString() }).eq("id", id).eq("owner_user_id", operation.owner_user_id).eq("updated_at", operation.updated_at).select("updated_at").maybeSingle();
  if (lockError) throw new Error(lockError.message);
  if (!locked) throw new Error("This model changed in another request. Refresh before deleting it.");
  // Hosted workers keep a second copy on their private volume. Remove it before dropping ownership metadata.
  const hasWorkerCopy = Boolean(operation.artifact_revision || operation.evaluation_id || operation.used_seconds > 0);
  if (operation.settings.source !== "api" && hasWorkerCopy) {
    if (process.env.MODAL_CONTROL_URL && process.env.MODAL_PROXY_TOKEN_ID && process.env.MODAL_PROXY_TOKEN_SECRET) {
      const response = await fetch(`${process.env.MODAL_CONTROL_URL}/delete-model`, { method: "POST", headers: { "Content-Type": "application/json", "Modal-Key": process.env.MODAL_PROXY_TOKEN_ID, "Modal-Secret": process.env.MODAL_PROXY_TOKEN_SECRET }, body: JSON.stringify({ operation_id: id, owner_user_id: operation.owner_user_id }), signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(response.status === 404 ? "The worker needs its model cleanup update. Ask the administrator to update the worker, then retry deletion." : "Worker model cleanup could not finish. Retry deletion after the worker stops.");
      const result = await response.json();
      if (result.deleted !== true) throw new Error("Worker model cleanup was not confirmed. Retry deletion.");
    } else throw new Error("Reconnect the worker service before deleting this hosted model.");
  }
  if (operation.settings.source === "upload") await removeArtifacts(operation);
  // Only remove the connection created by this deployment, leaving unrelated API configuration alone.
  const { error: configurationError } = await admin.from("model_version_configurations").delete().eq("model_version_id", operation.model_version_id).eq("credential_reference", `PRIVATE_${id.replaceAll("-", "_").toUpperCase()}`);
  if (configurationError) throw new Error(configurationError.message);
  // Credentials cascade with the operation; projects, versions, tests, and reports are retained.
  const { data: deleted, error } = await admin.from("model_onboarding").delete().eq("id", id).eq("owner_user_id", operation.owner_user_id).eq("updated_at", locked.updated_at).eq("cancel_requested", true).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!deleted) throw new Error("This model changed during deletion. Refresh and retry to finish cleanup.");
}
