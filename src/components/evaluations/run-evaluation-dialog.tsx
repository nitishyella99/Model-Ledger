"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, PlayCircle, X } from "lucide-react";
import type {
  RunEvaluationActionState,
  submitAutomaticEvaluationAction,
} from "@/app/run-evaluation/actions";

type RunEvaluationProject = Readonly<{
  id: string;
  name: string;
  versions: ReadonlyArray<{
    id: string;
    version: string;
    configured: boolean;
  }>;
  testCases: ReadonlyArray<{
    id: string;
    modelVersionId: string | null;
    name: string;
  }>;
}>;

type RunEvaluationDialogProps = Readonly<{
  action: typeof submitAutomaticEvaluationAction;
  initialState: RunEvaluationActionState;
  projects: RunEvaluationProject[];
  initialProjectId?: string;
  label?: string;
  variant?: "primary" | "secondary" | "sidebar";
}>;

const reportTypes = [
  {
    value: "complete",
    label: "Selected version report",
    description: "Run the selected version against its test cases and save the report.",
  },
  {
    value: "all_project_reports",
    label: "All versions for this project",
    description: "Run every version in order and update the project reports.",
  },
] as const;

function getDefaultVersionId(project: RunEvaluationProject | undefined) {
  return (
    project?.versions.find((version) => version.configured)?.id ??
    project?.versions[0]?.id ??
    ""
  );
}

