import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";

type AttentionItem = Readonly<{
  id: string;
  title: string;
  severity: string;
  status: string;
  summary: string;
  currentVersion: string;
  previousOccurrence?: string;
  previousResolution?: string;
  historicalMemoryAvailable?: boolean;
  aiAnalysisAvailable?: boolean;
  href: string;
}>;

type AttentionRequiredProps = Readonly<{
  items: AttentionItem[];
  pendingMessage?: string;
}>;

export function AttentionRequired({
  items,
  pendingMessage,
}: AttentionRequiredProps) {
  return (
    <section
      aria-labelledby="attention-required-title"
      className={[
        "rounded-md border bg-white",
        items.length > 0 ? "border-rose-200" : "border-emerald-200",
      ].join(" ")}
    >
      <div
        className={[
          "flex items-start gap-3 border-b p-4",
          items.length > 0
            ? "border-rose-100 bg-rose-50"
            : "border-emerald-100 bg-emerald-50",
        ].join(" ")}
      >
        <span
          className={[
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md",
            items.length > 0
              ? "bg-rose-100 text-rose-700"
              : "bg-emerald-100 text-emerald-700",
          ].join(" ")}
        >
          {items.length > 0 ? (
            <AlertTriangle
              className="size-4"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          ) : (
            <CheckCircle2
              className="size-4"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          )}
        </span>
        <div className="min-w-0">
          <h3
            id="attention-required-title"
            className={[
              "text-sm font-semibold",
              items.length > 0 ? "text-rose-950" : "text-emerald-950",
            ].join(" ")}
          >
            {items.length > 0 ? "Attention required" : "No attention items"}
          </h3>
          <p
            className={[
              "mt-1 text-sm",
              items.length > 0 ? "text-rose-800" : "text-emerald-800",
            ].join(" ")}
          >
            {items.length > 0
              ? "Failures and regressions that should be inspected before this version is trusted."
              : "Stored evaluation facts do not show current regressions or high-priority failures."}
          </p>
        </div>
      </div>

      <div className="divide-y divide-stone-200">
        {items.length > 0 ? (
          items.map(
          (item) => (
            <article
              key={item.id}
              className="grid gap-4 p-4 lg:grid-cols-[1.4fr_1fr_auto] lg:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-base font-semibold text-stone-950">
                    {item.title}
                  </h4>
                  <StatusBadge tone="danger">
                    {item.severity.toUpperCase()}
                  </StatusBadge>
                  <StatusBadge tone="warning">
                    {item.status.toUpperCase()}
                  </StatusBadge>
                  {item.historicalMemoryAvailable ? (
                    <StatusBadge tone="neutral">
                      HISTORICAL MEMORY AVAILABLE
                    </StatusBadge>
                  ) : null}
                  {item.aiAnalysisAvailable ? (
                    <StatusBadge tone="neutral">AI ANALYSIS AVAILABLE</StatusBadge>
                  ) : null}
                </div>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                  {item.summary}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-1">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                    Current version
                  </dt>
                  <dd className="mt-1 font-semibold text-stone-950">
                    {item.currentVersion}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                    Previous occurrence
                  </dt>
                  <dd className="mt-1 font-semibold text-stone-950">
                    {item.previousOccurrence ?? "Not recorded"}
                  </dd>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                    Previous resolution
                  </dt>
                  <dd className="mt-1 font-semibold text-stone-950">
                    {item.previousResolution ?? "Not recorded"}
                  </dd>
                </div>
              </dl>

              <Link
                href={item.href}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-950 transition-colors hover:bg-stone-50 active:translate-y-px"
              >
                Inspect evidence
                <ArrowRight
                  className="size-4"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </Link>
            </article>
          ),
          )
        ) : (
          <div className="p-4">
            <p className="text-sm font-semibold text-stone-950">Healthy state</p>
            <p className="mt-1 text-sm leading-6 text-stone-600">
              {pendingMessage ??
                "No regressions or prioritized failures are present in stored evaluation facts."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
