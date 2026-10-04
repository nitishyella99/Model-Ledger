import { ArrowRight, Download, FileText } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/dashboard/status-badge";
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

function getReportTone(row: {
  status: string;
  regressions: number;
  passRate: number | null;
}): "neutral" | "success" | "warning" | "danger" {
  if (row.regressions > 0) return "danger";
  if (row.status !== "COMPLETED") return "warning";
  if (row.passRate === null || row.passRate < 100) return "warning";

  return "success";
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

  const reportSummary = state
    ? {
        totalReports: state.rows.length,
        totalTests: state.rows.reduce((sum, row) => sum + row.tests, 0),
        openRegressions: state.rows.reduce(
          (sum, row) => sum + row.regressions,
          0,
        ),
        averagePassRate:
          state.rows.filter((row) => row.passRate !== null).length === 0
            ? null
            : Math.round(
                state.rows.reduce(
                  (sum, row) => sum + (row.passRate ?? 0),
                  0,
                ) /
                  state.rows.filter((row) => row.passRate !== null).length,
              ),
      }
    : null;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Reports"
        title="Reports"
        description="Browse every persisted evaluation report. Each report opens the current run summary, evidence, regressions, Hindsight context, and recommendations."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/demo/recurrence" className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700">See recurrence demo</Link>
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
          <section className="overflow-hidden rounded-md border border-stone-200 bg-white">
            <div className="grid gap-6 border-b border-stone-200 bg-stone-50/80 p-5 lg:grid-cols-[minmax(0,1fr)_420px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-stone-950">
                    Evaluation reports
                  </h2>
                  <StatusBadge tone="neutral">
                    {reportSummary?.totalReports ?? 0} stored
                  </StatusBadge>
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                  Review each run by outcome, project, version, test coverage,
                  and regression impact. Open a report for the full evidence
                  trail or download it for sharing.
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 text-sm">
                <div className="bg-white p-3">
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                    Avg pass rate
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-stone-950">
                    {reportSummary?.averagePassRate === null
                      ? "No data"
                      : `${reportSummary?.averagePassRate ?? 0}%`}
                  </dd>
                </div>
                <div className="bg-white p-3">
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                    Tests covered
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-stone-950">
                    {reportSummary?.totalTests ?? 0}
                  </dd>
                </div>
                <div className="bg-white p-3">
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                    Regressions
                  </dt>
                  <dd
                    className={[
                      "mt-1 text-lg font-semibold tabular-nums",
                      (reportSummary?.openRegressions ?? 0) > 0
                        ? "text-rose-700"
                        : "text-stone-950",
                    ].join(" ")}
                  >
                    {reportSummary?.openRegressions ?? 0}
                  </dd>
                </div>
                <div className="bg-white p-3">
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                    Latest report
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums text-stone-950">
                    {state.rows[0]?.date ?? "No data"}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="divide-y divide-stone-200">
              {state.rows.map((row) => (
                <article
                  key={row.id}
                  className="grid gap-5 p-5 transition-colors hover:bg-stone-50/70 xl:grid-cols-[minmax(0,1fr)_380px]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={getReportTone(row)}>
                        {row.type}
                      </StatusBadge>
                      <span className="text-xs font-medium text-stone-500">
                        {row.date}
                      </span>
                      <span className="text-xs font-medium text-stone-500">
                        {row.status}
                      </span>
                    </div>

                    <h3 className="mt-3 text-base font-semibold text-stone-950">
                      {row.projectId ? (
                        <Link
                          href={`/projects/${row.projectId}`}
                          className="transition-colors hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
                        >
                          {row.project}
                        </Link>
                      ) : (
                        row.project
                      )}
                      <span className="font-normal text-stone-500">
                        {" "}
                        / {row.version}
                      </span>
                    </h3>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                      {row.contains}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/reports/${row.id}`}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px"
                      >
                        <FileText
                          className="size-4"
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                        Open report
                        <ArrowRight
                          className="size-4"
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                      </Link>
                      <Link
                        href={`/reports/${row.id}/export`}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
                      >
                        <Download
                          className="size-4"
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                        Download
                      </Link>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 text-sm sm:grid-cols-4 xl:grid-cols-2">
                    <div className="bg-white p-3">
                      <dt className="text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                        Pass rate
                      </dt>
                      <dd
                        className={[
                          "mt-1 text-lg font-semibold tabular-nums",
                          row.passRate !== null && row.passRate < 100
                            ? "text-amber-700"
                            : "text-stone-950",
                        ].join(" ")}
                      >
                        {row.passRate === null ? "No data" : `${row.passRate}%`}
                      </dd>
                    </div>
                    <div className="bg-white p-3">
                      <dt className="text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                        Tests
                      </dt>
                      <dd className="mt-1 text-lg font-semibold tabular-nums text-stone-950">
                        {row.tests}
                      </dd>
                    </div>
                    <div className="bg-white p-3">
                      <dt className="text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                        Regressions
                      </dt>
                      <dd
                        className={[
                          "mt-1 text-lg font-semibold tabular-nums",
                          row.regressions > 0
                            ? "text-rose-700"
                            : "text-stone-950",
                        ].join(" ")}
                      >
                        {row.regressions}
                      </dd>
                    </div>
                    <div className="bg-white p-3">
                      <dt className="text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                        Score
                      </dt>
                      <dd className="mt-1 text-lg font-semibold tabular-nums text-stone-950">
                        {row.score === null ? "No data" : `${row.score}%`}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-4">
            {[
              {
                title: "Run reports",
                copy: "One evaluation run with actual outputs, scores, pass/fail, telemetry, and export.",
                href: "/runs",
                action: "View Run Reports",
              },
              {
                title: "Version reports",
                copy: "Latest run for a model version, configuration, changes, failures, memory, and recommendations.",
                href: "/versions",
                action: "View Version Reports",
              },
              {
                title: "Comparison reports",
                copy: "A/B version comparison for pass rate, score, telemetry, tests added/removed, and config changes.",
                href: "/compare",
                action: "View Comparison Reports",
              },
              {
                title: "Regression investigations",
                copy: "PASS to FAIL, persistent failure, resolved failure, score degradation, and historical evidence.",
                href: "/reports",
                action: "View Regression Reports",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="flex min-h-56 flex-col rounded-md border border-stone-200 bg-white p-4"
              >
                <h2 className="text-sm font-semibold text-stone-950">
                  {item.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {item.copy}
                </p>
                <Link
                  href={item.href}
                  className="mt-auto inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
                >
                  {item.action}
                </Link>
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
          </div>
      )}
    </div>
  );
}
