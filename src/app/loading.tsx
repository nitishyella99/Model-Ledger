export default function Loading() {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="h-4 w-48 rounded-md bg-slate-200" />
          <div className="mt-3 h-8 w-72 rounded-md bg-slate-200" />
          <div className="mt-3 h-4 max-w-3xl rounded-md bg-slate-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-32 rounded-md bg-slate-200" />
          <div className="h-9 w-28 rounded-md bg-slate-100" />
        </div>
      </section>
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 md:grid-cols-4">
        {["total", "rate", "failed", "regressions"].map((item) => (
          <div key={item} className="bg-white p-4">
            <div className="h-3 w-20 rounded-md bg-slate-100" />
            <div className="mt-3 h-8 w-16 rounded-md bg-slate-200" />
            <div className="mt-2 h-3 w-28 rounded-md bg-slate-100" />
          </div>
        ))}
      </section>
    </div>
  );
}
