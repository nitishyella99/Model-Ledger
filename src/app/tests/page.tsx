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

  const projectRows = datasets.map(({ model, testCases }) => ({
    id: model.id,
    name: model.name,
    type: model.provider,
    testCount: testCases.length,
  }));

  const testRows = datasets.flatMap(({ model, testCases, dataset }) => {
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
          projectId: model.id,
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
        projectId: model.id,
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

  return {
    projectRows,
    testRows,
  };
}

export default async function TestsPage() {
  let state: Awaited<ReturnType<typeof getTestsState>> = {
    projectRows: [],
    testRows: [],
  };
  let error: string | null = null;

  try {
    state = await getTestsState();
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
        title="Test Cases"
        description="Use this as the simple test-case hub: choose a project, import cases, or view the cases that already exist."
      />

      {error ? (
        <EmptyState title="Tests unavailable" description={error} />
      ) : state.projectRows.length === 0 ? (
        <EmptyState
          title="No tests yet"
          description="Tests describe situations your AI should handle. Add examples so ModelLedger can detect whether future versions improve or get worse."
          action={{ href: "/projects", label: "Create Project" }}
        />
      ) : (
        <div className="space-y-6">
        <section className="rounded-md border border-stone-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-stone-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-stone-950">
                Test cases by project
              </h2>
              <p className="mt-1 text-sm text-stone-600">
                Import cases into a project, or open the cases already saved
                for that project.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Project name</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Cases</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {state.projectRows.map((row) => (
                  <tr key={row.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 font-semibold text-stone-950">
                      <Link href={`/projects/${row.id}`}>{row.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{row.type}</td>
                    <td className="px-4 py-3 text-stone-600">{row.testCount}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/projects/${row.id}/tests`}
                          className="inline-flex h-8 items-center justify-center rounded-md bg-stone-950 px-3 text-xs font-semibold text-white transition-colors hover:bg-stone-800"
                        >
                          Import
                        </Link>
                        <Link
                          href={`/projects/${row.id}/tests`}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50"
                        >
                          View existing cases
                        </Link>
                        <Link
                          href={`/tests/edit?project=${row.id}`}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50"
                        >
                          Edit test cases
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {state.testRows.length === 0 ? (
          <EmptyState
            title="No imported cases yet"
            description="Open a project from the table above and import a CSV file to create reusable test cases."
          />
        ) : (
          <section className="rounded-md border border-stone-200 bg-white">
            <div className="border-b border-stone-200 p-4">
              <h2 className="text-sm font-semibold text-stone-950">
                Existing cases
              </h2>
              <p className="mt-1 text-sm text-stone-600">
                {state.testRows.length} cases across{" "}
                {new Set(state.testRows.map((row) => row.suite)).size} suites.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Test</th>
                    <th className="px-4 py-3 font-semibold">Test suite</th>
                    <th className="px-4 py-3 font-semibold">Project</th>
                    <th className="px-4 py-3 font-semibold">Last result</th>
                    <th className="px-4 py-3 font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {state.testRows.map((row) => (
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
      )}
    </div>
  );
}
