import Link from "next/link";
import { FailureRecurrences } from "@/components/reports/failure-recurrences";
import { buildRecurrenceDemo } from "@/lib/evaluation/recurrence-demo";

export default function RecurrenceDemoPage() {
  const demo = buildRecurrenceDemo();
  return <div className="space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Acceptance demo · Synthetic sample data</p>
      <h1 className="mt-2 text-2xl font-semibold">The failure we already fixed</h1>
      <p className="mt-2 text-sm text-stone-600">Two refund cases failed in v3, passed in v4, and failed again in v7. A third case still passes. Model Ledger connects the recorded requirement, outputs, version changes, and next investigation.</p>
      <p className="mt-2 text-sm text-stone-600">This sample uses the same recurrence engine and report component as real evaluations. It makes no provider calls and creates no project data.</p>
    </header>
    <FailureRecurrences recurrences={demo.recurrences} projectId="sample-refund" sample />
    <section className="rounded-md border border-stone-200 bg-white p-4"><h2 className="font-semibold">Inspect the run evidence</h2><div className="mt-3 space-y-3">{demo.results.map((row) => <details key={row.id} id={`report-test-${row.id}`} className="scroll-mt-6 rounded-md border border-stone-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">{row.evaluation_id.replace("sample-run-", "")} · {row.test_name} · {row.result}</summary>
      <dl className="mt-3 space-y-2 text-sm">{[["Input", row.input_snapshot], ["Expected", row.expected_output_snapshot], ["Actual", row.actual_result], ["Evaluator", `${row.evaluator_type}, threshold ${row.threshold}`], ["Evidence", row.evaluator_reason], ["Execution / evaluation", `${row.execution_status} / ${row.evaluator_status}`]].map(([label, value]) => <div key={label}><dt className="font-semibold">{label}</dt><dd className="whitespace-pre-wrap">{value}</dd></div>)}</dl>
    </details>)}</div></section>
    <section className="rounded-md border border-stone-200 bg-white p-4"><h2 className="font-semibold">Verify with your own model</h2><p className="mt-2 text-sm text-stone-600">Create a project, preserve test identities and criteria across versions, and run evaluations. When a comparable failure follows an earlier failure and passing run, its report shows this investigation view and preselects the affected case for rerunning.</p><Link href="/projects/new" className="mt-3 inline-block rounded-md bg-stone-950 px-3 py-2 text-sm font-semibold text-white">Create a project</Link></section>
  </div>;
}
