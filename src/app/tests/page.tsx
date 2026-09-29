import Link from "next/link";
import { PageHeading } from "@/components/models/page-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import { getModels } from "@/lib/data/models";
import { getTestCasesByModelId } from "@/lib/data/test-cases";
import { analyzeTestResult } from "@/lib/evaluation/engine";

export const dynamic = "force-dynamic";

async function getTestsState() {
  const models = await getModels();
  const datasets = await Promise.all(
    models.map(async (model) => ({
      model,
      testCases: await getTestCasesByModelId(model.id),
      dataset: await getEvaluationDatasetByModelId(model.id),
    })),
  );

  return datasets.flatMap(({ model, testCases, dataset }) => {
    const latestByTest = new Map<string, (typeof dataset.facts)[number]>();

    for (const fact of dataset.facts) {
      const current = latestByTest.get(fact.testKey);

      if (
        !current ||
        new Date(fact.evaluatedAt).getTime() >
          new Date(current.evaluatedAt).getTime()
      ) {
        latestByTest.set(fact.testKey, fact);
      }
    }

    if (testCases.length > 0) {
      return testCases.map((testCase) => {
        const fact = latestByTest.get(testCase.stable_key) ?? null;
        const analysis = analyzeTestResult(dataset, testCase.stable_key);

        return {
          id: testCase.id,
          evaluationId: fact?.evaluationId ?? null,
          project: model.name,
          test: testCase.name,
          suite: testCase.category,
          lastResult: fact?.result ?? "Not run",
          score:
            fact?.score === null || fact?.score === undefined
              ? null
              : Math.round(fact.score * 100),
          classification: fact ? analysis.classification : "NOT_RUN",
        };
      });
    }

    return [...latestByTest.values()].map((fact) => {
      const analysis = analyzeTestResult(dataset, fact.testKey);

      return {
        id: fact.id,
        evaluationId: fact.evaluationId,
        project: model.name,
        test: fact.testName,
        suite: fact.category,
        lastResult: fact.result,
        score:
          fact.score === null || fact.score === undefined
            ? fact.result === "PASS"
              ? 100
              : 0
            : Math.round(fact.score * 100),
        classification: analysis.classification,
      };
    });
  });
}

export default async function TestsPage() {
  let rows: Awaited<ReturnType<typeof getTestsState>> = [];
  let error: string | null = null;

  try {
    rows = await getTestsState();
  } catch (caught) {
    error =
      caught instanceof Error
        ? caught.message
        : "Tests could not load from stored evaluation results.";
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Test management"
        title="Tests"
        description="A test is a reusable question or task your AI should handle. Canonical test cases stay stable across versions for regression comparison."
      />

      {error ? (
        <EmptyState title="Tests unavailable" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No tests yet"
          description="Tests describe situations your AI should handle. Add examples so ModelLedger can detect whether future versions improve or get worse."
          action={{ href: "/run-evaluation", label: "Add First Test" }}
        />
      ) : (
        <section className="rounded-md border border-stone-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-stone-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-stone-950">
                Test suites
              </h2>
              <p className="mt-1 text-sm text-stone-600">
                {rows.length} tests across{" "}
                {new Set(rows.map((row) => row.suite)).size} suites.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/run-evaluation"
                className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700"
              >
                Run Suite
              </Link>
              <Link
                href="/run-evaluation"
                className="inline-flex h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white"
              >
                + Add Test
              </Link>
              <Link
                href="/run-evaluation"
                className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700"
              >
                Import CSV
              </Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Test</th>
                  <th className="px-4 py-3 font-semibold">Test suite</th>
                  <th className="px-4 py-3 font-semibold">Project</th>
                  <th className="px-4 py-3 font-semibold">Last Result</th>
                  <th className="px-4 py-3 font-semibold">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 font-semibold text-stone-950">
                      {row.evaluationId ? (
                        <Link href={`/reports/${row.evaluationId}`}>
                          {row.test}
                        </Link>
                      ) : (
                        row.test
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-600">{row.suite}</td>
                    <td className="px-4 py-3 text-stone-600">{row.project}</td>
                    <td className="px-4 py-3 text-stone-600">
                      {row.lastResult}
                    </td>
                    <td className="px-4 py-3 text-stone-950">
                      {row.score === null ? "Not run" : `${row.score}%`}
                    </td>
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
