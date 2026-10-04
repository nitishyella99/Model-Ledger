import { redirect } from "next/navigation";
export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ project?: string; operation?: string; version?: string }> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.project) query.set("project", params.project);
  if (params.operation) query.set("operation", params.operation);
  if (params.version) query.set("version", params.version);
  redirect(`/model-upload${query.size ? `?${query}` : ""}`);
}
