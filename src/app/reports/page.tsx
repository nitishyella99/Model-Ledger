import Link from "next/link";
import { RunEvaluationDialog } from "@/components/evaluations/run-evaluation-dialog";
import { PageHeading } from "@/components/models/page-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import {
  getEvaluationResultsByEvaluationIds,
  getEvaluations,
} from "@/lib/data/evaluations";
import { getModels } from "@/lib/data/models";
import { getRunEvaluationDialogProjects } from "@/lib/data/run-dialog-options";
import { getVersionsByModelId } from "@/lib/data/versions";
import { calculateRunMetrics } from "@/lib/evaluation/metrics";
import { submitAutomaticEvaluationAction } from "@/app/run-evaluation/actions";
import type { RunEvaluationActionState } from "@/app/run-evaluation/actions";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const initialRunEvaluationActionState: RunEvaluationActionState = {
  status: "idle",
};

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function classifyReport(row: {
  status: string;
  tests: number;
  regressions: number;
  passRate: number | null;
}) {
  if (row.status !== "COMPLETED") {
    return {
      type: "Run status report",
      contains: "Execution status, stored outputs, evaluator notes, and retry context.",
    };
  }

  if (row.regressions > 0) {
    return {
      type: "Regression investigation",
      contains: "Run metrics, failed tests, regression evidence, Hindsight recall, and recommendations.",
    };
  }

  if (row.passRate !== null && row.passRate < 100) {
    return {
      type: "Failure analysis",
      contains: "Run metrics, failed test evidence, evaluator reasoning, and recommended fixes.",
    };
  }

  if (row.tests === 0) {
    return {
      type: "Incomplete run report",
      contains: "Stored run metadata is present, but no test results were captured.",
    };
  }

  return {
    type: "Passing run report",
    contains: "Run metrics, per-test outputs, telemetry, configuration, and audit evidence.",
  };
}

async function getReportsPageState() {
  const [models, evaluations, runDialogProjects] = await Promise.all([
    getModels(),
    getEvaluations(),
    getRunEvaluationDialogProjects(),
  ]);
  const allResults = await getEvaluationResultsByEvaluationIds(
    evaluations.map((evaluation) => evaluation.id),
  );
  const modelData = await Promise.all(
    models.map(async (model) => ({
      model,
      versions: await getVersionsByModelId(model.id),
      dataset: await getEvaluationDatasetByModelId(model.id),
    })),
  );

  const rows = evaluations.map((evaluation) => {
    const entry = modelData.find((item) => item.model.id === evaluation.model_id);
    const version = entry?.versions.find(
      (item) => item.id === evaluation.model_version_id,
    );
    const runResults = allResults.filter(
      (result) => result.evaluation_id === evaluation.id,
    );
    const metrics = entry
      ? calculateRunMetrics(evaluation.id, runResults, entry.dataset)
      : null;
    const passRate = metrics ? Math.round(metrics.pass_rate * 100) : null;

    const row = {
      id: evaluation.id,
      project: entry?.model.name ?? "Unknown project",
      projectId: entry?.model.id ?? null,
      version: version?.version ?? "Unknown version",
      status: evaluation.status ?? "COMPLETED",
      tests: metrics?.total_tests ?? 0,
      passRate,
      score:
        metrics?.average_score === null || metrics?.average_score === undefined
          ? passRate
          : Math.round(metrics.average_score * 100),
      regressions: metrics?.classifications.regressions ?? 0,
      date: formatDate(evaluation.evaluated_at),
    };

    return {
      ...row,
      ...classifyReport(row),
    };
  });

  return {
    rows,
    runDialogProjects,
  };
}

