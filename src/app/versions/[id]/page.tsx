import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailSection } from "@/components/evaluations/detail-section";
import { FactGrid } from "@/components/evaluations/fact-grid";
import { ModelConfigurationForm } from "@/components/models/model-configuration-form";
import { PageHeading } from "@/components/models/page-heading";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import {
  getEvaluationResultsByEvaluationIds,
  getEvaluationsByModelId,
} from "@/lib/data/evaluations";
import { getEffectiveModelVersionConfiguration } from "@/lib/data/model-configurations";
import { getModelById } from "@/lib/data/models";
import {
  getVersionById,
  getVersionChangesByVersionIds,
  getVersionsByModelId,
} from "@/lib/data/versions";
import { compareVersions } from "@/lib/evaluation/engine";
import { calculateRunMetrics } from "@/lib/evaluation/metrics";
import { buildRunReportData } from "@/lib/evaluation/report-data";
import { buildEvidenceGroundedRecommendations } from "@/lib/evaluation/recommendations";
import { getVersionSummary } from "@/lib/evaluation/reporting";
import { isHindsightConfigured } from "@/lib/hindsight/client";
import { recallEvaluationDetailMemory } from "@/lib/hindsight/recall";
import {
  saveModelVersionConfigurationAction,
  type ModelVersionConfigurationActionState,
} from "../actions";

export const dynamic = "force-dynamic";

const initialConfigurationActionState: ModelVersionConfigurationActionState = {
  status: "idle",
};

type VersionDetailPageProps = Readonly<{
  params: Promise<{ id: string }>;
}>;

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "Unavailable";
}

