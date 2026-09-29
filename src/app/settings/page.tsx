import { PageHeading } from "@/components/models/page-heading";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Settings"
        title="Settings"
        description="Only implemented settings are shown. API secrets stay in server environment variables; ModelLedger stores only credential reference names."
      />
      <section className="rounded-md border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-950">Evaluation</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Evaluation thresholds and provider execution settings are currently
          handled by the server-side evaluation engine.
        </p>
      </section>
      <section className="rounded-md border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-950">Providers</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Supabase, Hindsight, and report-analysis providers are controlled
          through environment configuration. Per-version model execution is
          configured from each version page.
        </p>
      </section>
    </div>
  );
}
