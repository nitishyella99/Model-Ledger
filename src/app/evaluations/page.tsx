import { EvaluationsTable } from "@/components/evaluations/evaluations-table";
import type {
  EvaluationHistoryRow,
  EvaluationResultLabel,
  EvaluationSeverity,
} from "@/components/evaluations/evaluations-table";
import { PageHeading } from "@/components/models/page-heading";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import { getModels } from "@/lib/data/models";
import { analyzeEvaluationFacts } from "@/lib/evaluation/reporting";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

function getHistoricalContext(
  analysis: ReturnType<typeof analyzeEvaluationFacts>[number],
) {
  if (analysis.regression.isRegression) {
    return `Previously passed in ${
      analysis.regression.previousPassingVersion ?? "an earlier version"
    }.`;
  }

  if (analysis.classification === "REPEATED_FAILURE") {
    return `Failed before in ${
      analysis.repeatedFailure.most_recent_previous_failure ?? "an earlier version"
    }.`;
  }

  if (analysis.classification === "RESOLVED") {
    return `Previously failed, resolved in ${analysis.fact.version}.`;
  }

  if (analysis.classification === "NEW_FAILURE") {
    return "No earlier failure recorded.";
  }

  return "Stable stored history.";
}

function PageMessage({
  title,
  description,
}: Readonly<{
  title: string;
  description: string;
}>) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </section>
  );
}

async function getEvaluationsPageState() {
  try {
    const models = await getModels();
    const datasets = await Promise.all(
      models.map((model) => getEvaluationDatasetByModelId(model.id)),
    );
    const rows: EvaluationHistoryRow[] = datasets.flatMap((dataset) =>
      analyzeEvaluationFacts(dataset).map((analysis) => ({
        id: analysis.fact.id,
        evaluationId: analysis.fact.evaluationId,
        test: analysis.fact.testName,
        category: analysis.fact.category,
        version: analysis.fact.version,
        result: analysis.fact.result as EvaluationResultLabel,
        severity: (analysis.fact.severity ?? "LOW") as EvaluationSeverity,
        regression: analysis.regression.isRegression,
        issueType: analysis.classification,
        historicalContext: getHistoricalContext(analysis),
        evaluatedDate: formatDate(analysis.fact.evaluatedAt),
        evaluatedAt: analysis.fact.evaluatedAt,
      })),
    );

    return {
      status: "ready" as const,
      rows,
      versions: [...new Set(rows.map((row) => row.version))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
      categories: [...new Set(rows.map((row) => row.category))].sort(),
      issueTypes: [...new Set(rows.map((row) => row.issueType))].sort(),
    };
  } catch (error) {
    return {
      status: "error" as const,
      description:
        error instanceof Error
          ? error.message
          : "The evaluations page could not load Supabase-backed data.",
    };
  }
}

export default async function EvaluationsPage() {
  const state = await getEvaluationsPageState();

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Evaluation History"
        title="Evaluations"
        description="Scan stored test outcomes by version, severity, and category."
      />
      {state.status === "ready" ? (
        <EvaluationsTable
          rows={state.rows}
          versions={state.versions}
          categories={state.categories}
          issueTypes={state.issueTypes}
        />
      ) : (
        <PageMessage
          title="Evaluations unavailable"
          description={state.description}
        />
      )}
    </div>
  );
}
