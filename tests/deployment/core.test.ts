import { modelRemovalBlockReason, savedModelDetails } from "../../src/lib/deployment/model-management";
import { uploadModelFiles } from "../../src/lib/deployment/upload-client";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { getDeploymentGuidance } from "../../src/lib/deployment/guidance";
import { emptySettings, type Onboarding, type DeploymentStage } from "../../src/lib/deployment/types";
import { validateManifest, validateModelConfig, settingsSignature } from "../../src/lib/deployment/validation";
import { isPublicAddress, assertPublicEndpoint } from "../../src/lib/deployment/network";
import { encryptCredential, decryptCredential } from "../../src/lib/deployment/crypto";
import { OpenAiCompatibleExecutor, resolveModelName, resolveOperatorCredential } from "../../src/lib/evaluation/providers";
import { sameTestDefinition } from "../../src/lib/evaluation/regression";
import type { EvaluationFact } from "../../src/lib/evaluation/types";
import { runAutomaticEvaluation } from "../../src/lib/evaluation/orchestrator";

const operation: Onboarding = { id:"operation",owner_user_id:"user_a",model_id:"project",model_version_id:"version",idempotency_key:"key",stage:"draft",settings:emptySettings,error:null,completed_tests:0,total_tests:5,evaluation_id:"report",baseline_version_id:null,artifact_revision:null,worker_id:null,lease_token:null,lease_expires_at:null,attempt:0,reserved_seconds:0,used_seconds:0,cancel_requested:false,reviewed_at:null,created_at:"",updated_at:"" };
test("changed prompts, expected answers and criteria are excluded from direct comparisons",()=>{
  const fact={inputSnapshot:"Hello",expectedResult:"Hello",criteriaSnapshot:"contains:1"} as EvaluationFact;
  assert.equal(sameTestDefinition(fact,{...fact}),true);
  assert.equal(sameTestDefinition(fact,{...fact,inputSnapshot:"Bye"}),false);
  assert.equal(sameTestDefinition(fact,{...fact,expectedResult:"Bye"}),false);
  assert.equal(sameTestDefinition(fact,{...fact,criteriaSnapshot:"exact:1"}),false);
});
test("resuming setup ignores database property order and folder listing order",()=>{
  const settings={...emptySettings,files:[{path:"config.json",size:10,modified:100},{path:"model.safetensors",size:20,modified:100}]};
  const restored=Object.fromEntries(Object.entries(settings).reverse()) as typeof settings;
  restored.files=[...settings.files].reverse();
  assert.equal(settingsSignature(settings),settingsSignature(restored));
  assert.notEqual(settingsSignature(settings),settingsSignature({...settings,model:"different"}));
});
test("server credentials cannot be selected arbitrarily or sent to another host",()=>{
  const original=process.env.NVIDIA_API_KEY;
  try {
    process.env.NVIDIA_API_KEY="operator-test-key";
    assert.equal(resolveOperatorCredential("NVIDIA_API_KEY","https://integrate.api.nvidia.com/v1/chat/completions"),"operator-test-key");
    assert.equal(resolveOperatorCredential("NVIDIA_API_KEY","https://attacker.example.com/v1/chat/completions"),null);
    assert.equal(resolveOperatorCredential("SUPABASE_SERVICE_ROLE_KEY","https://integrate.api.nvidia.com"),null);
  } finally { if(original)process.env.NVIDIA_API_KEY=original;else delete process.env.NVIDIA_API_KEY; }
});
test("every setup stage has a clear next action or explicit automatic continuation",()=>{
  for(const stage of ["draft","uploading","validating","queued","preparing","evaluating","ready","failed","cancelled"] as DeploymentStage[]) {
    const guidance=getDeploymentGuidance({...operation,stage});
    assert.ok(guidance.title);assert.ok(guidance.message);
    if(guidance.automatic){assert.equal(guidance.action,null);assert.equal(guidance.href,null);}
    else {assert.ok(guidance.action);assert.ok(guidance.href);}
  }
  assert.match(getDeploymentGuidance({...operation,stage:"evaluating",completed_tests:3}).message,/3 of 5/);
  assert.match(getDeploymentGuidance({...operation,stage:"failed",error:"Missing tokenizer"}).message,/Missing tokenizer/);
  assert.equal(getDeploymentGuidance({...operation,stage:"ready"}).href,"/reports/report");
  assert.match(getDeploymentGuidance({...operation,stage:"ready",baseline_version_id:"baseline"}).href!,/^\/compare\?/);
  assert.match(getDeploymentGuidance({...operation,stage:"ready",reviewed_at:"now"}).href!,/project=project/);
});
test("model validation rejects traversal, incomplete shards manifests, and unsupported runtimes",()=>{
  const files=[{path:"config.json",size:10},{path:"tokenizer.json",size:20},{path:"model.safetensors",size:100}];
  assert.equal(validateManifest(files),null);
  assert.ok(validateManifest(files.slice(1)));assert.ok(validateManifest([...files,{path:"../secret",size:1}]));
  assert.ok(validateManifest([...files,{path:"custom.py",size:1}]));assert.ok(validateManifest([...files,files[0]]));
  assert.equal(validateModelConfig({model_type:"llama"}),null);
  assert.ok(validateModelConfig({model_type:"llama",auto_map:{}}));assert.ok(validateModelConfig({model_type:"bert"}));
});
test("endpoint validation excludes private networks, mapped IPv6, non-HTTPS and embedded credentials",async()=>{
  for(const address of ["127.0.0.1","10.0.0.1","172.16.0.1","192.168.1.1","169.254.169.254","::1","fc00::1","::ffff:127.0.0.1","100.64.0.1","0.0.0.0"]){assert.equal(isPublicAddress(address),false,address);}
  assert.equal(isPublicAddress("8.8.8.8"),true);assert.equal(isPublicAddress("2606:4700:4700::1111"),true);
  await assert.rejects(assertPublicEndpoint("http://example.com"));await assert.rejects(assertPublicEndpoint("https://key:secret@example.com"));await assert.rejects(assertPublicEndpoint("https://127.0.0.1"));
});
test("private credentials are encrypted and reject tampering",()=>{
  const original=process.env.MODEL_CREDENTIAL_KEY_V1;
  try {process.env.MODEL_CREDENTIAL_KEY_V1=randomBytes(32).toString("base64");const encrypted=encryptCredential("private-key");assert.ok(!encrypted.includes("private-key"));assert.equal(decryptCredential(encrypted),"private-key");const parts=encrypted.split(":");parts[3]=Buffer.from("tampered").toString("base64");assert.throws(()=>decryptCredential(parts.join(":")));}
  finally{if(original)process.env.MODEL_CREDENTIAL_KEY_V1=original;else delete process.env.MODEL_CREDENTIAL_KEY_V1;}
});
test("the executor preserves exact model selection and prevents settings overriding it",async()=>{
  assert.equal(resolveModelName("nvidia-nim","deepseek-ai/deepseek-v4.1-flash"),"deepseek-ai/deepseek-v4.1-flash");
  assert.equal(resolveModelName("openai","llama-3.3-70b-custom"),"llama-3.3-70b-custom");
  let body: Record<string,unknown>={};
  const executor=new OpenAiCompatibleExecutor({resolveCredential:async()=>"secret",fetch:async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify({choices:[{message:{content:"Hello"}}]}));}});
  await executor.execute({configuration:{modelVersionId:"v",provider:"openai-compatible",modelName:"my-model",baseUrl:"https://example.com/v1",endpointUrl:null,systemPrompt:"",temperature:0,maxTokens:20,providerSettings:{model:"wrong",messages:[]},credentialReference:"private"},testCase:{id:"t",stableKey:"t",modelId:"p",name:"Hello",category:"basic",input:"Hi",expectedOutput:"Hello",evaluationCriteria:{},evaluatorType:"exact_match",threshold:1,severity:"LOW",tags:[]}});
  assert.equal(body.model,"my-model");assert.equal((body.messages as unknown[]).length,1);
});
test("resuming an evaluation reuses checkpoints without invoking the model",async()=>{
  let executions=0;let creates=0;
  const result=await runAutomaticEvaluation({modelId:"p",modelVersionId:"v",name:"Resume",configuration:{modelVersionId:"v",provider:"openai-compatible",modelName:"model",baseUrl:null,endpointUrl:null,systemPrompt:null,temperature:0,maxTokens:1,providerSettings:{},credentialReference:"key"},testCases:[{id:"t",stableKey:"t",modelId:"p",name:"Test",category:"basic",input:"Hi",expectedOutput:"Hello",evaluationCriteria:{},evaluatorType:"exact_match",threshold:1,severity:"LOW",tags:[]}],executor:{execute:async()=>{executions++;throw new Error("Should not execute");}},repository:{createRun:async()=>({id:"r",evaluated_at:"2026-01-01"}),findCheckpoint:async()=>({execution:{output:"Hello",latencyMs:1,tokenUsage:{inputTokens:1,outputTokens:1,totalTokens:2},estimatedCostUsd:null,providerMetadata:null,status:"SUCCESS",error:null},evaluation:{score:1,passed:true,reason:"Match",evidence:{},evaluatorType:"exact_match",status:"SUCCESS"}}),createResult:async()=>{creates++;return{id:"result"};},updateRun:async()=>{}}});
  assert.equal(executions,0);assert.equal(creates,0);assert.equal(result.counters.passedCount,1);
});

 test("uploaded models lead to evaluation for the selected existing version", () => {
  const saved = { ...operation, stage: "draft" as const, artifact_bytes: 130, evaluation_id: null };
  const guidance = getDeploymentGuidance(saved);
  assert.equal(guidance.title, "Model uploaded");
  assert.equal(guidance.href, "/run-evaluation?project=project&version=version");
  assert.equal(guidance.automatic, false);
  assert.equal(getDeploymentGuidance({ ...saved, stage: "uploading" }).href, "/model-upload?operation=operation");
 });

