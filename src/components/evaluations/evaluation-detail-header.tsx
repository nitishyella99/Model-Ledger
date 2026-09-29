import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { FactGrid } from "@/components/evaluations/fact-grid";

type EvaluationDetailHeaderProps = Readonly<{
  testName: string;
  modelName: string;
  version: string;
  result: "pass" | "fail";
  severity: string;
  evaluatedDate: string;
  statusTitle: string;
  statusDescription: string;
}>;

export function EvaluationDetailHeader({
  testName,
  modelName,
  version,
  result,
  severity,
  evaluatedDate,
  statusTitle,
  statusDescription,
}: EvaluationDetailHeaderProps) {
  return (
    <header className="space-y-4 border-b border-stone-200 pb-5">
      <Link
        href="/reports"
        className="inline-flex items-center gap-2 text-sm font-semibold text-stone-600 transition-colors hover:text-stone-950"
      >
        <ArrowLeft className="size-4" strokeWidth={1.8} aria-hidden="true" />
        Back to reports
      </Link>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Evaluation Report
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950 md:text-3xl">
            {testName}
          </h1>
          <div
            className={[
              "mt-3 rounded-md border p-3",
              result === "fail"
                ? "border-rose-200 bg-rose-50"
                : "border-emerald-200 bg-emerald-50",
            ].join(" ")}
          >
            <p
              className={[
                "text-sm font-semibold",
                result === "fail" ? "text-rose-950" : "text-emerald-950",
              ].join(" ")}
            >
              {statusTitle}
            </p>
            <p
              className={[
                "mt-1 text-sm leading-6",
                result === "fail" ? "text-rose-800" : "text-emerald-800",
              ].join(" ")}
            >
              {statusDescription}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={result === "fail" ? "danger" : "success"}>
            {result.toUpperCase()}
          </StatusBadge>
          <StatusBadge
            tone={severity === "HIGH" || severity === "CRITICAL" ? "danger" : "warning"}
          >
            {severity}
          </StatusBadge>
        </div>
      </div>
      <FactGrid
        items={[
          { label: "Model", value: modelName },
          { label: "Version", value: version },
          { label: "Result", value: result.toUpperCase() },
          { label: "Severity", value: severity },
          { label: "Evaluation date", value: evaluatedDate },
        ]}
      />
    </header>
  );
}
