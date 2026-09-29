import Link from "next/link";

import { VersionCompareControls } from "@/components/models/version-compare-controls";
import { VersionComparison } from "@/components/models/version-comparison";
import type { VersionComparisonEvaluationRow } from "@/components/models/version-comparison";
import { PageHeading } from "@/components/models/page-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import {
  getEvaluationResultsByEvaluationIds,
  getEvaluationsByModelId,
} from "@/lib/data/evaluations";
import { getEffectiveModelVersionConfiguration } from "@/lib/data/model-configurations";
import { getModels } from "@/lib/data/models";
import {
  getVersionChangesByVersionIds,
  getVersionsByModelId,
} from "@/lib/data/versions";
import { compareVersions } from "@/lib/evaluation/engine";
import {
  calculateCategoryMetrics,
  calculateRunMetrics,
} from "@/lib/evaluation/metrics";
import { getVersionSummary } from "@/lib/evaluation/reporting";

export const dynamic = "force-dynamic";

type ComparePageProps = Readonly<{
  searchParams: Promise<{
    project?: string;
    from?: string;
    to?: string;
  }>;
}>;

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

function formatPercent(value: number | null | undefined) {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "Unavailable";
}

function formatDelta(value: number | null | undefined, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Unavailable";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)}${suffix}`;
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString()
    : "Unavailable";
}

function formatCurrency(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `$${value.toFixed(6)}`
    : "Unavailable";
}

