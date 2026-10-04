"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Onboarding } from "@/lib/deployment/types";
import { getDeploymentGuidance } from "@/lib/deployment/guidance";

export function NextStep({ initial, report = false }: { initial: Onboarding; report?: boolean }) {
  const [operation, setOperation] = useState(initial);
  const [error, setError] = useState("");
  const router = useRouter();
  const guidance = getDeploymentGuidance(operation);
  const compareNext=report && operation.stage==="ready";
  useEffect(() => {
    if (!guidance.automatic) return;
    const controller = new AbortController();
    let checking=false;
    const timer = setInterval(async () => {
      if(checking)return;
      checking=true;
      try {
        const response = await fetch(`/api/onboarding/${initial.id}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) { setError("Progress is temporarily unavailable. Your saved job will continue; refresh to reconnect."); return; }
        const data = await response.json();
        setOperation(data.operation); setError("");
        if (["ready", "failed", "cancelled"].includes(data.operation.stage)) router.refresh();
      } catch { if (!controller.signal.aborted) setError("Reconnecting to your saved progress. You can leave and return."); }
      finally { checking=false; }
    }, 4000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [guidance.automatic, initial.id, router]);
  const nextHref = compareNext ? `/model-upload?project=${operation.model_id}` : guidance.href;
  return <section className="rounded-lg border border-stone-300 bg-stone-50 p-5" aria-label="Your next step">
    <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">Your next step</p>
    <div role="status" aria-live="polite"><h2 className="mt-2 text-lg font-semibold text-stone-950">{compareNext ? "Compare your next version" : guidance.title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{compareNext ? "Add an updated model and reuse your reviewed tests to measure what changed." : guidance.message}</p></div>
    {operation.stage === "evaluating" && <progress className="mt-3 w-full max-w-md" value={operation.completed_tests} max={operation.total_tests || 1} aria-label="Completed tests" />}
    {["failed","cancelled"].includes(operation.stage) && operation.evaluation_id && <Link className="mt-3 block text-sm text-stone-600 underline" href={`/reports/${operation.evaluation_id}`}>Review saved results ({operation.completed_tests} cases completed)</Link>}
    {nextHref && <Link className="mt-4 inline-flex rounded-md bg-stone-950 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2" href={nextHref} onClick={() => { if (operation.stage === "ready") void fetch(`/api/onboarding/${operation.id}`, { method: "POST", keepalive:true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review" }) }); }}>{compareNext ? "Upload another version" : guidance.action}</Link>}
    {guidance.automatic && <button type="button" className="mt-4 block text-sm text-stone-600 underline" onClick={async () => { const response = await fetch(`/api/onboarding/${operation.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }) }); const data = await response.json(); if (response.ok) setOperation(data.operation); else setError(data.error); }}>Cancel evaluation</button>}
    {error && <p className="mt-2 text-sm text-rose-700" role="alert">{error}</p>}
  </section>;
}