test("completed model files resume without reuploading and finish without starting evaluation", async () => {
  const original = globalThis.fetch;
  const actions: string[] = [];
  const progress: number[] = [];
  const file = new File(["model"], "model.safetensors");
  const manifest = [{ path: file.name, size: file.size }];
  try {
    globalThis.fetch = async (_url, init) => {
      const action = JSON.parse(String(init?.body)).action;
      actions.push(action);
      return new Response(JSON.stringify(action === "upload" ? { files: manifest, completed: [file.name] } : {}));
    };
    await uploadModelFiles({ operation, files: [file], manifest, owner: "user_a", getToken: async () => null,
      onProgress: bytes => progress.push(bytes), onUpload: () => {}, isActive: () => true });
    assert.deepEqual(actions, ["upload", "complete-upload"]);
    assert.deepEqual(progress, [file.size]);
  } finally { globalThis.fetch = original; }
});
test("a mismatched model folder never marks an upload complete", async () => {
  const original = globalThis.fetch;
  const actions: string[] = [];
  try {
    globalThis.fetch = async (_url, init) => {
      actions.push(JSON.parse(String(init?.body)).action);
      return new Response(JSON.stringify({ files: [{ path: "other.safetensors", size: 5 }], completed: [] }));
    };
    const file = new File(["model"], "model.safetensors");
    await assert.rejects(uploadModelFiles({ operation, files: [file], manifest: [{ path: file.name, size: file.size }], owner: "user_a", getToken: async () => null, onProgress: () => {}, onUpload: () => {}, isActive: () => true }), /original model folder/);
    assert.deepEqual(actions, ["upload"]);
  } finally { globalThis.fetch = original; }
});

