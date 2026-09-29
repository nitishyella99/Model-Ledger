type DetailSectionProps = Readonly<{
  label:
    | "RUN SUMMARY"
    | "MODEL CONFIGURATION"
    | "CURRENT RESULT"
    | "TEST RESULTS"
    | "RUN TELEMETRY"
    | "CATEGORY PERFORMANCE"
    | "RECOMMENDATIONS"
    | "WHY FLAGGED"
    | "VERSION CHANGE"
    | "SEEN BEFORE"
    | "MODELLEDGER ANALYSIS"
    | "SUPPORTING EVIDENCE"
    | "REPORT MAP"
    | "WHAT CHANGED"
    | "REGRESSIONS"
    | "HISTORICAL EVIDENCE"
    | "NEXT ACTIONS"
    | "PERFORMANCE & COST"
    | "ALL TEST RESULTS"
    | "CONFIDENCE";
  title: string;
  description?: string;
  children: React.ReactNode;
  tone?: "neutral" | "danger" | "warning";
}>;

const toneClassName = {
  neutral: "border-stone-200 bg-white",
  danger: "border-rose-200 bg-white",
  warning: "border-amber-200 bg-white",
};

export function DetailSection({
  label,
  title,
  description,
  children,
  tone = "neutral",
}: DetailSectionProps) {
  return (
    <section
      className={[
        "rounded-md border",
        toneClassName[tone],
      ].join(" ")}
      aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-title`}
    >
      <div className="border-b border-stone-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
          {label}
        </p>
        <h2
          id={`${title.toLowerCase().replaceAll(" ", "-")}-title`}
          className="mt-1 text-base font-semibold text-stone-950"
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-stone-600">{description}</p>
        ) : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
