"use client";

import { useState } from "react";
import Link from "next/link";
import { FileUp, X } from "lucide-react";

type ProjectImportDataDialogProps = Readonly<{
  projects: ReadonlyArray<{
    id: string;
    name: string;
  }>;
}>;

export function ProjectImportDataDialog({
  projects,
}: ProjectImportDataDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const selectedProject = projects.find((project) => project.id === projectId);

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
          <section
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
                      onChange={(event) => setProjectId(event.target.value)}
                      className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Link
                      href={`/projects/${projectId}/tests`}
                      className="rounded-md border border-stone-200 bg-white p-4 transition-colors hover:bg-stone-50"
                    >
                      <span className="block text-sm font-semibold text-stone-950">
                        Import test cases CSV
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-stone-600">
                        Upload canonical project tests and expected outputs.
                      </span>
                    </Link>
                    <Link
                      href={`/versions?project=${projectId}`}
                      className="rounded-md border border-stone-200 bg-white p-4 transition-colors hover:bg-stone-50"
                    >
                      <span className="block text-sm font-semibold text-stone-950">
                        Add version details
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-stone-600">
                        Add or configure the version before running reports.
                      </span>
                    </Link>
                  </div>
                  <p className="text-xs leading-5 text-stone-500">
                    Selected project: {selectedProject?.name}
                  </p>
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
