"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitCompareArrows, X } from "lucide-react";

export type ComparisonVersionOption = Readonly<{
  id: string;
  version: string;
}>;

type VersionCompareControlsProps = Readonly<{
  projectId: string;
  projectName: string;
  versions: ComparisonVersionOption[];
  mode: "dialog" | "inline";
}>;

function VersionSelectionForm({
  projectId,
  versions,
  onComplete,
}: Readonly<{
  projectId: string;
  versions: ComparisonVersionOption[];
  onComplete?: () => void;
}>) {
  const router = useRouter();
  const [fromVersion, setFromVersion] = useState(versions.at(-2)?.id ?? "");
  const [toVersion, setToVersion] = useState(versions.at(-1)?.id ?? "");
  const canCompare =
    versions.length >= 2 &&
    Boolean(fromVersion) &&
    Boolean(toVersion) &&
    fromVersion !== toVersion;

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canCompare) return;

        onComplete?.();
        router.push(
          `/compare?project=${encodeURIComponent(projectId)}&from=${encodeURIComponent(fromVersion)}&to=${encodeURIComponent(toVersion)}`,
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-stone-950">First version</span>
          <select
            value={fromVersion}
            onChange={(event) => setFromVersion(event.target.value)}
            disabled={versions.length < 2}
            className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none focus:border-stone-400"
          >
            <option value="">Select version</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.version}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-stone-950">Second version</span>
          <select
            value={toVersion}
            onChange={(event) => setToVersion(event.target.value)}
            disabled={versions.length < 2}
            className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none focus:border-stone-400"
          >
            <option value="">Select version</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.version}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-stone-600">
        Select any two recorded versions. The comparison report uses their saved configuration changes and evaluation outcomes.
      </p>
      <button
        type="submit"
        disabled={!canCompare}
        className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        <GitCompareArrows className="size-4" strokeWidth={1.8} aria-hidden="true" />
        Compare versions
      </button>
    </form>
  );
}

export function VersionCompareControls({
  projectId,
  projectName,
  versions,
  mode,
}: VersionCompareControlsProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (mode === "inline") {
    return <VersionSelectionForm projectId={projectId} versions={versions} />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={versions.length < 2}
        className="inline-flex h-8 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400"
      >
        Compare versions
      </button>
      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4"
          role="presentation"
          onMouseDown={() => setIsOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`compare-${projectId}`}
            className="w-full max-w-lg rounded-md border border-stone-200 bg-white shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
              <div>
                <h2 id={`compare-${projectId}`} className="text-lg font-semibold text-stone-950">
                  Compare versions
                </h2>
                <p className="mt-1 text-sm text-stone-600">{projectName}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close version comparison dialog"
                className="inline-flex size-9 items-center justify-center rounded-md text-stone-600 hover:bg-stone-100 hover:text-stone-950"
              >
                <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
            <div className="p-5">
              <VersionSelectionForm
                projectId={projectId}
                versions={versions}
                onComplete={() => setIsOpen(false)}
              />
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
