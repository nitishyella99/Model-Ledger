import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeading } from "@/components/models/page-heading";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { ProjectTestCasesImport } from "@/components/projects/project-test-cases-import";
import { EmptyState } from "@/components/ui/empty-state";
import { getModelById } from "@/lib/data/models";
import { getTestCasesByModelId } from "@/lib/data/test-cases";
import { getVersionsByModelId } from "@/lib/data/versions";
import {
  importTestCasesCsvAction,
  type TestCaseActionState,
} from "@/app/tests/actions";

export const dynamic = "force-dynamic";

type ProjectTestsPageProps = Readonly<{
  params: Promise<{ id: string }>;
}>;

const initialImportState: TestCaseActionState = {
  status: "idle",
};

export default async function ProjectTestsPage({
  params,
}: ProjectTestsPageProps) {
  const { id } = await params;
  const [project, testCases, versions] = await Promise.all([
    getModelById(id),
    getTestCasesByModelId(id),
    getVersionsByModelId(id),
  ]);

  if (!project) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow={project.name}
        title="Project test cases"
        description="Upload or review the reusable test cases for this project. These cases stay stable across versions so reports and comparisons make sense."
        action={
          <Link
            href={`/projects/${project.id}`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
          >
            Back to project
          </Link>
        }
      />

      <section className="rounded-md border border-stone-200 bg-white">
        <div className="border-b border-stone-200 px-4 pt-2">
          <ProjectTabs active="tests" projectId={project.id} />
        </div>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-stone-950">
              {testCases.length} canonical tests
            </h2>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              Import CSV first, then generate a report against a selected
              version.
            </p>
          </div>
          <Link
            href={`/run-evaluation?project=${project.id}`}
            className="inline-flex h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px"
          >
            Generate report
          </Link>
        </div>
      </section>

      <ProjectTestCasesImport
        action={importTestCasesCsvAction}
        initialState={initialImportState}
        modelId={project.id}
        versions={versions.map((version) => ({
          id: version.id,
          version: version.version,
        }))}
      />

      {testCases.length === 0 ? (
        <EmptyState
            title="No test cases yet"
          description="Upload a CSV file above before generating a report. Reports need at least one reusable test case."
        />
      ) : (
        <section className="rounded-md border border-stone-200 bg-white">
          <div className="border-b border-stone-200 p-4">
            <h2 className="text-sm font-semibold text-stone-950">
              Imported tests
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Stored test cases for {project.name}.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Test</th>
                  <th className="px-4 py-3 font-semibold">Version</th>
                  <th className="px-4 py-3 font-semibold">Suite</th>
                  <th className="px-4 py-3 font-semibold">Evaluator</th>
                  <th className="px-4 py-3 font-semibold">Threshold</th>
                  <th className="px-4 py-3 font-semibold">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {testCases.map((testCase) => (
                  <tr key={testCase.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-stone-950">
                        {testCase.name}
                      </p>
                      <p className="mt-1 line-clamp-2 max-w-xl text-sm leading-6 text-stone-600">
                        {testCase.input}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {versions.find(
                        (version) => version.id === testCase.model_version_id,
                      )?.version ?? "Unassigned"}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {testCase.category}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {testCase.evaluator_type.replaceAll("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {testCase.threshold}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {testCase.severity}
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
