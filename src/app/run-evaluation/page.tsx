import { RunEvaluationForm } from "@/components/evaluations/run-evaluation-form";
import { PageHeading } from "@/components/models/page-heading";
import Link from "next/link";
import { getEffectiveModelVersionConfiguration } from "@/lib/data/model-configurations";
import { getModels } from "@/lib/data/models";
import { getTestCasesByModelId } from "@/lib/data/test-cases";
import { getVersionsByModelId } from "@/lib/data/versions";
import {
  submitAutomaticEvaluationAction,
} from "./actions";
import type { RunEvaluationActionState } from "./actions";
import {
  createTestCaseAction,
  importTestCasesCsvAction,
  type TestCaseActionState,
} from "@/app/tests/actions";

export const dynamic = "force-dynamic";

const initialActionState: RunEvaluationActionState = {
  status: "idle",
};
const initialTestCaseActionState: TestCaseActionState = {
  status: "idle",
};

function PageMessage({
  title,
  description,
  action,
}: Readonly<{
  title: string;
  description: string;
  action?: {
    href: string;
    label: string;
  };
}>) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 active:translate-y-px"
        >
          {action.label}
        </Link>
      ) : null}
    </section>
  );
}

async function getRunEvaluationPageState() {
  try {
    const models = await getModels();
    const versionEntries = await Promise.all(
      models.map(async (model) => [
        model.id,
        await getVersionsByModelId(model.id),
      ] as const),
    );
    const allVersions = versionEntries.flatMap(([, versions]) => versions);
    const [testCaseEntries, configurationEntries] = await Promise.all([
      Promise.all(
        models.map(async (model) => [
          model.id,
          await getTestCasesByModelId(model.id),
        ] as const),
      ),
      Promise.all(
        allVersions.map(async (version) => [
          version.id,
          await getEffectiveModelVersionConfiguration(version.id),
        ] as const),
      ),
    ]);

    return {
      status: "ready" as const,
      models: models.map((model) => ({
        label: model.name,
        value: model.id,
      })),
      versions: versionEntries.flatMap(([modelId, versions]) =>
        versions.map((version) => ({
          label: version.version,
          value: version.id,
          modelId,
        })),
      ),
      testCases: testCaseEntries.flatMap(([, testCases]) =>
        testCases.map((testCase) => ({
          id: testCase.id,
          modelId: testCase.model_id,
          modelVersionId: testCase.model_version_id,
          stableKey: testCase.stable_key,
          name: testCase.name,
          category: testCase.category,
          evaluatorType: testCase.evaluator_type,
          threshold: testCase.threshold,
          severity: testCase.severity,
          input: testCase.input,
          expectedOutput: testCase.expected_output,
          tags: testCase.tags,
        })),
      ),
      configurations: configurationEntries.map(([, configuration]) => ({
        modelVersionId: configuration.model_version_id,
        provider: configuration.provider,
        modelName: configuration.model_name,
        baseUrl: configuration.base_url,
        credentialReference: configuration.credential_reference,
        temperature: configuration.temperature,
        maxTokens: configuration.max_tokens,
      })),
    };
  } catch (error) {
    return {
      status: "error" as const,
      description:
        error instanceof Error
          ? error.message
          : "The run evaluation form could not load Supabase-backed options.",
    };
  }
}

type RunEvaluationPageProps = Readonly<{
  searchParams?: Promise<{
    project?: string;
    version?: string;
    testKey?: string | string[];
  }>;
}>;

export default async function RunEvaluationPage({
  searchParams,
}: RunEvaluationPageProps) {
  const requested = await searchParams;
  const state = await getRunEvaluationPageState();

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Test This Version"
        title="Test This Version"
        description="Run canonical test cases against an executable version. ModelLedger captures outputs, evaluator evidence, telemetry, regressions, and Hindsight context when configured."
      />
      {state.status === "ready" ? (
        state.models.length === 0 ? (
          <PageMessage
            title="Add your first model"
            description="Create a project before running evaluations. ModelLedger needs a project and version so it can compare results over time."
            action={{
              href: "/projects",
              label: "Create Project",
            }}
          />
        ) : state.versions.length === 0 ? (
          <PageMessage
            title="No versions available"
            description="Add a model version before recording evaluation results."
            action={{
              href: "/versions",
              label: "Add Version",
            }}
          />
        ) : (
          <RunEvaluationForm
            models={state.models}
            versions={state.versions}
            testCases={state.testCases}
            configurations={state.configurations}
            initialRunState={initialActionState}
            initialTestCaseState={initialTestCaseActionState}
            runAction={submitAutomaticEvaluationAction}
            createTestCaseAction={createTestCaseAction}
            importCsvAction={importTestCasesCsvAction}
            initialModelId={requested?.project}
            initialVersionId={requested?.version}
            initialTestKeys={requested?.testKey ? (Array.isArray(requested.testKey) ? requested.testKey : [requested.testKey]) : []}
          />
        )
      ) : (
        <PageMessage
          title="Run evaluation unavailable"
          description={state.description}
        />
      )}
    </div>
  );
}
