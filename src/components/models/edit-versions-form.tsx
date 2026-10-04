"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type {
  UpdateVersionsActionState,
  updateVersionsAction,
} from "@/app/versions/actions";

type VersionOption = Readonly<{
  id: string;
  version: string;
}>;

type ProjectOption = Readonly<{
  id: string;
  name: string;
  versions: VersionOption[];
}>;

type EditableVersion = {
  id: string;
  version: string;
};

type EditVersionsFormProps = Readonly<{
  action: typeof updateVersionsAction;
  initialActionState: UpdateVersionsActionState;
  projects: ProjectOption[];
  initialModelId?: string;
}>;

function getInitialProjectId(projects: ProjectOption[], initialModelId?: string) {
  return (
    projects.find((project) => project.id === initialModelId)?.id ??
    projects[0]?.id ??
    ""
  );
}

function cloneVersions(project?: ProjectOption): EditableVersion[] {
  return project?.versions.map((version) => ({ ...version })) ?? [];
}

export function EditVersionsForm({
  action,
  initialActionState,
  projects,
  initialModelId,
}: EditVersionsFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [projectId, setProjectId] = useState(
    getInitialProjectId(projects, initialModelId),
  );
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId),
    [projectId, projects],
  );
  const [versions, setVersions] = useState(() =>
    cloneVersions(selectedProject),
  );
  const [deletedVersionIds, setDeletedVersionIds] = useState<string[]>([]);
  const [state, formAction, isPending] = useActionState(
    action,
    initialActionState,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  function resetProjectRows() {
    setVersions(cloneVersions(selectedProject));
    setDeletedVersionIds([]);
  }

  function moveVersion(index: number, direction: -1 | 1) {
    setVersions((current) => {
      const targetIndex = index + direction;

      if (targetIndex < 0 || targetIndex >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];

      return next;
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetProjectRows();
          setIsOpen(true);
        }}
        disabled={projects.length === 0}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:translate-y-px disabled:cursor-not-allowed disabled:text-slate-300"
      >
        <Pencil className="size-4" strokeWidth={1.8} aria-hidden="true" />
        Edit Versions
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
            aria-labelledby="edit-versions-title"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
              <div>
                <h2
                  id="edit-versions-title"
                  className="text-lg font-semibold text-slate-950"
                >
                  Edit Versions
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Rename versions, change their order, or delete versions that
                  should not remain in the project history.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
                aria-label="Close edit versions dialog"
              >
                <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            {state.message ? (
              <p
                className={[
                  "mx-5 mt-4 rounded-md border px-3 py-2 text-sm font-medium",
                  state.status === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800",
                ].join(" ")}
              >
                {state.message}
              </p>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <input type="hidden" name="modelId" value={projectId} />
              {deletedVersionIds.map((versionId) => (
                <input
                  key={versionId}
                  type="hidden"
                  name="deletedVersionIds"
                  value={versionId}
                />
              ))}

              <label className="grid gap-2 text-sm">
                <span className="font-semibold text-slate-950">Project</span>
                <select
                  value={projectId}
                  disabled={isPending}
                  onChange={(event) => {
                    const nextProjectId = event.target.value;
                    const nextProject = projects.find(
                      (project) => project.id === nextProjectId,
                    );

                    setProjectId(nextProjectId);
                    setVersions(cloneVersions(nextProject));
                    setDeletedVersionIds([]);
                  }}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:border-slate-400"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-4 grid gap-3">
                {versions.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 p-4 text-sm leading-6 text-slate-600">
                    No versions will remain for this project after saving.
                  </div>
                ) : (
                  versions.map((version, index) => (
                    <div
                      key={version.id}
                      className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_auto] sm:items-end"
                    >
                      <label className="grid gap-2 text-sm">
                        <span className="font-semibold text-slate-950">
                          Version {index + 1}
                        </span>
                        <input type="hidden" name="versionIds" value={version.id} />
                        <input
                          name="versionNames"
                          value={version.version}
                          disabled={isPending}
                          onChange={(event) => {
                            const nextVersion = event.target.value;
                            setVersions((current) =>
                              current.map((item) =>
                                item.id === version.id
                                  ? { ...item, version: nextVersion }
                                  : item,
                              ),
                            );
                          }}
                          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:border-slate-400"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isPending || index === 0}
                          onClick={() => moveVersion(index, -1)}
                          className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-300"
                          aria-label={`Move ${version.version} up`}
                        >
                          <ArrowUp className="size-4" strokeWidth={1.8} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={isPending || index === versions.length - 1}
                          onClick={() => moveVersion(index, 1)}
                          className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:text-slate-300"
                          aria-label={`Move ${version.version} down`}
                        >
                          <ArrowDown className="size-4" strokeWidth={1.8} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            setVersions((current) =>
                              current.filter((item) => item.id !== version.id),
                            );
                            setDeletedVersionIds((current) => [
                              ...current,
                              version.id,
                            ]);
                          }}
                          className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:text-slate-300"
                          aria-label={`Delete ${version.version}`}
                        >
                          <Trash2 className="size-4" strokeWidth={1.8} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-200 p-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isPending}
                onClick={resetProjectRows}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:translate-y-px"
              >
                <RotateCcw className="size-4" strokeWidth={1.8} aria-hidden="true" />
                Reset
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 active:translate-y-px"
              >
                <Save className="size-4" strokeWidth={1.8} aria-hidden="true" />
                {isPending ? "Saving..." : "Save Versions"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
