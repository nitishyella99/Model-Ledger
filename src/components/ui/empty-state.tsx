import Link from "next/link";

type EmptyStateProps = Readonly<{
  title: string;
  description: string;
  action?: {
    href?: string;
    label: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    href?: string;
    label: string;
    onClick?: () => void;
  };
  actionNode?: React.ReactNode;
}>;

export function EmptyState({
  title,
  description,
  action,
  secondaryAction,
  actionNode,
}: EmptyStateProps) {
  return (
    <section className="rounded-md border border-stone-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-stone-950">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
        {description}
      </p>
      {action || secondaryAction || actionNode ? (
        <div className="mt-4 flex flex-wrap gap-2 items-center">
          {actionNode}
          {action ? (
            action.href ? (
              <Link
                href={action.href}
                onClick={action.onClick}
                className="inline-flex h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px"
              >
                {action.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                className="inline-flex h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px"
              >
                {action.label}
              </button>
            )
          ) : null}
          {secondaryAction ? (
            secondaryAction.href ? (
              <Link
                href={secondaryAction.href}
                onClick={secondaryAction.onClick}
                className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
              >
                {secondaryAction.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
              >
                {secondaryAction.label}
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