export default async function ReportsPage() {
  let state: Awaited<ReturnType<typeof getReportsPageState>> | null = null;
  let error: string | null = null;

  try {
    state = await getReportsPageState();
  } catch (caught) {
    error =
      caught instanceof Error
        ? caught.message
        : "Reports could not load from Supabase.";
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Reports"
        title="Reports"
        description="Browse every persisted evaluation report. Each report opens the current run summary, evidence, regressions, Hindsight context, and recommendations."
        action={
          <div className="flex flex-wrap gap-2">
            <RunEvaluationDialog
              action={submitAutomaticEvaluationAction}
              initialState={initialRunEvaluationActionState}
              projects={state?.runDialogProjects ?? []}
            />
            <Link
              href="/runs"
              className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700"
            >
              View Runs
            </Link>
            <Link
              href="/evaluations"
              className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700"
            >
              Evaluation History
            </Link>
          </div>
        }
      />

      {error ? (
        <EmptyState title="Reports unavailable" description={error} />
      ) : !state || state.rows.length === 0 ? (
        <EmptyState
          title="No reports yet"
          description="Run an evaluation to generate the first report."
          action={{ href: "/run-evaluation", label: "Run Evaluation" }}
        />
      ) : (
        <div className="space-y-4">
          <section className="grid gap-3 md:grid-cols-4">
            {[
              {
                title: "Run reports",
                copy: "One evaluation run with actual outputs, scores, pass/fail, telemetry, and export.",
              },
              {
                title: "Version reports",
                copy: "Latest run for a model version, configuration, changes, failures, memory, and recommendations.",
              },
              {
                title: "Comparison reports",
                copy: "A/B version comparison for pass rate, score, telemetry, tests added/removed, and config changes.",
              },
              {
                title: "Regression investigations",
                copy: "PASS to FAIL, persistent failure, resolved failure, score degradation, and historical evidence.",
              },
            ].map((item) => (
              <article key={item.title} className="rounded-md border border-stone-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-stone-950">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">{item.copy}</p>
              </article>
            ))}
          </section>

          <section className="space-y-3">
            {Object.entries(
              state.rows.reduce<
                Record<string, { projectId: string | null; rows: typeof state.rows }>
              >((groups, row) => {
                const key = row.project;

                groups[key] ??= {
                  projectId: row.projectId,
                  rows: [],
                };
                groups[key].rows.push(row);

                return groups;
              }, {}),
            ).map(([projectName, group]) => (
              <article
                key={projectName}
                className="rounded-md border border-stone-200 bg-white"
              >
                <div className="flex flex-col gap-2 border-b border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-stone-950">
                      {projectName}
                    </h2>
                    <p className="mt-1 text-sm text-stone-600">
                      {group.rows.length} classified reports stored for this
                      project.
                    </p>
                  </div>
                  {group.projectId ? (
                    <Link
                      href={`/projects/${group.projectId}`}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50"
                    >
                      Open project
                    </Link>
                  ) : null}
                </div>
                <div className="divide-y divide-stone-200">
                  {group.rows.map((row) => (
                    <Link
                      key={row.id}
                      href={`/reports/${row.id}`}
                      className="grid gap-2 p-4 transition-colors hover:bg-stone-50 md:grid-cols-[220px_minmax(0,1fr)_120px_120px]"
                    >
                      <span className="text-sm font-semibold text-stone-950">
                        {row.type}
                      </span>
                      <span className="text-sm leading-6 text-stone-600">
                        {row.contains}
                      </span>
                      <span className="text-sm text-stone-600">
                        {row.version}
                      </span>
                      <span className="text-sm font-semibold text-stone-950">
                        {row.passRate === null ? "No data" : `${row.passRate}%`}
                      </span>
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </section>

          <section className="rounded-md border border-stone-200 bg-white">
            <div className="border-b border-stone-200 p-4">
              <h2 className="text-sm font-semibold text-stone-950">
                Evaluation Reports
              </h2>
              <p className="mt-1 text-sm text-stone-600">
                Reports are public inside this app and open without hidden routes.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Report</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">What It Contains</th>
                    <th className="px-4 py-3 font-semibold">Project</th>
                    <th className="px-4 py-3 font-semibold">Version</th>
                    <th className="px-4 py-3 font-semibold">Tests</th>
                    <th className="px-4 py-3 font-semibold">Pass Rate</th>
                    <th className="px-4 py-3 font-semibold">Regressions</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {state.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-stone-50">
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link
                            href={`/reports/${row.id}`}
                            className="inline-flex h-8 items-center justify-center rounded-md bg-stone-950 px-3 text-xs font-semibold text-white"
                          >
                            Open Report
                          </Link>
                          <Link
                            href={`/reports/${row.id}/export`}
                            className="inline-flex h-8 items-center justify-center rounded-md border border-stone-200 px-3 text-xs font-semibold text-stone-700"
                          >
                            Download
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-stone-950">
                        {row.type}
                      </td>
                      <td className="max-w-sm px-4 py-3 text-stone-600">
                        {row.contains}
                      </td>
                      <td className="px-4 py-3 font-semibold text-stone-950">
                        {row.projectId ? (
                          <Link href={`/projects/${row.projectId}`}>{row.project}</Link>
                        ) : (
                          row.project
                        )}
                      </td>
                      <td className="px-4 py-3 text-stone-600">{row.version}</td>
                      <td className="px-4 py-3 text-stone-600">{row.tests}</td>
                      <td className="px-4 py-3 text-stone-950">
                        {row.passRate === null ? "No data" : `${row.passRate}%`}
                      </td>
                      <td className="px-4 py-3 text-stone-600">{row.regressions}</td>
                      <td className="px-4 py-3 text-stone-600">{row.status}</td>
                      <td className="px-4 py-3 text-stone-600">{row.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          </div>
      )}
    </div>
  );
}
