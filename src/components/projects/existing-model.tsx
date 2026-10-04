"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileBox, Trash2, Upload } from "lucide-react";
import { GuidedProjectForm } from "./guided-project-form";
import { savedModelDetails } from "@/lib/deployment/model-management";
import type { Onboarding } from "@/lib/deployment/types";

export function ExistingModel({ operation, owner, project, version, blockedReason, infrastructure }: {
  operation: Onboarding; owner: string; project: { id: string; name: string; purpose: string };
  version: { id: string; version: string }; blockedReason: string | null;
  infrastructure: { worker: boolean; hosted: boolean; message: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"delete" | "replace" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const [removed, setRemoved] = useState<"delete" | "replace" | null>(null);
  const [resume, setResume] = useState(false);
  const details = savedModelDetails(operation);
  const active = ["queued", "validating", "preparing", "evaluating"].includes(operation.stage);
  const destination = `/model-upload?project=${project.id}&version=${version.id}`;
  useEffect(() => {
    if (!blockedReason) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [blockedReason, router]);

  async function remove(intent: "delete" | "replace") {
    if (busy) return;
    setBusy(intent); setError("");
    try {
      const response = await fetch(`/api/onboarding/${operation.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRemoved(intent);
      // Drop the deleted operation ID from old resume links before refreshing the page.
      router.replace(destination);
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Model could not be deleted."); }
    finally { setBusy(null); }
  }

  async function stopEvaluation() {
    if (busy) return;
    setBusy("cancel"); setError("");
    try {
      const response = await fetch(`/api/onboarding/${operation.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Evaluation could not be stopped."); }
    finally { setBusy(null); }
  }

  if (removed) return <div className="space-y-5"><p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{removed === "replace" ? "Previous model deleted. Choose another model folder below." : "Model deleted. Your project, version, tests, and saved reports are still available."}</p><GuidedProjectForm owner={owner} project={project} version={version.version} versionId={version.id} initial={null} initialSource="upload" infrastructure={infrastructure} /></div>;

  return <div className="space-y-5">
    <section className="space-y-5 rounded-lg border border-stone-200 bg-white p-6" aria-label="Existing model">
      <div className="flex items-start gap-3"><FileBox className="mt-1 size-5 text-stone-500" aria-hidden="true" /><div><p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Existing model</p><h2 className="mt-1 text-lg font-semibold text-stone-950">{details.name}</h2><p className="mt-1 text-sm text-stone-600">{project.name} · {version.version}</p></div></div>
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div><dt className="text-stone-500">Model source</dt><dd className="mt-1 font-medium">{operation.settings.source === "upload" ? "Uploaded folder" : operation.settings.source === "huggingface" ? "Hugging Face repository" : "Connected API"}</dd></div>
        <div><dt className="text-stone-500">Files and size</dt><dd className="mt-1 font-medium">{operation.settings.source === "api" ? "API connection" : `${details.fileCount} files · ${(details.bytes / 1e9).toFixed(2)} GB`}</dd></div>
        <div><dt className="text-stone-500">Status</dt><dd className="mt-1 font-medium">{operation.settings.deleting ? "Deletion needs to finish" : active ? operation.stage.charAt(0).toUpperCase() + operation.stage.slice(1) : details.complete ? "Model saved" : "Upload incomplete"}</dd></div>
        <div><dt className="text-stone-500">Saved</dt><dd className="mt-1 font-medium">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(operation.created_at))}</dd></div>
        {operation.artifact_revision && <div className="sm:col-span-2"><dt className="text-stone-500">Model revision</dt><dd className="mt-1 break-all font-mono text-xs">{operation.artifact_revision}</dd></div>}
      </dl>
      {!!operation.settings.files.length && <details><summary className="cursor-pointer text-sm font-medium text-stone-700">View model files ({details.fileCount})</summary><ul className="mt-3 max-h-56 space-y-2 overflow-y-auto rounded-md bg-stone-50 p-3 text-xs text-stone-600">{operation.settings.files.map(file => <li key={file.path} className="flex justify-between gap-4"><span className="break-all">{file.path}</span><span className="shrink-0">{(file.size / 1e6).toFixed(2)} MB</span></li>)}</ul></details>}
      {operation.evaluation_id && <Link className="inline-block text-sm font-medium underline" href={`/reports/${operation.evaluation_id}`}>View saved report</Link>}
      {operation.error && !operation.settings.deleting && <p className="text-sm text-rose-700">{operation.error}</p>}
      <div className="border-t border-stone-100 pt-4"><p className="text-sm leading-6 text-stone-600">Deleting removes this model’s files and connection. Your project, version, test cases, and saved reports stay available. A replacement model will be saved under {version.version}.</p>
        {blockedReason && <p role="status" className="mt-3 text-sm text-amber-800">{blockedReason}</p>}
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={!!busy || !!blockedReason} onClick={() => void remove("delete")} className="inline-flex items-center gap-2 rounded-md border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="size-4" aria-hidden="true" />{busy === "delete" ? "Deleting model…" : "Delete model"}</button>
          <button type="button" disabled={!!busy || !!blockedReason} onClick={() => void remove("replace")} className="inline-flex items-center gap-2 rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"><Upload className="size-4" aria-hidden="true" />{busy === "replace" ? "Deleting previous model…" : "Delete and upload another model"}</button>
          {!details.complete && !operation.settings.deleting && <button type="button" disabled={!!busy || !!blockedReason} onClick={() => setResume(true)} className="rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50">Resume upload</button>}
          {active && <button type="button" disabled={!!busy} onClick={() => void stopEvaluation()} className="rounded-md border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-50">{busy === "cancel" ? "Stopping evaluation…" : "Stop evaluation"}</button>}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </section>
    {resume && <GuidedProjectForm owner={owner} project={project} version={version.version} versionId={version.id} initial={operation} initialSource="upload" infrastructure={infrastructure} />}
  </div>;
}
