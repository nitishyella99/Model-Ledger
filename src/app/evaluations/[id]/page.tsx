import { redirect } from "next/navigation";

type EvaluationLegacyRedirectPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EvaluationLegacyRedirectPage({
  params,
}: EvaluationLegacyRedirectPageProps) {
  const { id } = await params;

  redirect(`/reports/${id}`);
}
