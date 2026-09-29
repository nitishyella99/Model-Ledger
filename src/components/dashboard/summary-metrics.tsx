type SummaryMetric = Readonly<{
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "danger";
}>;

type SummaryMetricsProps = Readonly<{
  metrics: SummaryMetric[];
}>;

export function SummaryMetrics({ metrics }: SummaryMetricsProps) {
  return (
    <section aria-labelledby="summary-metrics-title" className="space-y-3">
      <div className="flex items-center justify-between">
        <h3
          id="summary-metrics-title"
          className="text-sm font-semibold text-stone-950"
        >
          Latest version health
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 md:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-white p-4">
            <p className="text-xs font-medium text-stone-500">{metric.label}</p>
            <p
              className={[
                "mt-2 text-2xl font-semibold tracking-tight",
                metric.tone === "danger" ? "text-rose-700" : "text-stone-950",
              ].join(" ")}
            >
              {metric.value}
            </p>
            <p className="mt-1 text-xs text-stone-500">{metric.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
