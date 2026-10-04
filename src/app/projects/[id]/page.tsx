import Link from "next/link";
import { latestOperation } from "@/lib/deployment/service";
import { NextStep } from "@/components/projects/next-step";
import { notFound } from "next/navigation";
import { RunEvaluationDialog } from "@/components/evaluations/run-evaluation-dialog";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { VersionComparison } from "@/components/models/version-comparison";
import type { VersionComparisonEvaluationRow } from "@/components/models/version-comparison";
import { EmptyState } from "@/components/ui/empty-state";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import {
  getEvaluationResultsByEvaluationIds,
  getEvaluationsByModelId,
} from "@/lib/data/evaluations";
import { getModelById } from "@/lib/data/models";
import {
  getVersionChangesByVersionIds,
  getVersionsByModelId,
} from "@/lib/data/versions";
import { getRunEvaluationDialogProjects } from "@/lib/data/run-dialog-options";
import { compareVersions } from "@/lib/evaluation/engine";
import { calculateRunMetrics } from "@/lib/evaluation/metrics";
import { getAttentionIssues, getVersionSummary } from "@/lib/evaluation/reporting";
import { submitAutomaticEvaluationAction } from "@/app/run-evaluation/actions";
import type { RunEvaluationActionState } from "@/app/run-evaluation/actions";

export const dynamic = "force-dynamic";

type ProjectPageProps = Readonly<{
  params: Promise<{ id: string }>;
}>;

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

function getSummaryCopy(regressions: number, improved: number) {
  if (regressions > 0 && improved > 0) {
    return `Your latest version improved overall, but ${regressions} tests became worse.`;
  }

  if (regressions > 0) {
    return `${regressions} tests became worse in the latest comparable version.`;
  }

  return "Your latest version has no detected regressions.";
}

function toComparisonOutcome(result?: "PASS" | "FAIL") {
  if (result === "PASS") return "pass" as const;
  if (result === "FAIL") return "fail" as const;
  return "none" as const;
}

function toComparisonDifference(
  transition:
    | "PASS_TO_PASS"
    | "PASS_TO_FAIL"
    | "FAIL_TO_PASS"
    | "FAIL_TO_FAIL"
    | "NEW_TEST"
    | "REMOVED_TEST",
) {
  if (transition === "PASS_TO_PASS") return "pass_to_pass" as const;
  if (transition === "PASS_TO_FAIL") return "pass_to_fail" as const;
  if (transition === "FAIL_TO_PASS") return "fail_to_pass" as const;
  if (transition === "FAIL_TO_FAIL") return "fail_to_fail" as const;
  if (transition === "NEW_TEST") return "new_test" as const;
  return "removed_test" as const;
}

