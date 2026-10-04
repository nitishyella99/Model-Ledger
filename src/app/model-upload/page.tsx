import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUserId } from "@/lib/auth";
import { getModels } from "@/lib/data/models";
import { getVersionsByModelId } from "@/lib/data/versions";
import { getModelRemovalBlockReason, guidedEnabled, infrastructureStatus, ownedOperation, publicOperation, versionOperation } from "@/lib/deployment/service";
import { GuidedProjectForm } from "@/components/projects/guided-project-form";
import { UploadDestination } from "@/components/projects/upload-destination";
import { ExistingModel } from "@/components/projects/existing-model";

export default async function ModelUploadPage({ searchParams }: { searchParams: Promise<{ project?: string; version?: string; operation?: string }> }) {
  const params = await searchParams;
  const owner = await requireUserId();
  const models = await getModels();
  const operation = params.operation ? publicOperation(await ownedOperation(params.operation)) : null;
  const projectId = operation?.model_id || params.project;
  const project = models.find(model => model.id === projectId);
  if (projectId && !project) notFound();
  const versions = project ? await getVersionsByModelId(project.id) : [];
  const versionId = operation?.model_version_id || params.version;
  const version = versions.find(item => item.id === versionId);
  if (versionId && !version) notFound();
  const saved = operation || (project && version ? await versionOperation(project.id, version.id) : null);
  const hasModel = saved && (saved.settings.files.length > 0 || saved.settings.source !== "upload");
  const blockedReason = saved && hasModel ? await getModelRemovalBlockReason(await ownedOperation(saved.id)) : null;
  return <div className="mx-auto max-w-4xl space-y-6">
    <header><p className="text-xs uppercase tracking-widest text-stone-500">ModelLedger / Upload Model</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Upload Model</h1><p className="mt-3 text-sm leading-6 text-stone-600">Choose an existing project and version, then upload your model. Your files and model settings are saved together under that project and version.</p></header>
    <UploadDestination projects={models.map(model => ({ id: model.id, name: model.name }))} versions={versions.map(item => ({ id: item.id, version: item.version }))} projectId={project?.id || ""} versionId={version?.id || ""} />
    {!models.length && <p className="text-sm text-stone-600">Create a project and its versions in <Link className="underline" href="/projects">Projects</Link> before uploading a model.</p>}
    {project && !versions.length && <p className="text-sm text-stone-600">Add a version in <Link className="underline" href={`/projects/${project.id}`}>{project.name}</Link> before uploading.</p>}
    {!guidedEnabled() ? <p className="text-sm text-stone-600">Model uploads are not enabled. Ask the administrator to configure model storage.</p> : project && version && saved && hasModel ? <ExistingModel key={saved.id} operation={saved} owner={owner} project={{ id: project.id, name: project.name, purpose: project.purpose }} version={{ id: version.id, version: version.version }} blockedReason={blockedReason} infrastructure={infrastructureStatus()} /> : project && version ? <GuidedProjectForm key={`${owner}:${version.id}`} owner={owner} project={{ id: project.id, name: project.name, purpose: project.purpose }} version={version.version} versionId={version.id} initial={saved} initialSource="upload" infrastructure={infrastructureStatus()} /> : <p className="text-sm text-stone-600">Select a project and version to continue.</p>}
  </div>;
}
