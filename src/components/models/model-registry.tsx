"use client";

import { useMemo, useState } from "react";
import { Activity, ArrowRight, Clock3 } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";

export type ModelRegistryRow = Readonly<{
  id: string;
  name: string;
  provider: string;
  description: string;
  currentVersion: string;
  totalEvaluations: number;
  passRate: number;
  openFailures: number;
  regressionCount: number;
  lastEvaluated: string;
}>;

type ModelRegistryProps = Readonly<{
  rows: ModelRegistryRow[];
}>;

export function ModelRegistry({ rows }: ModelRegistryProps) {
  const [selectedModelId, setSelectedModelId] = useState(rows[0]?.id);
  const selectedModel = useMemo(
    () => rows.find((row) => row.id === selectedModelId) ?? rows[0],
    [rows, selectedModelId],
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
      <section
        aria-labelledby="model-registry-title"
        className="rounded-md border border-slate-200 bg-white"
      >
        <div className="border-b border-slate-200 p-4">
          <h2
            id="model-registry-title"
            className="text-sm font-semibold text-slate-950"
          >
            Model Registry
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Select a model to inspect its current evaluation posture.
          </p>
        </div>

        {rows.length > 0 ? (
          <div className="overflow-x-auto">
          <table className="min-w-[960px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Model
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Provider
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Current
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Latest Pass Rate
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Open Issues
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Last Evaluated
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((row) => {
                const selected = row.id === selectedModel?.id;

                return (
                  <tr
                    key={row.id}
                    className={selected ? "bg-slate-50" : "bg-white"}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedModelId(row.id)}
                        className="group flex items-center gap-2 text-left font-semibold text-slate-950 transition-colors hover:text-slate-700"
                        aria-pressed={selected}
                      >
                        {row.name}
                        <ArrowRight
                          className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {row.provider}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge>{row.currentVersion}</StatusBadge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-950">
                      {row.totalEvaluations > 0 ? `${row.passRate}%` : "No data"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge
                        tone={
                          row.openFailures > 0 || row.regressionCount > 0
                            ? "danger"
                            : row.totalEvaluations > 0
                              ? "success"
                              : "neutral"
                        }
                      >
                        {row.openFailures + row.regressionCount}
                      </StatusBadge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {row.lastEvaluated}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="p-6 text-sm leading-6 text-slate-600">
            No models are available yet.
          </div>
        )}
      </section>

      {selectedModel ? (
        <aside
          aria-label={`${selectedModel.name} details`}
          className="rounded-md border border-slate-200 bg-white p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Model workspace
              </p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                {selectedModel.name}
              </h3>
            </div>
            <StatusBadge
              tone={
                selectedModel.openFailures > 0 ||
                selectedModel.regressionCount > 0
                  ? "danger"
                  : selectedModel.totalEvaluations > 0
                    ? "success"
                    : "neutral"
              }
            >
              {selectedModel.openFailures > 0 ||
              selectedModel.regressionCount > 0
                ? "Needs review"
                : selectedModel.totalEvaluations > 0
                  ? "Healthy"
                  : "No data"}
            </StatusBadge>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {selectedModel.description}
          </p>
          <dl className="mt-5 divide-y divide-slate-200 border-y border-slate-200 text-sm">
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Current version</dt>
              <dd className="font-semibold text-slate-950">
                {selectedModel.currentVersion}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="flex items-center gap-2 text-slate-500">
                <Activity
                  className="size-4"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                Latest pass rate
              </dt>
              <dd className="font-semibold text-slate-950">
                {selectedModel.totalEvaluations > 0
                  ? `${selectedModel.passRate}%`
                  : "No data"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="text-slate-500">Open issues</dt>
              <dd className="font-semibold text-slate-950">
                {selectedModel.openFailures + selectedModel.regressionCount}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <dt className="flex items-center gap-2 text-slate-500">
                <Clock3
                  className="size-4"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                Last evaluated
              </dt>
              <dd className="font-semibold text-slate-950">
                {selectedModel.lastEvaluated}
              </dd>
            </div>
          </dl>
        </aside>
      ) : null}
    </div>
  );
}
