import { PageHeading } from "@/components/models/page-heading";

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Profile"
        title="Profile"
        description="Team identity and account management are not implemented in this local build."
      />
      <section className="rounded-md border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-950">
          No profile settings yet
        </h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          This page is intentionally minimal because the current backend does
          not expose user or team profile records.
        </p>
      </section>
    </div>
  );
}
