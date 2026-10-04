"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import type { ModelUpload } from "@/lib/deployment/upload-client";
import { generateTestCasesAction } from "@/app/test-case-generator/actions";
import { parseAndValidateTestCasesCsv } from "@/lib/data/test-case-csv";
import { emptySettings, type ModelSettings, type Onboarding } from "@/lib/deployment/types";
import { uploadModelFiles } from "@/lib/deployment/upload-client";
import { validateManifest, validateModelConfig } from "@/lib/deployment/validation";

const inputClass = "w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-stone-600 disabled:bg-stone-100";
const template = 'stable_key,name,category,input,expected_output,evaluator_type,threshold,severity,tags\nhello,Greeting,basic,Hello,Hello,contains,1,LOW,basic';
export function GuidedProjectForm({ owner, initial, project, version: initialVersion, infrastructure, initialCsv = "", initialSource, versionId }: { owner: string; initial: Onboarding | null; project: { id: string; name: string; purpose: string } | null; version: string; infrastructure: { worker: boolean; hosted: boolean; message: string }; initialCsv?: string; initialSource?: ModelSettings["source"]; versionId?: string }) {
  const router = useRouter(); const { session } = useSession();
  const key = useRef(""); const form = useRef<HTMLFormElement>(null);
  const activeUpload = useRef<ModelUpload | null>(null);
  const mounted = useRef(true);
  const errorSummary = useRef<HTMLParagraphElement>(null);
  const [operation, setOperation] = useState(initial);
  const [name, setName] = useState(project?.name || ""); const [purpose, setPurpose] = useState(project?.purpose || "");
  const [version, setVersion] = useState(initialVersion);
  const [settings, setSettings] = useState<ModelSettings>({...(initial?.settings || emptySettings), source: versionId ? "upload" : initial?.settings.source || initialSource || (infrastructure.hosted ? "upload" : "api")});
  const [credential, setCredential] = useState(""); const [csv, setCsv] = useState(initialCsv);
  const [files, setFiles] = useState<File[]>([]); const [error, setError] = useState("");
  const [busy, setBusy] = useState(false); const [uploadBytes, setUploadBytes] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [invalidField, setInvalidField] = useState("");
  useEffect(() => {
    mounted.current = true;
    const target = !name.trim() ? "name" : settings.source === "upload" ? "folder" : settings.source === "huggingface" && !settings.repository ? "repository" : settings.source === "api" && !settings.endpoint ? "endpoint" : !csv.trim() ? "csv" : null;
    if(target)form.current?.querySelector<HTMLElement>(`[name=${target}]`)?.focus();
    return () => { mounted.current = false; void activeUpload.current?.abort(); };
    // Initial values determine where a saved draft reopens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function invalid(field: string, message: string) {
    setInvalidField(field); setError(message);
    form.current?.querySelector<HTMLElement>(`[name=${field}]`)?.focus();
  }
  const preview = useMemo(()=>csv.trim() ? parseAndValidateTestCasesCsv(csv) : null,[csv]);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const change = <K extends keyof ModelSettings>(field: K, value: ModelSettings[K]) => setSettings(old => ({ ...old, [field]: value }));
  async function selectFiles(selected: File[]) {
    try {
      const manifest = selected.map(file => ({ path: file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(1).join("/") : file.name, size: file.size, modified:file.lastModified }));
      const issue = validateManifest(manifest); if (issue) throw new Error(issue);
      const config = selected[manifest.findIndex(f => f.path === "config.json")];
      const configIssue = validateModelConfig(JSON.parse(await config.text())); if (configIssue) throw new Error(configIssue);
      setFiles(selected); change("files", manifest); change("displayName", selected[0]?.webkitRelativePath.split("/")[0] || "Uploaded model"); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Model files could not be checked."); }
  }
  async function uploadModel(op: Onboarding) {
    if (!session || session.user.id !== owner) throw new Error("Your account changed. Reload before uploading.");
    await uploadModelFiles({ operation: op, files, manifest: settings.files, owner,
      getToken: () => session.getToken(), onProgress: setUploadBytes,
      onUpload: upload => { activeUpload.current = upload; }, isActive: () => mounted.current,
      completionAction: versionId ? "complete-upload" : "start",
    });
  }

  async function submit(intent: "draft" | "evaluate" | "upload") {
    if (busy) return;
    setError("");
    setInvalidField("");
    if (!name.trim() || !version.trim()) { invalid(!name.trim()?"name":"version", "Enter your project name and version."); return; }
    if (intent === "evaluate" && preview?.errors.length) { invalid("csv", "Review the CSV errors and fill in every expected answer."); return; }
    if ((intent === "evaluate" || intent === "upload") && settings.source === "upload" && !files.length && !operation?.evaluation_id) { invalid("folder", "Select the complete model folder to upload or resume."); return; }
    if (intent === "evaluate" && settings.source === "huggingface" && !/^[\w.-]+\/[\w.-]+$/.test(settings.repository)) { invalid("repository", "Enter a Hugging Face repository as owner/model."); return; }
    if (intent === "evaluate" && settings.source === "api" && !/^https:\/\//.test(settings.endpoint)) { invalid("endpoint", "Enter the full HTTPS chat-completions URL."); return; }
    if (intent === "evaluate" && settings.source === "api" && !settings.model.trim()) { invalid("model", "Enter your API’s exact model identifier."); return; }
    if (intent === "evaluate" && !csv.trim() && !(project && settings.reuseTests)) { invalid("csv", "Add a test CSV with reviewed expected answers."); return; }
    setBusy(true);
    try {
      key.current ||= crypto.randomUUID();
      const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, purpose, version, projectId: project?.id, versionId, operationId: operation?.id, idempotencyKey: key.current, settings, csv, credential, intent }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      const op: Onboarding = data.operation; setOperation(op); setCredential("");
      if (op.stage === "failed") throw new Error(op.error || "Review your setup before continuing.");
      if (op.stage === "uploading") await uploadModel(op);
      if(mounted.current){router.push(`/projects/${op.model_id}`); router.refresh();}
    } catch (e) { setError(e instanceof Error ? e.message : "Setup could not complete. Your saved progress remains available."); requestAnimationFrame(()=>errorSummary.current?.focus()); }
    finally { setBusy(false); }
  }
  return <form ref={form} className="space-y-6" onSubmit={e => { e.preventDefault(); void submit(versionId ? "upload" : "evaluate"); }} aria-busy={busy}>
    {!versionId && <section className="rounded-lg border border-stone-200 bg-white p-6"><h2 className="text-lg font-semibold">1. Describe your project <span className="ml-2 text-xs font-normal text-stone-500">{name.trim() && version.trim() ? "Complete" : "Required"}</span></h2><div className="mt-5 grid gap-4 sm:grid-cols-[1fr_140px]"><label className="space-y-2 text-sm">Project name<input className={inputClass} name="name" value={name} onChange={e => setName(e.target.value)} disabled={busy || !!project} maxLength={120} /></label><label className="space-y-2 text-sm">Version<input className={inputClass} name="version" value={version} onChange={e => setVersion(e.target.value)} disabled={busy || !!initial} maxLength={80} /></label></div><label className="mt-4 block space-y-2 text-sm">What should your model do?<textarea className={inputClass} value={purpose} onChange={e => setPurpose(e.target.value)} rows={3} disabled={busy} maxLength={1000} /></label></section>}
    <section className="rounded-lg border border-stone-200 bg-white p-6"><h2 className="text-lg font-semibold">{versionId ? "Upload your model" : "2. Add your model"} <span className="ml-2 text-xs font-normal text-stone-500">{settings.source === "upload" ? settings.files.length ? "Compatible folder selected" : "Required" : settings.source === "api" ? settings.endpoint && settings.model ? "Connection details entered" : "Required" : settings.repository ? "Repository entered; compatibility checked during preparation" : "Required"}</span></h2>{["folder","repository","endpoint","model"].includes(invalidField) && <p className="mt-2 text-sm text-rose-700">{error}</p>}<p className="mt-2 text-sm leading-6 text-stone-600">Your model is saved for the selected project version.</p>{!versionId && <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Model source">{([['upload','Upload model folder'],['huggingface','Import from Hugging Face'],['api','Connect existing API']] as const).map(([value,label]) => <button key={value} type="button" disabled={busy} aria-pressed={settings.source === value} className={`rounded-md border px-3 py-2 text-sm focus-visible:ring-2 ${settings.source === value ? "border-stone-950 bg-stone-950 text-white" : "border-stone-300 text-stone-600"}`} onClick={() => change("source", value)}>{label}</button>)}</div>}
      {settings.source === "upload" && <div className="mt-4 rounded-md border border-dashed border-stone-300 bg-stone-50 p-5"><p className="text-sm leading-6">Select a complete Llama, Mistral, or Qwen2 model folder with config.json, tokenizer files, and all Safetensors weights. Custom Python code, archives, and quantized packages are unsupported.</p><label className="mt-3 block text-sm font-medium">Choose or replace model folder<input className="mt-2 block w-full text-sm" name="folder" aria-invalid={invalidField === "folder"} type="file" multiple {...{ webkitdirectory: "", directory: "" }} disabled={busy} onChange={e => void selectFiles(Array.from(e.target.files || []))} /></label><p className="mt-3 text-sm text-stone-600">{settings.files.length ? `${settings.files.length} files · ${(settings.files.reduce((n,f) => n+f.size,0)/1e9).toFixed(2)} GB` : "Model not selected yet."}</p><p className="mt-2 text-xs text-stone-500">Serving profile: A100 80 GB · up to 4,096 context tokens · idle workers stop automatically. The administrator funds hosting through your deployment allowance.</p></div>}
      {settings.source === "huggingface" && <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm">Repository<input className={inputClass} name="repository" aria-invalid={invalidField === "repository"} value={settings.repository} placeholder="organization/model-name" disabled={busy} onChange={e => change("repository",e.target.value)} /></label><label className="space-y-2 text-sm">Revision<input className={inputClass} value={settings.revision} disabled={busy} onChange={e => change("revision",e.target.value)} /><span className="text-xs text-stone-500">We pin this to an exact commit before evaluation.</span></label></div>}
      {settings.source === "api" && <div className="mt-4 grid gap-4"><label className="space-y-2 text-sm">Full chat-completions URL<input className={inputClass} name="endpoint" aria-invalid={invalidField === "endpoint"} type="url" value={settings.endpoint} disabled={busy} placeholder="https://your-provider.com/v1/chat/completions" onChange={e => change("endpoint",e.target.value)} /></label><label className="space-y-2 text-sm">Exact model identifier<input className={inputClass} name="model" aria-invalid={invalidField === "model"} value={settings.model} disabled={busy} onChange={e => change("model",e.target.value)} /></label></div>}
      {settings.source !== "upload" && <label className="mt-4 block space-y-2 text-sm">{settings.source === "api" ? "Private API key" : "Hugging Face token (for private or gated models)"}<input className={inputClass} type="password" autoComplete="new-password" value={credential} disabled={busy} onChange={e => setCredential(e.target.value)} placeholder={operation ? "Leave blank to keep saved credentials" : "Stored privately; never shown in reports"} /></label>}
      <details className="mt-4 text-sm"><summary className="cursor-pointer text-stone-600">Advanced instructions</summary><label className="mt-3 block space-y-2">System prompt<textarea className={inputClass} value={settings.systemPrompt} onChange={e => change("systemPrompt",e.target.value)} disabled={busy} rows={3} /></label></details>
    </section>
    {!versionId && <section className="rounded-lg border border-stone-200 bg-white p-6"><h2 className="text-lg font-semibold">3. Add your tests <span className="ml-2 text-xs font-normal text-stone-500">{preview?.rows.length && !preview.errors.length ? `${preview.rows.length} reviewed cases` : "Expected answers required"}</span></h2><p className="mt-2 text-sm leading-6 text-stone-600">Use questions and expected answers that describe what your model should do.</p>
      {project && !initial && <label className="mt-4 flex gap-2 text-sm"><input type="checkbox" checked={settings.reuseTests} disabled={busy} onChange={e => change("reuseTests",e.target.checked)} />Reuse the current version’s tests. If there is no comparable baseline report, we’ll evaluate both versions automatically.</label>}
      <div className="mt-4 flex flex-wrap items-center gap-3"><label className="text-sm">Upload test CSV<input type="file" accept=".csv,text/csv" className="mt-2 block text-sm" disabled={busy} onChange={async e => { const file=e.target.files?.[0]; if (file) { if(file.size>4_000_000){setError("Use a test CSV smaller than 4 MB.");return;} setCsv(await file.text()); } }} /></label><a className="text-sm underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`} download="modelledger-tests.csv">Download template</a><button type="button" disabled={busy || generating || !purpose.trim()} className="rounded-md border border-stone-300 px-3 py-2 text-sm disabled:opacity-50" onClick={async () => { setGenerating(true); try { const result=await generateTestCasesAction({ modelContext: purpose, message: `Generate tests for ${name}: ${purpose}`, testCaseCount:5, allowMissingContext:false }); if(result.status==="success") {setCsv(result.csv); setError("Fill in the blank expected_output values before evaluating.");} else setError(result.message); } finally {setGenerating(false);} }}>{generating ? "Generating…" : "Generate test prompts"}</button></div>
      <label className="mt-4 block space-y-2 text-sm">Review CSV and expected answers<textarea name="csv" className={`${inputClass} font-mono text-xs`} rows={6} value={csv} onChange={e=>setCsv(e.target.value)} disabled={busy} aria-invalid={invalidField === "csv" || !!preview?.errors.length} /></label>
      {!!preview?.errors.length && <ul className="mt-3 space-y-1 text-sm text-rose-700">{preview.errors.slice(0,5).map((e,i)=><li key={i}>Row {e.row}: {e.message}</li>)}</ul>}
      {!!preview?.rows.length && <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="pb-2 text-left text-stone-500">Test preview · {preview.rows.length} cases</caption><thead><tr><th className="p-2">Question</th><th className="p-2">Expected answer</th></tr></thead><tbody>{preview.rows.slice(0,5).map((test,i)=><tr key={i} className="border-t border-stone-100"><td className="p-2">{test.input}</td><td className="p-2">{test.expectedOutput}</td></tr>)}</tbody></table></div>}
    </section>}
    <div className="rounded-lg bg-stone-100 p-5"><p className="text-sm text-stone-600">{versionId ? "Upload your model now. Add tests and generate a report whenever you are ready." : infrastructure.message}</p><p className="mt-2 text-sm font-medium">{name || "Your project"} · {version || "V1"} · {preview?.rows.length || (project && settings.reuseTests ? "Shared" : 0)} tests</p>{busy && totalBytes>0 && <div role="status" className="mt-3"><progress className="w-full" value={uploadBytes} max={totalBytes} /><p className="text-xs">{(uploadBytes/1e9).toFixed(2)} of {(totalBytes/1e9).toFixed(2)} GB uploaded. Keep this page open until the upload finishes.</p></div>}{error && <p ref={errorSummary} tabIndex={-1} role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}{operation && error && <a href={`/projects/${operation.model_id}`} className="mt-2 block text-sm underline">Open saved project</a>}<div className="mt-4 flex flex-wrap gap-3"><button className="rounded-md bg-stone-950 px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" disabled={busy || (!versionId && (!infrastructure.worker || (!infrastructure.hosted && settings.source !== "api")))}>{busy ? "Saving and preparing…" : project && !initial ? "Prepare version and compare" : "Prepare model and evaluate"}</button>{!versionId && <button type="button" className="rounded-md border border-stone-300 px-4 py-3 text-sm disabled:opacity-50" disabled={busy} onClick={()=>void submit("draft")}>Save draft</button>}</div></div>
  </form>;
}
