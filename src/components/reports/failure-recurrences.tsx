import Link from "next/link";
import { DetailSection } from "@/components/evaluations/detail-section";
import type { FailureRecurrence } from "@/lib/evaluation/recurrence";
import type { VersionChangeInput } from "@/lib/evaluation/types";

function Changes({ changes, title }: { changes: VersionChangeInput[]; title: string }) {
  return <div><h4 className="text-sm font-semibold">{title}</h4>
    {changes.length ? <ul className="mt-2 space-y-2">{changes.map((change) => <li key={change.id} className="rounded-md bg-stone-50 p-3 text-sm">
      <p className="font-medium">{change.field_name ?? change.change_type}: {change.description}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div><p className="text-xs text-stone-500">Before</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">{change.previous_value ?? "Not recorded"}</pre></div>
        <div><p className="text-xs text-stone-500">After</p><pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">{change.new_value ?? "Not recorded"}</pre></div>
      </div>
    </li>)}</ul> : <p className="mt-2 text-sm text-stone-600">No change record available for this version before its run.</p>}
  </div>;
}

export function FailureRecurrences({ recurrences, projectId, sample = false }: { recurrences: FailureRecurrence[]; projectId: string; sample?: boolean }) {
  if (!recurrences.length) return null;
  return <DetailSection label="SEEN BEFORE" title="Failures that returned" description="Matches use the same test identity, input, expected output, and evaluation criteria. Each linked run executed and evaluated successfully.">
    <div className="space-y-5">{recurrences.map((item) => {
      const rerun = (versionId: string) => `/run-evaluation?${new URLSearchParams({ project: projectId, version: versionId, testKey: item.testKey })}`;
      return <article key={item.current.id} className="rounded-md border border-stone-200 p-4">
        <h3 className="font-semibold text-stone-950">{item.testName}</h3><p className="mt-2 text-sm">{item.summary}</p>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">{[{ label: "Earlier failure", fact: item.previousFailure }, { label: "First passing run", fact: item.firstPassing }, { label: "Current failure", fact: item.current }].map(({ label, fact }) => {
          return <li key={`${label}-${fact.id}`} className="rounded-md bg-stone-50 p-3">
            <p className="text-xs text-stone-500">{label}</p>
            <Link href={sample ? `#report-test-${fact.id}` : `/reports/${fact.evaluationId}#${encodeURIComponent(`report-test-${fact.id}`)}`} className="mt-1 block text-sm font-semibold underline">{fact.version} · {fact.result}</Link>
            <p className="mt-1 text-xs text-stone-500">{fact.evaluatedAt}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{fact.actualResult ?? "No output recorded"}</p>
          </li>;
        })}</ol>
        <p className="mt-3 text-sm text-stone-600">This is a recurrence of the same tested requirement. The outputs and linked evaluator evidence let you investigate whether the underlying cause is the same.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2"><Changes changes={item.passingChanges} title={`Recorded changes in ${item.firstPassing.version}`} /><Changes changes={item.recurrenceChanges} title={`Suspected contributors in ${item.current.version}`} /></div>
        <p className="mt-3 text-sm text-stone-600">Recorded changes are investigation leads. A passing run does not prove which change fixed the earlier failure.</p>
        {!sample && <Link href={`/compare?${new URLSearchParams({ project: projectId, from: item.lastPassing.modelVersionId, to: item.current.modelVersionId })}`} className="mt-3 inline-block text-sm underline">Compare {item.lastPassing.version} with {item.current.version}</Link>}
        <p className="mt-4 text-sm"><span className="font-semibold">Verification plan: </span>{item.verification}</p>
        {!sample && <div className="mt-3 flex flex-wrap gap-3"><Link href={rerun(item.current.modelVersionId)} className="rounded-md bg-stone-950 px-3 py-2 text-sm font-semibold text-white">Prepare affected-case rerun</Link><Link href={rerun(item.lastPassing.modelVersionId)} className="rounded-md border border-stone-200 px-3 py-2 text-sm">Prepare last-passing baseline</Link></div>}
      </article>;
    })}</div>
  </DetailSection>;
}
