import Link from "next/link";
import { CalendarClock, GitBranch, PlayCircle } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";

type DashboardHeaderProps = Readonly<{
  model: {
    name: string;
    description: string;
  };
  currentVersion: {
    version: string;
  };
  lastEvaluation?: string;
  status: {
    tone: "success" | "danger" | "neutral";
    title: string;
    description: string;
  };
}>;

export function DashboardHeader({
  model,
  currentVersion,
  lastEvaluation,
  status,
}: DashboardHeaderProps) {
  return (
    <section className="grid gap-5 border-b border-stone-200 pb-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
          <GitBranch className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
          Current Version: {currentVersion.version}
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-stone-950 md:text-3xl">
          {model.name}
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
          {model.description}
        </p>
        {lastEvaluation ? (
          <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-stone-600">
            <CalendarClock
              className="size-4"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            Last evaluation: {lastEvaluation}
          </p>
        ) : null}
      </div>

      <div
        className={[
          "rounded-md border p-4",
          status.tone === "danger"
            ? "border-rose-200 bg-rose-50"
            : status.tone === "success"
              ? "border-emerald-200 bg-emerald-50"
              : "border-stone-200 bg-white",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
              Primary status
            </p>
            <h3
              className={[
                "mt-2 text-xl font-semibold tracking-tight",
                status.tone === "danger"
                  ? "text-rose-950"
                  : status.tone === "success"
                    ? "text-emerald-950"
                    : "text-stone-950",
              ].join(" ")}
            >
              {status.title}
            </h3>
          </div>
          <StatusBadge tone={status.tone}>
            {status.tone === "danger"
              ? "Needs review"
              : status.tone === "success"
                ? "Healthy"
                : "No data"}
          </StatusBadge>
        </div>
        <p
          className={[
            "mt-2 text-sm leading-6",
            status.tone === "danger"
              ? "text-rose-800"
              : status.tone === "success"
                ? "text-emerald-800"
                : "text-stone-600",
          ].join(" ")}
        >
          {status.description}
        </p>
        <Link
          href="/run-evaluation"
          className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px"
        >
          <PlayCircle className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Run Evaluation
        </Link>
      </div>
    </section>
  );
}