function formatNumber(value: number | null | undefined, suffix = "") {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toLocaleString()}${suffix}`
    : "Unavailable";
}

function formatCurrency(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `$${value.toFixed(6)}`
    : "Unavailable";
}

export default async function VersionDetailPage({ params }: VersionDetailPageProps) {
  const { id } = await params;
  const version = await getVersionById(id);

  if (!version) {
    notFound();
  }

  const [project, versions, evaluations, dataset, configuration, versionChanges] =
    await Promise.all([
      getModelById(version.model_id),
      getVersionsByModelId(version.model_id),
      getEvaluationsByModelId(version.model_id),
      getEvaluationDatasetByModelId(version.model_id),
      getEffectiveModelVersionConfiguration(version.id),
      getVersionChangesByVersionIds([version.id]),
    ]);

  if (!project) {
    notFound();
  }

  const versionRuns = evaluations.filter(
    (evaluation) => evaluation.model_version_id === version.id,
  );
  const latestRun = versionRuns[0] ?? null;
  const latestRunResults = latestRun
    ? await getEvaluationResultsByEvaluationIds([latestRun.id])
    : [];
  const latestRunMetrics =
    latestRun !== null
      ? calculateRunMetrics(latestRun.id, latestRunResults, dataset)
      : null;
  const versionSummary = getVersionSummary(dataset, version.id);
  const chronologicalVersions = [...versions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const previousVersion =
    chronologicalVersions[
      chronologicalVersions.findIndex((entry) => entry.id === version.id) - 1
    ] ?? null;
  const comparison = previousVersion
    ? compareVersions(dataset, previousVersion.id, version.id, versionChanges)
    : null;
  const runReport =
    latestRun && latestRunResults.length > 0
      ? buildRunReportData({
          evaluation: latestRun,
          results: latestRunResults,
          dataset,
          configuration,
        })
      : null;
  const shouldRecallMemory =
    isHindsightConfigured() &&
    runReport?.tests.some((test) => test.result === "FAIL") === true;
  const memory = shouldRecallMemory
    ? await recallEvaluationDetailMemory({
        modelId: project.id,
        testKey: runReport?.tests.find((test) => test.result === "FAIL")?.testKey,
        category: runReport?.tests.find((test) => test.result === "FAIL")?.category,
        currentFailureDescription:
          runReport?.tests.find((test) => test.result === "FAIL")?.actualOutput ??
          null,
        limit: 5,
      })
    : null;
  const recommendations = runReport
    ? buildEvidenceGroundedRecommendations({
        report: runReport,
        memories: memory?.all ?? [],
        versionChanges,
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow={project.name}
        title={`Version ${version.version}`}
        description="Version-scoped report using latest run facts, stored configuration, comparison history, memory, and recommendations."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/run-evaluation?project=${project.id}&version=${version.id}`}
              className="inline-flex h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white"
            >
              Run Evaluation
            </Link>
            <Link
              href={`/compare?project=${project.id}&to=${version.id}`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 px-3 text-sm font-semibold text-stone-700"
            >
              Compare
            </Link>
            {latestRun ? (
              <>
                <Link
                  href={`/reports/${latestRun.id}`}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 px-3 text-sm font-semibold text-stone-700"
                >
                  Latest Run Report
                </Link>
                <Link
                  href={`/reports/${latestRun.id}/export`}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 px-3 text-sm font-semibold text-stone-700"
                >
                  Download
                </Link>
              </>
            ) : null}
          </div>
        }
      />

      <DetailSection
        label="REPORT MAP"
        title="What this version report contains"
        description="Version-level context assembled from stored runs, configuration, version changes, comparison history, and Hindsight memory when available."
      >
        <FactGrid
          items={[
            { label: "Report type", value: "Version report" },
            { label: "Project report", value: project.name },
            { label: "Latest run", value: latestRun ? latestRun.name : "No runs yet" },
            { label: "Comparison baseline", value: previousVersion?.version ?? "No previous version" },
            { label: "Configuration", value: "Default NVIDIA NIM" },
            { label: "Hindsight", value: isHindsightConfigured() ? "Available" : "Not configured" },
          ]}
        />
      </DetailSection>

      <DetailSection label="MODEL CONFIGURATION" title="Identity" description="Project, version, provider, and creation details.">
        <FactGrid
          items={[
            { label: "Project", value: project.name },
            { label: "Version", value: version.version },
            { label: "Status", value: version.status },
            { label: "Created", value: formatDate(version.created_at) },
            { label: "Provider", value: configuration?.provider ?? project.provider },
            { label: "Model", value: configuration?.model_name ?? "Unavailable" },
            { label: "Temperature", value: configuration?.temperature ?? "Unavailable" },
            { label: "Max tokens", value: configuration?.max_tokens ?? "Provider default" },
          ]}
        />
      </DetailSection>

      <ModelConfigurationForm
        action={saveModelVersionConfigurationAction}
        initialActionState={initialConfigurationActionState}
        versionId={version.id}
        configuration={configuration}
      />

      <DetailSection label="RUN SUMMARY" title="Latest Evaluation Snapshot" description="Latest run for this version plus total run count.">
        <FactGrid
          items={[
            { label: "Latest run", value: latestRun ? latestRun.name : "No runs" },
            { label: "Total runs", value: versionRuns.length },
            { label: "Total tests", value: latestRunMetrics?.total_tests ?? 0 },
            { label: "Passed", value: latestRunMetrics?.passed_tests ?? 0 },
            { label: "Failed", value: latestRunMetrics?.failed_tests ?? 0 },
            { label: "Pass rate", value: formatPercent(latestRunMetrics?.pass_rate) },
            {
              label: "Average score",
              value:
                latestRunMetrics?.average_score === null ||
                latestRunMetrics?.average_score === undefined
                  ? "Unavailable"
                  : latestRunMetrics.average_score.toFixed(2),
            },
          ]}
        />
      </DetailSection>

      <DetailSection label="WHY FLAGGED" title="Classification" description="Latest version snapshot classifications derived from stored test history.">
        <FactGrid
          items={[
            { label: "Regressions", value: versionSummary.regressionCount },
            {
              label: "Improvements",
              value: versionSummary.analyses.filter((item) => item.classification === "RESOLVED").length,
            },
            {
              label: "Persistent failures",
              value: versionSummary.analyses.filter((item) => item.classification === "REPEATED_FAILURE").length,
            },
            {
              label: "Stable tests",
              value: versionSummary.analyses.filter((item) =>
                ["STABLE_PASS", "STABLE_FAIL"].includes(item.classification),
              ).length,
            },
            { label: "New tests", value: comparison?.new_tests ?? "No baseline" },
            { label: "Removed tests", value: comparison?.removed_tests ?? "No baseline" },
          ]}
        />
      </DetailSection>

      <DetailSection label="RUN TELEMETRY" title="Telemetry" description="Provider telemetry from the latest run when available.">
        <FactGrid
          items={[
            {
              label: "Average latency",
              value: formatNumber(
                latestRunMetrics?.telemetry.average_latency_ms === null
                  ? null
                  : Math.round(latestRunMetrics?.telemetry.average_latency_ms ?? NaN),
                "ms",
              ),
            },
            { label: "Input tokens", value: formatNumber(latestRunMetrics?.telemetry.total_input_tokens) },
            { label: "Output tokens", value: formatNumber(latestRunMetrics?.telemetry.total_output_tokens) },
            { label: "Total tokens", value: formatNumber(latestRunMetrics?.telemetry.total_tokens) },
            { label: "Estimated cost", value: formatCurrency(latestRunMetrics?.telemetry.estimated_cost_usd) },
          ]}
        />
      </DetailSection>

      <DetailSection label="VERSION CHANGE" title="Changes From Previous Comparable Version" description="Stored version/configuration changes for this version.">
        {versionChanges.length === 0 ? (
          <p className="text-sm leading-6 text-stone-600">No configuration changes are recorded for this version.</p>
        ) : (
          <div className="grid gap-3">
            {versionChanges.map((change) => (
              <article key={change.id} className="rounded-md border border-stone-200 p-3">
                <p className="text-sm font-semibold text-stone-950">
                  {change.change_type}{change.field_name ? ` · ${change.field_name}` : ""}
                </p>
                <p className="mt-1 text-sm leading-6 text-stone-700">{change.description}</p>
                <p className="mt-2 text-xs text-stone-500">
                  Before: {change.previous_value ?? "Unavailable"} · After: {change.new_value ?? "Unavailable"}
                </p>
              </article>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection label="SUPPORTING EVIDENCE" title="Failed Test Evidence" description="Failed tests from the latest run.">
        {!runReport || runReport.tests.filter((test) => test.result === "FAIL").length === 0 ? (
          <p className="text-sm leading-6 text-stone-600">No failed tests are present in the latest run.</p>
        ) : (
          <div className="grid gap-3">
            {runReport.tests.filter((test) => test.result === "FAIL").map((test) => (
              <article key={test.id} className="rounded-md border border-rose-200 bg-rose-50 p-3">
                <p className="text-sm font-semibold text-rose-950">{test.testName}</p>
                <p className="mt-2 text-sm leading-6 text-rose-900">Expected: {test.expectedOutput}</p>
                <p className="mt-1 text-sm leading-6 text-rose-900">Actual: {test.actualOutput || "No output recorded."}</p>
                <p className="mt-1 text-sm leading-6 text-rose-900">Evaluator: {test.evaluatorReason ?? "No notes recorded."}</p>
              </article>
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection label="SEEN BEFORE" title="Hindsight" description="Historical memory related to current version failures.">
        {!isHindsightConfigured() ? (
          <p className="text-sm leading-6 text-stone-600">Hindsight is not configured.</p>
        ) : memory && memory.all.length > 0 ? (
          <div className="grid gap-3">
            {memory.all.map((item) => (
              <article key={item.id} className="rounded-md border border-stone-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                  {item.eventType ?? "memory"} · {item.version ?? item.modelVersionId ?? "version unavailable"}
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-700">{item.content}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-stone-600">No relevant historical memory found.</p>
        )}
      </DetailSection>

      <DetailSection label="RECOMMENDATIONS" title="Recommendations" description="Evidence-grounded actions from latest run facts, version changes, and recalled memory when available.">
        {recommendations.length === 0 ? (
          <p className="text-sm leading-6 text-stone-600">Run an evaluation to generate recommendations for this version.</p>
        ) : (
          <div className="grid gap-3">
            {recommendations.map((recommendation) => (
              <article key={recommendation.id} className="rounded-md border border-stone-200 p-3">
                <p className="text-sm font-semibold text-stone-950">
                  {recommendation.priority} · {recommendation.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-700">{recommendation.action}</p>
              </article>
            ))}
          </div>
        )}
      </DetailSection>
    </div>
  );
}
