import { CircleAlert, GitCommitHorizontal } from "lucide-react";
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
          className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-slate-950">
                  <Link href={`/versions/${item.id}`}>{item.version}</Link>
                </h3>
                {item.isCurrent ? <StatusBadge>Current</StatusBadge> : null}
                <StatusBadge
                  tone={item.regressions > 0 || item.failures > 0 ? "warning" : "success"}
                >
                  {item.regressions > 0
                    ? "Regression"
                    : item.failures > 0
                      ? "Failure"
                      : item.status}
                </StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {item.summary}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/versions/${item.id}`}
                  className="inline-flex h-8 items-center justify-center rounded-md bg-slate-950 px-3 text-xs font-semibold text-white"
                >
                  Open Version Report
                </Link>
                <Link
                  href={`/compare?project=${item.projectId}&to=${item.id}`}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700"
                >
                  Compare
                </Link>
              </div>
              {item.changes.length > 0 ? (
                <details className="mt-3 group">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700 transition-colors hover:text-slate-950">
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
            </div>

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 text-sm sm:grid-cols-4 lg:grid-cols-1">
              <div className="bg-slate-50 p-3">
                <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                  Date
                </dt>
                <dd className="mt-1 font-semibold text-slate-950">
                  {item.date}
                </dd>
              </div>
              <div className="bg-white p-3">
                <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                  Tests run
                </dt>
                <dd className="mt-1 font-semibold text-slate-950">
                  {item.testsRun}
                </dd>
              </div>
              <div className="bg-white p-3">
                <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                  Pass rate
                </dt>
                <dd className="mt-1 font-semibold text-slate-950">
                  {item.passRate}%
                </dd>
              </div>
              <div className="bg-white p-3">
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
                    "mt-1 font-semibold",
                    item.failures > 0 ? "text-rose-700" : "text-slate-950",
                  ].join(" ")}
                >
                  {item.failures}
                </dd>
              </div>
              <div className="col-span-2 bg-white p-3 sm:col-span-1 lg:col-span-1">
                <dt className="text-xs font-medium uppercase tracking-[0.08em] text-slate-500">
                  Regressions
                </dt>
                <dd
                  className={[
                    "mt-1 font-semibold",
                    item.regressions > 0 ? "text-rose-700" : "text-slate-950",
                  ].join(" ")}
                >
                  {item.regressions}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}
