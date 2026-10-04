import {
  CircleAlert,
  FileText,
  GitCommitHorizontal,
  GitCompareArrows,
} from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/dashboard/status-badge";

export type VersionListItem = Readonly<{
  id: string;
  projectId: string;
  version: string;
  date: string;
  isCurrent: boolean;
  status: string;
  summary: string;
  changes: string[];
  testsRun: number;
  passes: number;
  failures: number;
  passRate: number;
  regressions: number;
}>;

type VersionListProps = Readonly<{
  items: VersionListItem[];
}>;

export function VersionList({ items }: VersionListProps) {
  return (
    <section
      aria-labelledby="version-list-title"
      className="rounded-md border border-slate-200 bg-white"
    >
      <div className="border-b border-slate-200 p-4">
        <h2
          id="version-list-title"
          className="text-sm font-semibold text-slate-950"
        >
          Chronological Versions
        </h2>
      </div>
      <ol className="divide-y divide-slate-200">
        {items.map((item) => (
          <li
            key={item.id}
            className="grid gap-5 p-4 sm:p-5"
          >
            <article className="rounded-md border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.04)]">
              <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-950">
                      <Link
                        href={`/versions/${item.id}`}
                        className="transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                      >
                        {item.version}
                      </Link>
                    </h3>
                    {item.isCurrent ? <StatusBadge>Current</StatusBadge> : null}
                    <StatusBadge
                      tone={
                        item.regressions > 0 || item.failures > 0
                          ? "warning"
                          : "success"
                      }
                    >
                      {item.regressions > 0
                        ? "Regression"
                        : item.failures > 0
                          ? "Failure"
                          : item.status}
                    </StatusBadge>
                    <span className="text-xs font-medium text-slate-500">
                      {item.date}
                    </span>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    {item.summary}
                  </p>
                </div>

                <div className="flex gap-2 sm:justify-end">
                  <Link
                    href={`/versions/${item.id}`}
                    title="Open version report"
                    aria-label="Open version report"
                    className="inline-flex size-10 items-center justify-center rounded-md bg-slate-950 text-white transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <FileText
                      className="size-4"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </Link>
                  <Link
                    href={`/compare?project=${item.projectId}&to=${item.id}`}
                    title="Compare version"
                    aria-label="Compare version"
                    className="inline-flex size-10 items-center justify-center rounded-md border border-slate-200 text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    <GitCompareArrows
                      className="size-4"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </Link>
                </div>
              </div>

              <dl className="grid border-y border-slate-200 bg-slate-50/70 text-sm sm:grid-cols-4">
                <div className="border-b border-slate-200 p-4 sm:border-b-0 sm:border-r">
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                    Tests run
                  </dt>
                  <dd className="mt-2 text-lg font-semibold tabular-nums text-slate-950">
                    {item.testsRun}
                  </dd>
                </div>
                <div className="border-b border-slate-200 p-4 sm:border-b-0 sm:border-r">
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                    Pass rate
                  </dt>
                  <dd className="mt-2 text-lg font-semibold tabular-nums text-slate-950">
                    {item.passRate}%
                  </dd>
                </div>
                <div className="border-b border-slate-200 p-4 sm:border-b-0 sm:border-r">
                  <dt className="flex items-center gap-1 text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                    <CircleAlert
                      className="size-3.5"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                    Failures
                  </dt>
                  <dd
                    className={[
                      "mt-2 text-lg font-semibold tabular-nums",
                      item.failures > 0 ? "text-rose-700" : "text-slate-950",
                    ].join(" ")}
                  >
                    {item.failures}
                  </dd>
                </div>
                <div className="p-4">
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                    Regressions
                  </dt>
                  <dd
                    className={[
                      "mt-2 text-lg font-semibold tabular-nums",
                      item.regressions > 0 ? "text-rose-700" : "text-slate-950",
                    ].join(" ")}
                  >
                    {item.regressions}
                  </dd>
                </div>
              </dl>

              {item.changes.length > 0 ? (
                <details className="group p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700 transition-colors hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
                    Show important changes
                  </summary>
                  <ul className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                    {item.changes.map((change) => (
                      <li key={change} className="flex gap-2">
                        <GitCommitHorizontal
                          className="mt-0.5 size-4 shrink-0 text-slate-400"
                          strokeWidth={1.8}
                          aria-hidden="true"
                        />
                        <span>{change}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
