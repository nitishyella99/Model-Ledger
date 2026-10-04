import Link from "next/link";
import { latestOperation } from "@/lib/deployment/service";
import { getDeploymentGuidance } from "@/lib/deployment/guidance";
import { ClipboardList, FileText, FileUp, FolderOpen } from "lucide-react";
import { CreateModelForm } from "@/components/models/create-model-form";
import { PageHeading } from "@/components/models/page-heading";
import { ProjectImportDataDialog } from "@/components/projects/project-import-data-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { createModelAction } from "@/app/models/actions";
import type { CreateModelActionState } from "@/app/models/actions";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import { getEvaluations } from "@/lib/data/evaluations";
import { getModels } from "@/lib/data/models";
import { getRunEvaluationDialogProjects } from "@/lib/data/run-dialog-options";
import { getTestCasesByModelId } from "@/lib/data/test-cases";
import { getVersionsByModelId } from "@/lib/data/versions";
import { getVersionSummary } from "@/lib/evaluation/reporting";

export const dynamic = "force-dynamic";

const initialCreateProjectActionState: CreateModelActionState = {
  status: "idle",
};

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

async function getProjectsPageState() {
  const [models, evaluations, importProjects] = await Promise.all([
    getModels(),
    getEvaluations(),
    getRunEvaluationDialogProjects(),
  ]);
  const rows = await Promise.all(
    models.map(async (model) => {
      const [versions, dataset] = await Promise.all([
        getVersionsByModelId(model.id),
        getEvaluationDatasetByModelId(model.id),
      ]);
      const testCases = await getTestCasesByModelId(model.id);
      const currentVersion =
        versions.find(
          (version) => version.id === model.current_model_version_id,
        ) ?? versions[0];
      const currentSummary =
        currentVersion ? getVersionSummary(dataset, currentVersion.id) : null;
      const latestEvaluation = evaluations
        .filter((evaluation) => evaluation.model_id === model.id)
        .sort(
          (a, b) =>
            new Date(b.evaluated_at).getTime() -
            new Date(a.evaluated_at).getTime(),
        )[0];
      const score = currentSummary
        ? Math.round(currentSummary.metrics.pass_rate * 100)
        : null;
      const needsAttention =
        (currentSummary?.regressionCount ?? 0) > 0 ||
        (currentSummary?.metrics.failed_tests ?? 0) > 0;

      const operation = await latestOperation(model.id);
      const guidance = operation ? getDeploymentGuidance(operation) : null;
      return {
        guidance,
        id: model.id,
        name: model.name,
        type: model.provider,
        version: currentVersion?.version ?? "No version",
        score,
        status: !currentVersion
          ? "Needs version"
          : !latestEvaluation
            ? "No evaluations"
            : needsAttention
              ? "Needs attention"
              : "Healthy",
        lastEvaluated: latestEvaluation
          ? formatDate(latestEvaluation.evaluated_at)
          : "Not evaluated",
        latestEvaluationId: latestEvaluation?.id ?? null,
        testCount: testCases.length,
      };
    }),
  );

  return {
    rows,
    importProjects,
  };
}

export default async function ProjectsPage() {
  let state: Awaited<ReturnType<typeof getProjectsPageState>> | null = null;
  let error: string | null = null;

  try {
    state = await getProjectsPageState();
  } catch (caught) {
    error =
      caught instanceof Error
        ? caught.message
        : "Projects could not load from Supabase.";
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Projects"
        title="Projects"
        description="A project is the AI app you want to test. Open one to review tests, runs, comparisons, and memory in the same workspace."
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <CreateModelForm
              action={createModelAction}
              initialActionState={initialCreateProjectActionState}
              importAction={
                <ProjectImportDataDialog projects={state?.importProjects ?? []} />
              }
            />
            <ProjectImportDataDialog projects={state?.importProjects ?? []} />
          </div>
        }
      />

      {error ? (
        <EmptyState title="Projects unavailable" description={error} />
      ) : !state || state.rows.length === 0 ? (
        <EmptyState
          title="Welcome to ModelLedger"
          description="Test changes to your AI and catch problems before deployment. Get started in 3 steps: create your project, add test cases, then run your first evaluation."
          action={{ href: "/projects?create=true", label: "Create Project" }}
        />
      ) : (
        <>
          <section className="rounded-md border border-stone-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-stone-950">
                  Project table
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  Use the project actions to open the workspace, manage test
                  cases, or review the latest report.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Project</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Version</th>
                    <th className="px-4 py-3 font-semibold">Test cases</th>
                    <th className="px-4 py-3 font-semibold">Score</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {state.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-stone-50">
                      <td className="px-4 py-3 font-semibold text-stone-950">
                        <Link href={`/projects/${row.id}`}>{row.name}</Link>
                      </td>
                      <td className="px-4 py-3 text-stone-600">{row.type}</td>
                      <td className="px-4 py-3 text-stone-600">
                        {row.version}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {row.testCount}
                      </td>
                      <td className="px-4 py-3 font-semibold text-stone-950">
                        {row.score === null ? "No data" : `${row.score}%`}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {row.guidance?.title || row.status}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/model-upload?project=${row.id}`} className="inline-flex h-8 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50">Upload Model</Link>
                          <Link
                            href={row.guidance?.href || `/projects/${row.id}`}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-stone-950 px-3 text-xs font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px"
                          >
                            <FolderOpen
                              className="size-3.5"
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                            {row.guidance?.action || "Open project"}
                          </Link>
                          <Link
                            href={`/projects/${row.id}/tests`}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
                          >
                            <FileUp
                              className="size-3.5"
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                            Import cases
                          </Link>
                          <Link
                            href={`/projects/${row.id}/tests`}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
                          >
                            <ClipboardList
                              className="size-3.5"
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                            Test cases
                          </Link>
                          {row.latestEvaluationId ? (
                            <Link
                              href={`/reports/${row.latestEvaluationId}`}
                              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
                            >
                              <FileText
                                className="size-3.5"
                                strokeWidth={1.8}
                                aria-hidden="true"
                              />
                              Latest report
                            </Link>
                          ) : (
                            <span className="inline-flex h-8 cursor-not-allowed items-center justify-center gap-1.5 rounded-md border border-stone-200 bg-stone-50 px-3 text-xs font-semibold text-stone-400">
                              <FileText
                                className="size-3.5"
                                strokeWidth={1.8}
                                aria-hidden="true"
                              />
                              No report yet
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