export default async function ProjectOverviewPage({ params }: ProjectPageProps) {
  const { id } = await params;
  const [project, versions, evaluations, dataset, runDialogProjects] = await Promise.all([
    getModelById(id),
    getVersionsByModelId(id),
    getEvaluationsByModelId(id),
    getEvaluationDatasetByModelId(id),
    getRunEvaluationDialogProjects(),
  ]);

  if (!project) {
    notFound();
  }

  const currentVersion =
    versions.find((version) => version.id === project.current_model_version_id) ??
    versions[0];
  const latestEvaluation = evaluations[0];
  const operation = await latestOperation(id);

  if (!currentVersion) {
    return (
      <div className="space-y-6">
        <header className="rounded-md border border-stone-200 bg-white p-5">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
            {project.name}
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            Current version: No version. Last evaluated: Not evaluated.
          </p>
          <ProjectTabs active="overview" projectId={project.id} />
        </header>
        <EmptyState
          title="No versions yet"
          description="A version is a particular version of your AI setup. Add and configure a version first before importing test cases or comparing evaluation results."
          action={{ href: `/versions?project=${project.id}`, label: "Add Version" }}
          secondaryAction={{
            href: `/versions?project=${project.id}`,
            label: "Configure Version",
          }}
        />
      </div>
    );
  }

  const evaluationResults = await getEvaluationResultsByEvaluationIds(
    evaluations.map((evaluation) => evaluation.id),
  );
  const currentSummary = getVersionSummary(dataset, currentVersion.id);
  const attentionIssues = getAttentionIssues(dataset, currentVersion.id);
  const chronologicalVersions = [...versions].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const versionTrend = chronologicalVersions.map((version) => {
    const summary = getVersionSummary(dataset, version.id);

    return {
      id: version.id,
      version: version.version,
      score: Math.round(summary.metrics.pass_rate * 100),
      tests: summary.metrics.total_tests,
    };
  });
  const improved = currentSummary.analyses.filter(
    (analysis) => analysis.classification === "RESOLVED",
  ).length;
  const stable = currentSummary.analyses.filter((analysis) =>
    ["STABLE_PASS", "STABLE_FAIL"].includes(analysis.classification),
  ).length;
  const comparisonFrom = chronologicalVersions.at(-2);
  const comparisonTo = chronologicalVersions.at(-1);
  const versionChanges =
    comparisonFrom && comparisonTo
      ? await getVersionChangesByVersionIds(versions.map((version) => version.id))
      : [];
  const comparison =
    comparisonFrom && comparisonTo
      ? compareVersions(dataset, comparisonFrom.id, comparisonTo.id, versionChanges)
      : null;
  const comparisonEvaluationRows: VersionComparisonEvaluationRow[] =
    comparison?.transitions.map((transition) => ({
      testName: transition.testName,
      beforeOutcome: toComparisonOutcome(transition.fromResult?.result),
      afterOutcome: toComparisonOutcome(transition.toResult?.result),
      difference: toComparisonDifference(transition.transition),
      scoreDelta: transition.scoreDelta,
      reportHref: transition.toResult
        ? `/reports/${transition.toResult.evaluationId}`
        : null,
    })) ?? [];
  const latestTests = [...dataset.facts]
    .sort(
      (a, b) =>
        new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime(),
    )
    .filter(
      (fact, index, facts) =>
        facts.findIndex((candidate) => candidate.testKey === fact.testKey) === index,
    );

  return (
    <div className="space-y-6">
      {operation && <NextStep initial={operation} key={`${operation.id}:${operation.updated_at}`} />}
      <header className="rounded-md border border-stone-200 bg-white">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-950">
              {project.name}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
              {project.purpose}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              Current version: {currentVersion.version}. Last evaluated:{" "}
              {latestEvaluation
                ? formatDate(latestEvaluation.evaluated_at)
                : "Not evaluated"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/model-upload?project=${project.id}&version=${currentVersion.id}`} className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 hover:bg-stone-50">Upload Model</Link>
          <RunEvaluationDialog
            action={submitAutomaticEvaluationAction}
            initialState={initialRunEvaluationActionState}
            projects={runDialogProjects}
            initialProjectId={project.id}
            label="Generate report"
          />
            <Link
              href={`/versions?project=${project.id}`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
            >
              Add Version
            </Link>
            <Link
              href="#compare"
              className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700"
            >
              Compare
            </Link>
            <Link
              href={`/projects/${project.id}/tests`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700"
            >
              Import cases
            </Link>
          </div>
        </div>
        <ProjectTabs active="overview" projectId={project.id} />
      </header>

      {currentSummary.metrics.total_tests === 0 ? (
        <EmptyState
          title="No evaluations yet"
          description="Generate one report to create the first baseline for this project."
          action={{ href: "/run-evaluation", label: "Generate Report" }}
        />
      ) : (
        <>
          <section id="overview" className="grid gap-3 md:grid-cols-4">
            {[
              {
                label: "Overall Score",
                value: `${Math.round(currentSummary.metrics.pass_rate * 100)}%`,
              },
              {
                label: "Pass Rate",
                value: `${Math.round(currentSummary.metrics.pass_rate * 100)}%`,
              },
              {
                label: "Regressions",
                value: String(currentSummary.regressionCount),
              },
              {
                label: "Tests",
                value: String(currentSummary.metrics.total_tests),
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-md border border-stone-200 bg-white p-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                  {metric.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-stone-950">
                  {metric.value}
                </p>
              </div>
            ))}
          </section>

          <section className="rounded-md border border-stone-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-stone-950">
              {getSummaryCopy(currentSummary.regressionCount, improved)}
            </h2>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-stone-700">
              <span>{improved} improved</span>
              <span>{currentSummary.regressionCount} regressed</span>
              <span>{stable} stayed similar</span>
            </div>
            {currentSummary.regressionCount > 0 ? (
              <Link
                href="#needs-attention"
                className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white"
              >
                Review {currentSummary.regressionCount} Regressions
              </Link>
            ) : null}
          </section>

          <section
            id="needs-attention"
            className="rounded-md border border-stone-200 bg-white"
          >
            <div className="border-b border-stone-200 p-4">
              <h2 className="text-sm font-semibold text-stone-950">
                Needs Attention
              </h2>
            </div>
            {attentionIssues.length === 0 ? (
              <div className="p-5 text-sm leading-6 text-stone-600">
                No critical regressions, new high-priority failures, or repeated
                failures are recorded for this version.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[860px] text-left text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Test</th>
                      <th className="px-4 py-3 font-semibold">Previous</th>
                      <th className="px-4 py-3 font-semibold">Current</th>
                      <th className="px-4 py-3 font-semibold">Issue</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {attentionIssues.map((issue) => (
                      <tr key={issue.id}>
                        <td className="px-4 py-3 font-semibold text-stone-950">
                          {issue.fact.testName}
                        </td>
                        <td className="px-4 py-3 text-stone-600">
                          {issue.previousRelevantVersion ?? "Not recorded"}
                        </td>
                        <td className="px-4 py-3 text-stone-600">
                          {issue.fact.result}
                        </td>
                        <td className="px-4 py-3 text-stone-600">
                          {issue.classification.replaceAll("_", " ")}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/reports/${issue.fact.evaluationId}`}
                            className="font-semibold text-stone-950 hover:text-stone-600"
                          >
                            Open Report
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section id="tests" className="rounded-md border border-stone-200 bg-white">
            <div className="border-b border-stone-200 p-4">
              <h2 className="text-sm font-semibold text-stone-950">Latest Test Results</h2>
              <p className="mt-1 text-sm text-stone-600">
                Latest recorded result for every test in this project.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[720px] text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Test</th>
                    <th className="px-4 py-3 font-semibold">Suite</th>
                    <th className="px-4 py-3 font-semibold">Result</th>
                    <th className="px-4 py-3 font-semibold">Version</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {latestTests.map((test) => (
                    <tr key={test.id}>
                      <td className="px-4 py-3 font-semibold text-stone-950">{test.testName}</td>
                      <td className="px-4 py-3 text-stone-600">{test.category}</td>
                      <td className="px-4 py-3 text-stone-600">{test.result}</td>
                      <td className="px-4 py-3 text-stone-600">{test.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-md border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-950">
              Performance Trend
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Overall score across versions. This answers whether the system is
              generally improving.
            </p>
            <div className="mt-5 flex items-end gap-3 overflow-x-auto border-b border-stone-200 pb-3">
              {versionTrend.map((item) => (
                <div key={item.id} className="flex min-w-20 flex-col items-center gap-2">
                  <div
                    className="w-10 rounded-t bg-stone-900"
                    style={{ height: `${Math.max(item.score, 4)}px` }}
                    aria-label={`${item.version} score ${item.score}%`}
                  />
                  <span className="text-xs font-semibold text-stone-950">
                    {item.score}%
                  </span>
                  <span className="text-xs text-stone-500">{item.version}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="runs" className="rounded-md border border-stone-200 bg-white">
            <div className="border-b border-stone-200 p-4">
              <h2 className="text-sm font-semibold text-stone-950">
                Recent Reports
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[760px] text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Version</th>
                    <th className="px-4 py-3 font-semibold">Score</th>
                    <th className="px-4 py-3 font-semibold">Passed</th>
                    <th className="px-4 py-3 font-semibold">Regressions</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {evaluations.slice(0, 6).map((evaluation) => {
                    const version = versions.find(
                      (entry) => entry.id === evaluation.model_version_id,
                    );
                    const runResults = evaluationResults.filter(
                      (result) => result.evaluation_id === evaluation.id,
                    );
                    const runMetrics = calculateRunMetrics(
                      evaluation.id,
                      runResults,
                      dataset,
                    );

                    return (
                      <tr key={evaluation.id}>
                        <td className="px-4 py-3 font-semibold text-stone-950">
                          <Link href={`/reports/${evaluation.id}`}>
                            {version?.version ?? "Unknown"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-stone-600">
                          {runMetrics.total_tests === 0
                            ? "No data"
                            : `${Math.round(runMetrics.pass_rate * 100)}%`}
                        </td>
                        <td className="px-4 py-3 text-stone-600">
                          {runMetrics.passed_tests}
                        </td>
                        <td className="px-4 py-3 text-stone-600">
                          {runMetrics.classifications.regressions}
                        </td>
                        <td className="px-4 py-3 text-stone-600">
                          {formatDate(evaluation.evaluated_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section id="compare">
            {comparison && comparisonFrom && comparisonTo ? (
              <VersionComparison
                title={`${comparisonFrom.version} vs ${comparisonTo.version}`}
                fromVersion={comparisonFrom.version}
                toVersion={comparisonTo.version}
                evaluationRows={comparisonEvaluationRows}
              />
            ) : (
              <EmptyState
                title="Comparison needs two versions"
                description="Add and evaluate another version to show a comparison report in this workspace."
              />
            )}
          </section>

          <section id="memory" className="rounded-md border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-950">Memory</h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Historical evaluation memory is available from the project memory workspace.
            </p>
            <Link
              href={`/memory?model=${project.id}`}
              className="mt-4 inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
            >
              Open project memory
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
