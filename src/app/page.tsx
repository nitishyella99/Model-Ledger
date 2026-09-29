import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import { getEvaluations } from "@/lib/data/evaluations";
import { getModels } from "@/lib/data/models";
import { getVersionsByModelId } from "@/lib/data/versions";
import { getAttentionIssues, getVersionSummary } from "@/lib/evaluation/reporting";
import { VersionCompareControls } from "@/components/models/version-compare-controls";
import { CreateModelForm } from "@/components/models/create-model-form";
import { RunEvaluationDialog } from "@/components/evaluations/run-evaluation-dialog";
import { ProjectImportDataDialog } from "@/components/projects/project-import-data-dialog";
import { createModelAction } from "@/app/models/actions";
import type { CreateModelActionState } from "@/app/models/actions";
import { submitAutomaticEvaluationAction } from "@/app/run-evaluation/actions";
import type { RunEvaluationActionState } from "@/app/run-evaluation/actions";
import { getRunEvaluationDialogProjects } from "@/lib/data/run-dialog-options";

export const dynamic = "force-dynamic";

const initialCreateProjectActionState: CreateModelActionState = {
  status: "idle",
};
const initialRunEvaluationActionState: RunEvaluationActionState = {
  status: "idle",
};

async function getOverviewState() {
  const [models, evaluations, runDialogProjects] = await Promise.all([
    getModels(),
    getEvaluations(),
    getRunEvaluationDialogProjects(),
  ]);
  const projectRows = await Promise.all(
    models.map(async (model) => {
      const [versions, dataset] = await Promise.all([
        getVersionsByModelId(model.id),
        getEvaluationDatasetByModelId(model.id),
      ]);
      const currentVersion =
        versions.find(
          (version) => version.id === model.current_model_version_id,
        ) ?? versions[0];
      const latestEvaluation = evaluations
        .filter((evaluation) => evaluation.model_id === model.id)
        .sort(
          (a, b) =>
            new Date(b.evaluated_at).getTime() -
            new Date(a.evaluated_at).getTime(),
        )[0];
      const summary =
        currentVersion ? getVersionSummary(dataset, currentVersion.id) : null;
      const attention =
        currentVersion ? getAttentionIssues(dataset, currentVersion.id) : [];

      return {
        id: model.id,
        name: model.name,
        type: model.provider,
        version: currentVersion?.version ?? "No version",
        versions: [...versions]
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          )
          .map((version) => ({
            id: version.id,
            version: version.version,
          })),
        score: summary ? Math.round(summary.metrics.pass_rate * 100) : null,
        regressions: summary?.regressionCount ?? 0,
        failures: summary?.metrics.failed_tests ?? 0,
        status: !currentVersion
          ? "Needs version"
          : !latestEvaluation
            ? "No evaluations"
            : attention.length > 0
              ? "Needs attention"
              : "Healthy",
        latestEvaluation,
        attention,
      };
    }),
  );

  return {
    projects: projectRows,
    runDialogProjects,
    attentionProjects: projectRows.filter(
      (row) => row.regressions > 0 || row.failures > 0,
    ),
  };
}

export default async function OverviewPage() {
  let state: Awaited<ReturnType<typeof getOverviewState>> | null = null;
  let error: string | null = null;

  try {
    state = await getOverviewState();
  } catch (caught) {
    error =
      caught instanceof Error
        ? caught.message
        : "Overview data could not load from Supabase.";
  }

  if (error) {
    return <EmptyState title="Overview unavailable" description={error} />;
  }

  if (!state || state.projects.length === 0) {
    return (
      <EmptyState
        title="Welcome to ModelLedger"
        description="Test changes to your AI and catch problems before deployment. Get started in 3 steps: create your project, add test cases, and run your first evaluation."
        action={{ href: "/projects", label: "Create Project" }}
        secondaryAction={{ href: "/projects", label: "Explore Demo Project" }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-950">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-stone-600">
            Projects that need attention based on their latest evaluation results.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CreateModelForm
            action={createModelAction}
            initialActionState={initialCreateProjectActionState}
            importAction={
              <ProjectImportDataDialog projects={state.runDialogProjects} />
            }
          />
          <ProjectImportDataDialog projects={state.runDialogProjects} />
          <RunEvaluationDialog
            action={submitAutomaticEvaluationAction}
            initialState={initialRunEvaluationActionState}
            projects={state.runDialogProjects}
          />
        </div>
      </header>

      <section className="rounded-md border border-stone-200 bg-white">
        <div className="border-b border-stone-200 p-4">
          <h2 className="text-sm font-semibold text-stone-950">
            Projects Requiring Attention
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Only projects with real failed tests or regressions appear here.
          </p>
        </div>
        {state.attentionProjects.length === 0 ? (
          <div className="p-5 text-sm leading-6 text-stone-600">
            No projects currently need review based on stored evaluation data.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Project</th>
                  <th className="px-4 py-3 font-semibold">Current version</th>
                  <th className="px-4 py-3 font-semibold">Regressions</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {state.attentionProjects.map((project) => (
                  <tr key={project.id}>
                    <td className="px-4 py-3 font-semibold text-stone-950">
                      {project.name}
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {project.version}
                    </td>
                    <td className="px-4 py-3 text-stone-950">
                      {project.regressions}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                      <VersionCompareControls
                        projectId={project.id}
                        projectName={project.name}
                        versions={project.versions}
                        mode="dialog"
                      />
                      <Link
                        href={
                          project.latestEvaluation
                            ? `/reports/${project.latestEvaluation.id}`
                            : `/projects/${project.id}`
                        }
                        className="inline-flex h-8 items-center justify-center rounded-md bg-stone-950 px-3 text-xs font-semibold text-white transition-colors hover:bg-stone-800"
                      >
                        View Evaluation Report
                      </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-md border border-stone-200 bg-white">
        <div className="border-b border-stone-200 p-4">
          <h2 className="text-sm font-semibold text-stone-950">
            Your Projects
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-[0.08em] text-stone-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Project</th>
                <th className="px-4 py-3 font-semibold">Version</th>
                <th className="px-4 py-3 font-semibold">Score</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {state.projects.map((project) => (
                <tr key={project.id}>
                  <td className="px-4 py-3 font-semibold text-stone-950">
                    <Link href={`/projects/${project.id}`}>{project.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {project.version}
                  </td>
                  <td className="px-4 py-3 text-stone-950">
                    {project.score === null ? "No data" : `${project.score}%`}
                  </td>
                  <td className="px-4 py-3 text-stone-600">
                    {project.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