test("model deletion is available for saved evaluations but waits for running workers and baseline users", () => {
  const saved = { ...operation, stage: "ready" as const };
  assert.equal(modelRemovalBlockReason(saved), null);
  assert.match(modelRemovalBlockReason({ ...saved, stage: "evaluating" })!, /Stop the current evaluation/);
  assert.match(modelRemovalBlockReason({ ...saved, stage: "cancelled", lease_expires_at: "2099-01-01T00:00:00Z" })!, /worker is finishing/);
  assert.match(modelRemovalBlockReason({ ...saved, reserved_seconds: 60 })!, /worker is finishing/);
  assert.match(modelRemovalBlockReason(saved, [{ stage: "queued", lease_expires_at: null, reserved_seconds: 0 }])!, /baseline/);
  assert.match(modelRemovalBlockReason(saved, [{ stage: "cancelled", lease_expires_at: null, reserved_seconds: 60 }])!, /baseline/);
  assert.equal(modelRemovalBlockReason(saved, [{ stage: "ready", lease_expires_at: null, reserved_seconds: 0 }]), null);
});
test("existing model details show the folder name, total size, and incomplete upload state", () => {
  const saved = { ...operation, evaluation_id: null, settings: { ...emptySettings, displayName: "my-qwen-model", files: [{ path: "config.json", size: 10 }, { path: "model.safetensors", size: 100 }] } };
  assert.deepEqual(savedModelDetails(saved), { name: "my-qwen-model", fileCount: 2, bytes: 110, complete: false });
  assert.equal(savedModelDetails({ ...saved, artifact_bytes: 110 }).complete, true);
  assert.equal(savedModelDetails({ ...saved, evaluation_id: "historical-report" }).complete, true);
  assert.equal(getDeploymentGuidance({ ...saved, settings: { ...saved.settings, deleting: true } }).action, "Manage model");
});
