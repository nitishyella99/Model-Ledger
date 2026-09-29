type StatusBadgeTone = "neutral" | "success" | "warning" | "danger";

type StatusBadgeProps = Readonly<{
  children: React.ReactNode;
  tone?: StatusBadgeTone;
}>;

const toneClassName: Record<StatusBadgeTone, string> = {
  neutral: "border-stone-200 bg-stone-100 text-stone-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span
      className={[
        "inline-flex min-h-6 items-center whitespace-nowrap rounded-sm border px-2 py-1 text-xs font-semibold leading-none",
        toneClassName[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}
