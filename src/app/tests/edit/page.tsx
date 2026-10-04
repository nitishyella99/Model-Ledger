import Link from "next/link";
import { PageHeading } from "@/components/models/page-heading";
import { EditTestCasesForm } from "@/components/tests/edit-test-cases-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getModels } from "@/lib/data/models";
import { getTestCasesByModelId } from "@/lib/data/test-cases";
import { getVersionsByModelId } from "@/lib/data/versions";
import {
  updateTestCasesAction,
  type EditTestCasesActionState,
} from "@/app/tests/actions";

export const dynamic = "force-dynamic";

const initialEditState: EditTestCasesActionState = {
  status: "idle",
};

type EditTestCasesPageProps = Readonly<{
  searchParams?: Promise<{
    project?: string;
    version?: string;
  }>;
}>;

async function getEditPageState() {
  const models = await getModels();
  const projects = await Promise.all(
    models.map(async (model) => {
      const [versions, testCases] = await Promise.all([
        getVersionsByModelId(model.id),
        getTestCasesByModelId(model.id),
      ]);

      return {
        id: model.id,
        name: model.name,
        versions: [...versions]
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          )
          .map((version) => ({
            id: version.id,
            version: version.version,
          })),
        testCases: testCases.map((testCase) => ({
          id: testCase.id,
          modelVersionId: testCase.model_version_id,
          name: testCase.name,
          category: testCase.category,
          input: testCase.input,
          expectedOutput: testCase.expected_output,
          evaluatorType: testCase.evaluator_type,
          threshold: testCase.threshold,
          severity: testCase.severity,
          tags: testCase.tags,
        })),
      };
    }),
  );

  return projects;
}

export default async function EditTestCasesPage({
  searchParams,
}: EditTestCasesPageProps) {
  const requested = await searchParams;
  let projects: Awaited<ReturnType<typeof getEditPageState>> = [];
  let error: string | null = null;

  try {
    projects = await getEditPageState();
  } catch (caught) {
    error =
      caught instanceof Error
        ? caught.message
        : "Test cases could not load from Supabase.";
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Test management"
        title="Edit Test Cases"
        description="Select a project and version, then update the test case details used for future reports."
        action={
          <Link
            href="/tests"
            className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
          >
            Back to test cases
          </Link>
        }
      />

      {error ? (
        <EmptyState title="Editor unavailable" description={error} />
      ) : (
        <EditTestCasesForm
          action={updateTestCasesAction}
          initialState={initialEditState}
          initialProjectId={requested?.project}
          initialVersionId={requested?.version}
          projects={projects}
        />
      )}
    </div>
  );
}
