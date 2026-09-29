import Link from "next/link";
import { PageHeading } from "@/components/models/page-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import {
  getEvaluationResultsByEvaluationIds,
  getEvaluations,
} from "@/lib/data/evaluations";
import { getModels } from "@/lib/data/models";
import { getVersionsByModelId } from "@/lib/data/versions";
import { calculateRunMetrics } from "@/lib/evaluation/metrics";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function formatCurrency(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `$${value.toFixed(6)}`
    : "No data";
}

export default async function RunsPage() {
  let rows: Array<{
    id: string;
    version: string;
    project: string;
    tests: number;
    score: number | null;
    passRate: number | null;
    regressions: number;
    tokens: number | null;
    cost: number | null;
    status: string;
    date: string;
  }> = [];
  let error: string | null = null;

  try {
    const [models, evaluations] = await Promise.all([getModels(), getEvaluations()]);
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

    rows = evaluations.map((evaluation) => {
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

      return {
        id: evaluation.id,
        version: version?.version ?? "Unknown version",
        project: entry?.model.name ?? "Unknown project",
        tests: metrics?.total_tests ?? 0,
        score:
          metrics?.average_score === null || metrics?.average_score === undefined
            ? null
            : Math.round(metrics.average_score * 100),
        passRate:
          metrics === null ? null : Math.round(metrics.pass_rate * 100),
        regressions: metrics?.classifications.regressions ?? 0,
        tokens: metrics?.telemetry.total_tokens ?? null,
        cost: metrics?.telemetry.estimated_cost_usd ?? null,
        status: evaluation.status ?? "COMPLETED",
        date: formatDate(evaluation.evaluated_at),
      };
    });
  } catch (caught) {
    error =
      caught instanceof Error ? caught.message : "Runs could not load from Supabase.";
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Runs"
        title="Runs"
        description="A run means testing many cases against one version. Current stored runs may contain one or many results depending on how they were recorded."
      />
      {error ? (
        <EmptyState title="Runs unavailable" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No evaluations yet"
          description="Run your test suite once to create your first baseline."
          action={{ href: "/run-evaluation", label: "Run Evaluation" }}
        />
      ) : (
        <section className="rounded-md border border-stone-200 bg-white">
          <div className="border-b border-stone-200 p-4">
            <h2 className="text-sm font-semibold text-stone-950">Run Reports</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[840px] text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Version</th>
                  <th className="px-4 py-3 font-semibold">Project</th>
                  <th className="px-4 py-3 font-semibold">Tests</th>
                  <th className="px-4 py-3 font-semibold">Score</th>
                  <th className="px-4 py-3 font-semibold">Pass Rate</th>
                  <th className="px-4 py-3 font-semibold">Regressions</th>
                  <th className="px-4 py-3 font-semibold">Tokens</th>
                  <th className="px-4 py-3 font-semibold">Cost</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 font-semibold text-stone-950">
                      <Link href={`/reports/${row.id}`}>{row.version}</Link>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{row.project}</td>
                    <td className="px-4 py-3 text-stone-600">{row.tests}</td>
                    <td className="px-4 py-3 text-stone-950">
                      {row.score === null ? "No data" : `${row.score}%`}
                    </td>
                    <td className="px-4 py-3 text-stone-950">
                      {row.passRate === null ? "No data" : `${row.passRate}%`}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {row.regressions}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {row.tokens ?? "No data"}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {formatCurrency(row.cost)}
                    </td>
                    <td className="px-4 py-3 text-stone-600">{row.status}</td>
                    <td className="px-4 py-3 text-stone-600">{row.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
