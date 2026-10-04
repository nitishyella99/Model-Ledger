import { AddVersionForm } from "@/components/models/add-version-form";
import { EditVersionsForm } from "@/components/models/edit-versions-form";
import { PageHeading } from "@/components/models/page-heading";
import { VersionList } from "@/components/models/version-list";
import type { VersionListItem } from "@/components/models/version-list";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import { getModels } from "@/lib/data/models";
import {
  getVersionChangesByVersionIds,
  getVersionsByModelId,
} from "@/lib/data/versions";
import { getVersionSummary } from "@/lib/evaluation/reporting";
import { addVersionAction, updateVersionsAction } from "./actions";
import type {
  AddVersionActionState,
  UpdateVersionsActionState,
} from "./actions";

export const dynamic = "force-dynamic";

const initialAddVersionActionState: AddVersionActionState = {
  status: "idle",
};
const initialUpdateVersionsActionState: UpdateVersionsActionState = {
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

async function getVersionsPageState() {
  try {
    const models = await getModels();

    if (models.length === 0) {
      return {
        status: "empty" as const,
        title: "No models found",
        description:
          "Seed or create a model before the versions page can show history.",
      };
    }

    const modelStates = await Promise.all(
      models.map(async (model) => {
        const [versions, evaluationDataset] = await Promise.all([
          getVersionsByModelId(model.id),
          getEvaluationDatasetByModelId(model.id),
        ]);
        const versionChanges = await getVersionChangesByVersionIds(
          versions.map((version) => version.id),
        );
        const currentVersion =
          versions.find(
            (version) => version.id === model.current_model_version_id,
          ) ?? versions[0];

        return {
          model,
          versions,
          evaluationDataset,
          versionChanges,
          currentVersion,
        };
      }),
    );

    const versionRows: VersionListItem[] = modelStates
      .flatMap((state) =>
        [...state.versions]
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() -
              new Date(b.created_at).getTime(),
          )
          .map((version) => {
            const versionSummary = getVersionSummary(
              state.evaluationDataset,
              version.id,
            );
            const changes = state.versionChanges
              .filter((change) => change.model_version_id === version.id)
              .map((change) => change.description);

            return {
              id: version.id,
              projectId: state.model.id,
              version: `${state.model.name} ${version.version}`,
              date: formatDate(version.created_at),
              isCurrent: version.id === state.currentVersion?.id,
              status: version.status,
              summary:
                changes.join(" ") ||
                `${state.model.name}: ${version.status.toLowerCase()} model version`,
              changes,
              testsRun: versionSummary.metrics.total_tests,
              passes: versionSummary.metrics.passed_tests,
              failures: versionSummary.metrics.failed_tests,
              passRate: Math.round(versionSummary.metrics.pass_rate * 100),
              regressions: versionSummary.regressionCount,
            };
          }),
      )
      .sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      return {
        status: "ready" as const,
        modelName: "All projects",
        modelOptions: models.map((model) => ({
          label: model.name,
          value: model.id,
        })),
        editProjects: modelStates.map((state) => ({
          id: state.model.id,
          name: state.model.name,
          versions: [...state.versions]
            .sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime(),
            )
            .map((version) => ({
              id: version.id,
              version: version.version,
            })),
        })),
        versionRows,
        comparison: null,
    };
  } catch (error) {
    return {
      status: "error" as const,
      title: "Versions unavailable",
      description:
        error instanceof Error
          ? error.message
          : "The versions page could not load Supabase-backed data.",
    };
  }
}

type VersionsPageProps = Readonly<{
  searchParams?: Promise<{
    project?: string;
  }>;
}>;

export default async function VersionsPage({ searchParams }: VersionsPageProps) {
  const requested = await searchParams;
  const state = await getVersionsPageState();

  if (state.status !== "ready") {
    return (
      <div className="space-y-6">
        <PageHeading
          eyebrow="Model Versions"
          title="Versions"
          description="Create versions in the order you want them compared."
        />
        <PageMessage title={state.title} description={state.description} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow={state.modelName}
        title="Versions"
        description="Add a version, then keep the chronological history visible so comparisons are easy to follow."
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <AddVersionForm
              action={addVersionAction}
              initialActionState={initialAddVersionActionState}
              models={state.modelOptions}
              initialModelId={requested?.project}
            />
            <EditVersionsForm
              action={updateVersionsAction}
              initialActionState={initialUpdateVersionsActionState}
              projects={state.editProjects}
              initialModelId={requested?.project}
            />
          </div>
        }
      />
      <VersionList items={state.versionRows} />
      <PageMessage
        title="Comparison is project-scoped"
        description="Use Compare or open a project workspace to compare versions using that project's stored tests and reports."
      />
    </div>
  );
}
