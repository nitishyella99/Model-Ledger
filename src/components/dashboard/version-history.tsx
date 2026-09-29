import { CheckCircle2, CircleAlert, GitCommitHorizontal } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";

type VersionHistoryItem = Readonly<{
  id: string;
  version: string;
  summary: string;
  date: string;
  isCurrent: boolean;
  hasFailure: boolean;
  hasRegression: boolean;
}>;

type VersionHistoryProps = Readonly<{
  items: VersionHistoryItem[];
}>;

export function VersionHistory({ items }: VersionHistoryProps) {
  return (
    <section
      aria-labelledby="version-history-title"
      className="rounded-md border border-stone-200 bg-white"
    >
      <div className="border-b border-stone-200 p-4">
        <h3
          id="version-history-title"
          className="text-sm font-semibold text-stone-950"
        >
          Version progression
        </h3>
        <p className="mt-1 text-sm text-stone-600">
          Chronological health changes for this model.
        </p>
      </div>

      {items.length > 0 ? (
        <ol className="divide-y divide-stone-200">
          {items.map((item) => {
          const Icon = item.hasFailure ? CircleAlert : CheckCircle2;

          return (
            <li key={item.id} className="grid gap-3 p-4 sm:grid-cols-[auto_1fr]">
              <div
                className={[
                  "flex size-8 items-center justify-center rounded-md",
                  item.hasFailure
                    ? "bg-rose-50 text-rose-700"
                    : "bg-emerald-50 text-emerald-700",
                ].join(" ")}
              >
                <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-stone-950">
                    {item.version}
                  </span>
                  {item.isCurrent ? (
                    <StatusBadge tone="neutral">Current</StatusBadge>
                  ) : null}
                  {item.hasRegression ? (
                    <StatusBadge tone="danger">Regression</StatusBadge>
                  ) : null}
                  {item.hasFailure ? (
                    <StatusBadge tone="danger">Failure</StatusBadge>
                  ) : (
                    <StatusBadge tone="success">Successful</StatusBadge>
                  )}
                </div>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {item.summary}
                </p>
                <p className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-stone-500">
                  <GitCommitHorizontal
                    className="size-3.5"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  {item.date}
                </p>
              </div>
            </li>
          );
          })}
        </ol>
      ) : (
        <div className="p-6 text-sm leading-6 text-stone-600">
          No model versions are available yet.
        </div>
      )}
    </section>
  );
}
