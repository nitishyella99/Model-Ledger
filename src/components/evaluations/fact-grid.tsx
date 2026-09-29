type FactGridItem = Readonly<{
  label: string;
  value: React.ReactNode;
}>;

type FactGridProps = Readonly<{
  items: FactGridItem[];
}>;

export function FactGrid({ items }: FactGridProps) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="bg-white p-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm font-semibold text-stone-950">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