function diffConfigs(
  fromConfig: Awaited<ReturnType<typeof getEffectiveModelVersionConfiguration>> | null,
  toConfig: Awaited<ReturnType<typeof getEffectiveModelVersionConfiguration>> | null,
) {
  if (!fromConfig || !toConfig) {
    return [];
  }

  const fields = [
    ["Provider", fromConfig.provider, toConfig.provider],
    ["Model", fromConfig.model_name, toConfig.model_name],
    ["Base URL", fromConfig.base_url ?? "Provider default", toConfig.base_url ?? "Provider default"],
    ["Endpoint URL", fromConfig.endpoint_url ?? "Provider default", toConfig.endpoint_url ?? "Provider default"],
    ["System prompt", fromConfig.system_prompt ?? "", toConfig.system_prompt ?? ""],
    ["Temperature", String(fromConfig.temperature), String(toConfig.temperature)],
    ["Max tokens", String(fromConfig.max_tokens ?? "Provider default"), String(toConfig.max_tokens ?? "Provider default")],
    ["Provider settings", JSON.stringify(fromConfig.provider_settings), JSON.stringify(toConfig.provider_settings)],
  ] as const;

  return fields
    .filter(([, before, after]) => before !== after)
    .map(([field, before, after]) => ({ field, before, after }));
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
    const requested = await searchParams;
    const models = await getModels();
    const projects = await Promise.all(
      models.map(async (model) => {
        const [versions, dataset] = await Promise.all([
          getVersionsByModelId(model.id),
          getEvaluationDatasetByModelId(model.id),
        ]);
        const chronologicalVersions = [...versions].sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );

        return { model, versions: chronologicalVersions, dataset };
      }),
    );

    if (projects.length === 0) {
      return (
        <EmptyState
          title="No projects yet"
          description="Create a project before comparing versions. A version is a particular version of your AI setup."
          action={{ href: "/projects", label: "Create Project" }}
        />
      );
    }

    const selectedProject =
      projects.find((project) => project.model.id === requested.project) ??
      projects.find((project) => project.versions.length >= 2) ??
      projects[0];
    const fromVersion =
      selectedProject.versions.find((version) => version.id === requested.from) ??
      selectedProject.versions.at(-2);
    const toVersion =
      selectedProject.versions.find((version) => version.id === requested.to) ??
      selectedProject.versions.at(-1);
    const selectedVersionIds =
      fromVersion && toVersion && fromVersion.id !== toVersion.id
        ? [fromVersion.id, toVersion.id]
        : null;
    const versionChanges = selectedVersionIds
      ? await getVersionChangesByVersionIds(
          selectedProject.versions.map((version) => version.id),
        )
      : [];
    const [fromConfig, toConfig, evaluations] =
      fromVersion && toVersion
        ? await Promise.all([
            getEffectiveModelVersionConfiguration(fromVersion.id),
            getEffectiveModelVersionConfiguration(toVersion.id),
            getEvaluationsByModelId(selectedProject.model.id),
          ])
        : [null, null, []];
    const results = await getEvaluationResultsByEvaluationIds(
      evaluations.map((evaluation) => evaluation.id),
    );
    const latestRunForVersion = (versionId: string) =>
      evaluations.find((evaluation) => evaluation.model_version_id === versionId) ??
      null;
    const fromRun = fromVersion ? latestRunForVersion(fromVersion.id) : null;
    const toRun = toVersion ? latestRunForVersion(toVersion.id) : null;
    const fromRunResults = fromRun
      ? results.filter((result) => result.evaluation_id === fromRun.id)
      : [];
    const toRunResults = toRun
      ? results.filter((result) => result.evaluation_id === toRun.id)
      : [];
    const fromMetrics =
      fromRun && fromVersion
        ? calculateRunMetrics(fromRun.id, fromRunResults, selectedProject.dataset)
        : null;
    const toMetrics =
      toRun && toVersion
        ? calculateRunMetrics(toRun.id, toRunResults, selectedProject.dataset)
        : null;
    const comparison =
      selectedVersionIds && fromVersion && toVersion
        ? compareVersions(
            selectedProject.dataset,
            fromVersion.id,
            toVersion.id,
            versionChanges,
          )
        : null;
    const evaluationRows: VersionComparisonEvaluationRow[] =
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
    const categoryDeltas = [
      ...new Set([
        ...calculateCategoryMetrics(fromRunResults).map((category) => category.category),
        ...calculateCategoryMetrics(toRunResults).map((category) => category.category),
      ]),
    ].map((category) => {
      const before = calculateCategoryMetrics(fromRunResults).find(
        (entry) => entry.category === category,
      );
      const after = calculateCategoryMetrics(toRunResults).find(
        (entry) => entry.category === category,
      );

      return {
        category,
        passRateDelta:
          typeof before?.pass_rate === "number" && typeof after?.pass_rate === "number"
            ? after.pass_rate - before.pass_rate
            : null,
        scoreDelta:
          typeof before?.average_score === "number" &&
          typeof after?.average_score === "number"
            ? after.average_score - before.average_score
            : null,
      };
    });
    const configChanges = diffConfigs(fromConfig, toConfig);
    const multiVersionRows = selectedProject.versions.map((version) => {
      const run = latestRunForVersion(version.id);
      const runResults = run
        ? results.filter((result) => result.evaluation_id === run.id)
        : [];
      const runMetrics = run
        ? calculateRunMetrics(run.id, runResults, selectedProject.dataset)
        : null;
      const summary = getVersionSummary(selectedProject.dataset, version.id);

      return {
        id: version.id,
        version: version.version,
        passRate: runMetrics?.pass_rate ?? null,
        averageScore: runMetrics?.average_score ?? null,
        regressions: summary.regressionCount,
        recoveries: summary.analyses.filter(
          (analysis) => analysis.classification === "RESOLVED",
        ).length,
        persistentFailures: summary.analyses.filter(
          (analysis) => analysis.classification === "REPEATED_FAILURE",
        ).length,
        latency: runMetrics?.telemetry.average_latency_ms ?? null,
        tokens: runMetrics?.telemetry.total_tokens ?? null,
        cost: runMetrics?.telemetry.estimated_cost_usd ?? null,
      };
    });

    return (
      <div className="space-y-6">
        <PageHeading
          eyebrow="Version reports"
          title="Compare"
          description="Choose two recorded versions for a project, then review their evaluation differences."
        />

        <section className="rounded-md border border-stone-200 bg-white">
          <div className="border-b border-stone-200 p-4">
            <h2 className="text-sm font-semibold text-stone-950">Choose versions</h2>
            <p className="mt-1 text-sm text-stone-600">
              Each project keeps its own version history for comparison.
            </p>
          </div>
          <div className="divide-y divide-stone-200">
            {projects.map((project) => (
              <article key={project.model.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(180px,0.45fr)_minmax(0,1fr)]">
                <div>
                  <h3 className="text-base font-semibold text-stone-950">
                    {project.model.name}
                  </h3>
                  <p className="mt-1 text-sm text-stone-600">
                    {project.versions.length} recorded version{project.versions.length === 1 ? "" : "s"}
                  </p>
                </div>
                <VersionCompareControls
                  projectId={project.model.id}
                  projectName={project.model.name}
                  versions={project.versions.map((version) => ({
                    id: version.id,
                    version: version.version,
                  }))}
                  mode="inline"
                />
              </article>
            ))}
          </div>
        </section>

        {comparison && fromVersion && toVersion ? (
          <>
            <section className="rounded-md border border-stone-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-stone-950">Comparison metrics</h2>
              <div className="mt-3 grid gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 md:grid-cols-4">
                {[
                  ["Pass-rate delta", formatDelta(
                    fromMetrics && toMetrics ? (toMetrics.pass_rate - fromMetrics.pass_rate) * 100 : null,
                    " pts",
                  )],
                  ["Average-score delta", formatDelta(
                    fromMetrics?.average_score !== null &&
                      fromMetrics?.average_score !== undefined &&
                      toMetrics?.average_score !== null &&
                      toMetrics?.average_score !== undefined
                      ? toMetrics.average_score - fromMetrics.average_score
                      : null,
                  )],
                  ["Latency delta", formatDelta(
                    fromMetrics?.telemetry.average_latency_ms !== null &&
                      fromMetrics?.telemetry.average_latency_ms !== undefined &&
                      toMetrics?.telemetry.average_latency_ms !== null &&
                      toMetrics?.telemetry.average_latency_ms !== undefined
                      ? toMetrics.telemetry.average_latency_ms -
                          fromMetrics.telemetry.average_latency_ms
                      : null,
                    "ms",
                  )],
                  ["Token delta", formatDelta(
                    fromMetrics?.telemetry.total_tokens !== null &&
                      fromMetrics?.telemetry.total_tokens !== undefined &&
                      toMetrics?.telemetry.total_tokens !== null &&
                      toMetrics?.telemetry.total_tokens !== undefined
                      ? toMetrics.telemetry.total_tokens -
                          fromMetrics.telemetry.total_tokens
                      : null,
                  )],
                  ["Cost delta", formatDelta(
                    fromMetrics?.telemetry.estimated_cost_usd !== null &&
                      fromMetrics?.telemetry.estimated_cost_usd !== undefined &&
                      toMetrics?.telemetry.estimated_cost_usd !== null &&
                      toMetrics?.telemetry.estimated_cost_usd !== undefined
                      ? toMetrics.telemetry.estimated_cost_usd -
                          fromMetrics.telemetry.estimated_cost_usd
                      : null,
                  )],
                  ["PASS to FAIL", String(comparison.newly_failed_tests)],
                  ["FAIL to PASS", String(comparison.newly_fixed_tests)],
                  ["FAIL to FAIL", String(comparison.unchanged_failures)],
                ].map(([label, value]) => (
                  <div key={label} className="bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">{label}</p>
                    <p className="mt-1 text-lg font-semibold text-stone-950">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <VersionComparison
              title={`${selectedProject.model.name}: ${fromVersion.version} vs ${toVersion.version}`}
              fromVersion={fromVersion.version}
              toVersion={toVersion.version}
              evaluationRows={evaluationRows}
            />

            <section className="rounded-md border border-stone-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-stone-950">Category deltas</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-[520px] text-left text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                    <tr>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Pass-rate delta</th>
                      <th className="px-3 py-2">Score delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200">
                    {categoryDeltas.map((row) => (
                      <tr key={row.category}>
                        <td className="px-3 py-2 font-semibold">{row.category}</td>
                        <td className="px-3 py-2">{formatDelta(row.passRateDelta === null ? null : row.passRateDelta * 100, " pts")}</td>
                        <td className="px-3 py-2">{formatDelta(row.scoreDelta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-md border border-stone-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-stone-950">Configuration changes</h2>
              {configChanges.length === 0 && comparison.version_changes.length === 0 ? (
                <p className="mt-2 text-sm text-stone-600">No stored configuration difference is available for these versions.</p>
              ) : (
                <div className="mt-3 grid gap-3">
                  {configChanges.map((change) => (
                    <article key={change.field} className="rounded-md border border-stone-200 p-3">
                      <p className="text-sm font-semibold text-stone-950">{change.field}</p>
                      <p className="mt-1 text-xs text-stone-600">Before: {change.before || "Empty"}</p>
                      <p className="mt-1 text-xs text-stone-600">After: {change.after || "Empty"}</p>
                    </article>
                  ))}
                  {comparison.version_changes.map((change) => (
                    <article key={change.id} className="rounded-md border border-stone-200 p-3">
                      <p className="text-sm font-semibold text-stone-950">{change.change_type}</p>
                      <p className="mt-1 text-sm text-stone-700">{change.description}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <EmptyState
            title="Choose two different versions"
            description="A project needs at least two recorded versions before ModelLedger can create a comparison report."
          />
        )}

        <section className="rounded-md border border-stone-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-stone-950">
            Multi-version comparison
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Latest run snapshot per version for {selectedProject.model.name}.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[900px] text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                <tr>
                  <th className="px-3 py-2">Version</th>
                  <th className="px-3 py-2">Pass rate</th>
                  <th className="px-3 py-2">Score</th>
                  <th className="px-3 py-2">Regressions</th>
                  <th className="px-3 py-2">Recoveries</th>
                  <th className="px-3 py-2">Persistent</th>
                  <th className="px-3 py-2">Latency</th>
                  <th className="px-3 py-2">Tokens</th>
                  <th className="px-3 py-2">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {multiVersionRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-semibold">
                      <Link href={`/versions/${row.id}`}>{row.version}</Link>
                    </td>
                    <td className="px-3 py-2">{formatPercent(row.passRate)}</td>
                    <td className="px-3 py-2">{row.averageScore === null ? "Unavailable" : row.averageScore.toFixed(2)}</td>
                    <td className="px-3 py-2">{row.regressions}</td>
                    <td className="px-3 py-2">{row.recoveries}</td>
                    <td className="px-3 py-2">{row.persistentFailures}</td>
                    <td className="px-3 py-2">{formatNumber(row.latency)}ms</td>
                    <td className="px-3 py-2">{formatNumber(row.tokens)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
}
