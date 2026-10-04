"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, X } from "lucide-react";
import { importTestCasesCsvAction } from "@/app/tests/actions";
import type { TestCaseActionState } from "@/app/tests/actions";

type ProjectImportDataDialogProps = Readonly<{
  projects: ReadonlyArray<{
    id: string;
    name: string;
    versions?: ReadonlyArray<{
      id: string;
      version: string;
    }>;
  }>;
}>;

const initialImportState: TestCaseActionState = {
  status: "idle",
};

export function ProjectImportDataDialog({
  projects,
}: ProjectImportDataDialogProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    importTestCasesCsvAction,
    initialImportState,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [modelVersionId, setModelVersionId] = useState("");
  const selectedProject = projects.find((project) => project.id === projectId);
  const versions = useMemo(
    () => selectedProject?.versions ?? [],
    [selectedProject],
  );
  const canUpload = Boolean(modelVersionId) && !isPending;

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-4 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
      >
        <FileUp className="size-4" strokeWidth={1.8} aria-hidden="true" />
        Import Data
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
            aria-labelledby="import-data-title"
            className="w-full max-w-xl rounded-md border border-stone-200 bg-white shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
              <div>
                <h2
                  id="import-data-title"
                  className="text-lg font-semibold text-stone-950"
                >
                  Import project data
                </h2>
                <p className="mt-1 text-sm leading-6 text-stone-600">
                  Choose the project first, then import CSV test data into that
                  project workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-950"
                aria-label="Close import data dialog"
              >
                <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
            <div className="grid gap-4 p-5">
              {projects.length === 0 ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                  Create a project before importing data.
                </p>
              ) : (
                <>
                  <label className="grid gap-2 text-sm">
                    <span className="font-semibold text-stone-950">Project</span>
                    <select
                      value={projectId}
                      onChange={(event) => {
                        setProjectId(event.target.value);
                        setModelVersionId("");
                      }}
                      className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input type="hidden" name="modelId" value={projectId} />
                  <input
                    type="hidden"
                    name="modelVersionId"
                    value={modelVersionId}
                  />
                  <label className="grid gap-2 text-sm">
                    <span className="font-semibold text-stone-950">Version</span>
                    <select
                      value={modelVersionId}
                      onChange={(event) => setModelVersionId(event.target.value)}
                      className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                    >
                      <option value="">Select version</option>
                      {versions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {version.version}
                        </option>
                      ))}
                    </select>
                    {versions.length === 0 ? (
                      <span className="text-xs leading-5 text-amber-700">
                        Create a version before importing CSV data.
                      </span>
                    ) : null}
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="flex items-center gap-2 font-semibold text-stone-950">
                      <FileUp className="size-4" strokeWidth={1.8} aria-hidden="true" />
                      CSV uploader
                    </span>
                    <input
                      name="csvFile"
                      type="file"
                      accept=".csv,text/csv"
                      disabled={!canUpload}
                      className="block w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 file:mr-3 file:rounded file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-stone-800 hover:bg-stone-50 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-400"
                    />
                    <span className="text-xs leading-5 text-stone-500">
                      Select a version first. The CSV will be stored under that
                      version.
                    </span>
                  </label>
                  {state.message ? (
                    <p
                      className={[
                        "rounded-md border px-3 py-2 text-sm font-medium",
                        state.status === "success"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-rose-200 bg-rose-50 text-rose-800",
                      ].join(" ")}
                    >
                      {state.message}
                    </p>
                  ) : null}
                  <p className="text-xs leading-5 text-stone-500">
                    Selected project: {selectedProject?.name}
                  </p>
                </>
              )}
            </div>
            {projects.length > 0 ? (
              <div className="flex flex-col gap-2 border-t border-stone-200 p-5 sm:flex-row sm:justify-end">
                <button
                  type="submit"
                  disabled={!canUpload}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  {isPending ? "Importing..." : "Import"}
                </button>
                <Link
                  href={`/versions?project=${projectId}`}
                  className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
                >
                  Create version
                </Link>
              </div>
            ) : null}
          </form>
        </div>
      ) : null}
    </>
  );
}