export function RunEvaluationDialog({
  action,
  initialState,
  projects,
  initialProjectId,
  label = "Generate Report",
  variant = "primary",
}: RunEvaluationDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(action, initialState);
  const defaultProjectId = initialProjectId ?? projects[0]?.id ?? "";
  const [projectId, setProjectId] = useState(defaultProjectId);
  const selectedProject =
    projects.find((project) => project.id === projectId) ?? projects[0];
  const defaultVersionId = getDefaultVersionId(selectedProject);
  const [versionId, setVersionId] = useState(defaultVersionId);
  const [reportType, setReportType] =
    useState<(typeof reportTypes)[number]["value"]>("complete");
  const selectedVersion = selectedProject?.versions.find(
    (version) => version.id === versionId,
  );
  const selectedVersionTests =
    selectedProject?.testCases.filter(
      (testCase) =>
        testCase.modelVersionId === null ||
        reportType === "all_project_reports" ||
        testCase.modelVersionId === versionId,
    ) ?? [];
  const selectedReport = useMemo(
    () => reportTypes.find((report) => report.value === reportType),
    [reportType],
  );
  const canRun = Boolean(
    selectedProject &&
      selectedProject.testCases.length > 0 &&
      (reportType === "all_project_reports"
        ? selectedProject.versions.length > 0
        : selectedVersion && selectedVersion.configured),
  );

  function openDialog() {
    const nextProject =
      projects.find((project) => project.id === projectId) ??
      projects.find((project) => project.id === initialProjectId) ??
      projects[0];

    if (nextProject) {
      setProjectId(nextProject.id);

      if (!nextProject.versions.some((version) => version.id === versionId)) {
        setVersionId(getDefaultVersionId(nextProject));
      }
    }

    setIsOpen(true);
  }

  function selectProject(nextProjectId: string) {
    const nextProject = projects.find((project) => project.id === nextProjectId);
    const nextVersionId = getDefaultVersionId(nextProject);

    setProjectId(nextProjectId);
    setVersionId(nextVersionId);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={[
          "inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors active:translate-y-px",
          variant === "sidebar"
            ? "mb-3 w-full bg-white text-stone-950 hover:bg-stone-200"
            : variant === "primary"
            ? "bg-stone-950 text-white hover:bg-stone-800"
            : "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
        ].join(" ")}
      >
        <PlayCircle className="size-4" strokeWidth={1.8} aria-hidden="true" />
        {label}
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-stone-950/35 p-4 sm:items-center sm:justify-center"
          role="presentation"
          onMouseDown={() => setIsOpen(false)}
        >
          <form
            action={formAction}
            role="dialog"
            aria-modal="true"
            aria-labelledby="run-evaluation-dialog-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-md border border-stone-200 bg-white shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
              <div>
                <h2
                  id="run-evaluation-dialog-title"
                  className="text-lg font-semibold text-stone-950"
                >
                  Run evaluation
                </h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  Choose a project and version. The generated report is stored
                  in Reports.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-950"
                aria-label="Close run evaluation dialog"
              >
                <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
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
                  value={reportType === "all_project_reports" ? "all" : versionId}
                  disabled={reportType === "all_project_reports"}
                  onChange={(event) => setVersionId(event.target.value)}
                  className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400 disabled:bg-stone-100 disabled:text-stone-500"
                >
                  {reportType === "all_project_reports" ? (
                    <option value="all">All versions ({selectedProject?.versions.length ?? 0})</option>
                  ) : (
                    <>
                      <option value="">Select version</option>
                      {selectedProject?.versions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.version}
                          {version.configured ? "" : " (needs configuration)"}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>
              <label className="grid gap-2 text-sm md:col-span-2">
                  <span className="font-semibold text-stone-950">Report scope</span>
                <select
                  value={reportType}
                  onChange={(event) =>
                    setReportType(
                      event.target.value as (typeof reportTypes)[number]["value"],
                    )
                  }
                  className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                >
                  {reportTypes.map((report) => (
                    <option key={report.value} value={report.value}>
                      {report.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs leading-5 text-stone-500">
                  {selectedReport?.description}
                </span>
              </label>
            </div>

            <input type="hidden" name="modelId" value={projectId} />
            <input type="hidden" name="modelVersionId" value={versionId} />
            <input type="hidden" name="reportType" value={reportType} />
            {selectedVersionTests.map((testCase) => (
              <input
                key={testCase.id}
                type="hidden"
                name="testCaseIds"
                value={testCase.id}
              />
            ))}

            <div className="border-t border-stone-200 p-5">
              <dl className="grid gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 sm:grid-cols-3">
                {[
                  ["Tests", selectedVersionTests.length],
                  ["Version ready", selectedVersion?.configured ? "Yes" : "No"],
                  ["Saved to", "Reports"],
                ].map(([key, value]) => (
                  <div key={key} className="bg-white p-3">
                    <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                      {key}
                    </dt>
                    <dd className="mt-1 text-sm font-semibold text-stone-950">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              {state.message ? (
                <div
                  className={[
                    "mt-4 rounded-md border px-3 py-2 text-sm font-medium",
                    state.status === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-rose-200 bg-rose-50 text-rose-800",
                  ].join(" ")}
                >
                  <p>{state.message}</p>
                  {state.queuedProjectId && <Link href={`/projects/${state.queuedProjectId}`} className="mt-2 inline-flex font-semibold underline">Follow evaluation progress</Link>}
                  {state.createdEvaluationId ? (
                    <Link
                      href={`/reports/${state.createdEvaluationId}`}
                      className="mt-2 inline-flex items-center gap-2 font-semibold text-emerald-900 underline-offset-4 hover:underline"
                    >
                      <FileText className="size-4" aria-hidden="true" />
                      Open stored report
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {!canRun ? (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-medium">
                    This project needs at least one configured version and one
                    imported test before it can run from this dialog.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedProject &&
                    (!selectedVersion ||
                      !selectedVersion.configured ||
                      selectedProject.versions.length === 0) ? (
                      <Link
                        href={
                          selectedVersion
                            ? `/versions/${selectedVersion.id}`
                            : `/versions?project=${selectedProject.id}`
                        }
                        onClick={() => setIsOpen(false)}
                        className="inline-flex h-8 items-center justify-center rounded-md bg-stone-950 px-3 text-xs font-semibold text-white transition-colors hover:bg-stone-800"
                      >
                        Configure version
                      </Link>
                    ) : null}
                    {selectedProject &&
                    (selectedProject.testCases.length === 0 ||
                      selectedVersionTests.length === 0) ? (
                      <Link
                        href={`/projects/${selectedProject.id}/tests`}
                        onClick={() => setIsOpen(false)}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 transition-colors hover:bg-stone-50"
                      >
                        Import tests
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={!canRun || isPending}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  {isPending ? "Generating..." : "Generate report"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
