"use client";
import { useRouter } from "next/navigation";
export function UploadDestination({ projects, versions, projectId, versionId }: { projects: { id: string; name: string }[]; versions: { id: string; version: string }[]; projectId: string; versionId: string }) {
  const router = useRouter();
  const inputClass = "mt-2 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm disabled:bg-stone-100";
  return <section className="rounded-lg border border-stone-200 bg-white p-6"><h2 className="text-lg font-semibold">Choose project and version</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
    <label className="text-sm">Project<select className={inputClass} value={projectId} onChange={event => router.push(event.target.value ? `/model-upload?project=${event.target.value}` : "/model-upload")}><option value="">Select project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    <label className="text-sm">Project version<select className={inputClass} value={versionId} disabled={!projectId || !versions.length} onChange={event => router.push(`/model-upload?project=${projectId}${event.target.value ? `&version=${event.target.value}` : ""}`)}><option value="">Select version</option>{versions.map(version => <option key={version.id} value={version.id}>{version.version}</option>)}</select></label>
  </div></section>;
}
