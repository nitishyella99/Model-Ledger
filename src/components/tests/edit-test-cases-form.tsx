"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import type {
  EditTestCasesActionState,
  updateTestCasesAction,
} from "@/app/tests/actions";

type EditProject = Readonly<{
  id: string;
  name: string;
  versions: ReadonlyArray<{
    id: string;
    version: string;
  }>;
  testCases: ReadonlyArray<{
    id: string;
    modelVersionId: string | null;
    name: string;
    category: string;
    input: string;
    expectedOutput: string;
    evaluatorType: "exact_match" | "contains" | "llm_judge";
    threshold: number;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    tags: string[];
  }>;
}>;

type EditTestCasesFormProps = Readonly<{
  action: typeof updateTestCasesAction;
  initialState: EditTestCasesActionState;
  initialProjectId?: string;
  initialVersionId?: string;
  projects: EditProject[];
}>;

const evaluatorOptions = [
  { value: "exact_match", label: "Exact match" },
  { value: "contains", label: "Contains" },
  { value: "llm_judge", label: "LLM judge" },
] as const;

const severityOptions = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

function getInitialProject(
  projects: EditProject[],
  initialProjectId: string | undefined,
) {
  return (
    projects.find((project) => project.id === initialProjectId) ?? projects[0]
  );
}

function getInitialVersionId(
  project: EditProject | undefined,
  initialVersionId: string | undefined,
) {
  return (
    project?.versions.find((version) => version.id === initialVersionId)?.id ??
    project?.versions[0]?.id ??
    ""
  );
}

export function EditTestCasesForm({
  action,
  initialState,
  initialProjectId,
  initialVersionId,
  projects,
}: EditTestCasesFormProps) {
  const initialProject = getInitialProject(projects, initialProjectId);
  const [projectId, setProjectId] = useState(initialProject?.id ?? "");
  const [versionId, setVersionId] = useState(
    getInitialVersionId(initialProject, initialVersionId),
  );
  const [state, formAction, isPending] = useActionState(action, initialState);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? projects[0],
    [projectId, projects],
  );
  const selectedVersion = selectedProject?.versions.find(
    (version) => version.id === versionId,
  );
  const cases = useMemo(
    () =>
      selectedProject?.testCases.filter(
        (testCase) => testCase.modelVersionId === versionId,
      ) ?? [],
    [selectedProject, versionId],
  );

  function selectProject(nextProjectId: string) {
    const nextProject = projects.find((project) => project.id === nextProjectId);

    setProjectId(nextProjectId);
    setVersionId(nextProject?.versions[0]?.id ?? "");
  }

  if (projects.length === 0) {
    return (
      <section className="rounded-md border border-stone-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-stone-950">
          No projects yet
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Create a project before editing test cases.
        </p>
      </section>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="modelId" value={projectId} />
      <input type="hidden" name="modelVersionId" value={versionId} />

      <section className="rounded-md border border-stone-200 bg-white">
        <div className="grid gap-4 border-b border-stone-200 p-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-stone-950">Project</span>
            <select
              value={projectId}
              onChange={(event) => selectProject(event.target.value)}
              className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-stone-950">Version</span>
            <select
              value={versionId}
              onChange={(event) => setVersionId(event.target.value)}
              className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
            >
              {selectedProject?.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.version}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-stone-950">
              {selectedProject?.name ?? "Project"}{" "}
              {selectedVersion ? selectedVersion.version : ""}
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              {cases.length} editable test case{cases.length === 1 ? "" : "s"}{" "}
              for this version.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={projectId ? `/projects/${projectId}/tests` : "/tests"}
              className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
            >
              Import cases
            </Link>
            <button
              type="submit"
              disabled={isPending || cases.length === 0}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px disabled:cursor-not-allowed disabled:bg-stone-300"
            >
              <Save className="size-4" strokeWidth={1.8} aria-hidden="true" />
              {isPending ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
        {state.message ? (
          <p
            className={[
              "mx-4 mb-4 rounded-md border px-3 py-2 text-sm font-medium",
              state.status === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800",
            ].join(" ")}
          >
            {state.message}
          </p>
        ) : null}
      </section>

      {cases.length === 0 ? (
        <section className="rounded-md border border-stone-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-stone-950">
            No cases for this version
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Import test cases for this project and version before editing.
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          {cases.map((testCase, index) => (
            <article
              key={testCase.id}
              className="rounded-md border border-stone-200 bg-white"
            >
              <input type="hidden" name="testCaseId" value={testCase.id} />
              <div className="grid gap-4 border-b border-stone-200 p-4 md:grid-cols-[minmax(0,1fr)_180px]">
                <label className="grid gap-2 text-sm">
                  <span className="font-semibold text-stone-950">
                    Test name
                  </span>
                  <input
                    name="name"
                    defaultValue={testCase.name}
                    className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-semibold text-stone-950">Suite</span>
                  <input
                    name="category"
                    defaultValue={testCase.category}
                    className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                  />
                </label>
              </div>
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span className="font-semibold text-stone-950">Input</span>
                  <textarea
                    name="input"
                    defaultValue={testCase.input}
                    rows={5}
                    className="resize-y rounded-md border border-stone-200 bg-white px-3 py-2 text-sm leading-6 text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-semibold text-stone-950">
                    Expected output
                  </span>
                  <textarea
                    name="expectedOutput"
                    defaultValue={testCase.expectedOutput}
                    rows={5}
                    className="resize-y rounded-md border border-stone-200 bg-white px-3 py-2 text-sm leading-6 text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                  />
                </label>
              </div>
              <div className="grid gap-4 border-t border-stone-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="grid gap-2 text-sm">
                  <span className="font-semibold text-stone-950">
                    Evaluator
                  </span>
                  <select
                    name="evaluatorType"
                    defaultValue={testCase.evaluatorType}
                    className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                  >
                    {evaluatorOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-semibold text-stone-950">
                    Threshold
                  </span>
                  <input
                    name="threshold"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    defaultValue={testCase.threshold}
                    className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-semibold text-stone-950">Severity</span>
                  <select
                    name="severity"
                    defaultValue={testCase.severity}
                    className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                  >
                    {severityOptions.map((severity) => (
                      <option key={severity} value={severity}>
                        {severity}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-semibold text-stone-950">Tags</span>
                  <input
                    name="tags"
                    defaultValue={testCase.tags.join(";")}
                    className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                  />
                </label>
              </div>
              <div className="border-t border-stone-200 bg-stone-50 px-4 py-2 text-xs font-medium text-stone-500">
                Case {index + 1}
              </div>
            </article>
          ))}
        </section>
      )}
    </form>
  );
}
