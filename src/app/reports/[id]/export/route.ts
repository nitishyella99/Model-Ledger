import { NextResponse } from "next/server";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import {
  getEvaluationById,
  getEvaluationResultsByEvaluationIds,
} from "@/lib/data/evaluations";
import { getEffectiveModelVersionConfiguration } from "@/lib/data/model-configurations";
import { getModelById } from "@/lib/data/models";
import { getVersionById } from "@/lib/data/versions";
import { buildRunReportData } from "@/lib/evaluation/report-data";
import { buildStoredReportMemories } from "@/lib/hindsight/report-memory";

export const dynamic = "force-dynamic";

type ExportRouteProps = Readonly<{
  params: Promise<{ id: string }>;
}>;

export async function GET(_request: Request, { params }: ExportRouteProps) {
  const { id } = await params;
  const evaluation = await getEvaluationById(id);

  if (!evaluation) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const [model, version, results, dataset, configuration] = await Promise.all([
    getModelById(evaluation.model_id),
    getVersionById(evaluation.model_version_id),
    getEvaluationResultsByEvaluationIds([evaluation.id]),
    getEvaluationDatasetByModelId(evaluation.model_id),
    getEffectiveModelVersionConfiguration(evaluation.model_version_id).catch(() => null),
  ]);

  const report = buildRunReportData({
    evaluation,
    results,
    dataset,
    configuration,
  });
  const memoryEvidence = buildStoredReportMemories({
    dataset,
    report,
    modelName: model?.name,
  });

  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      project: model,
      version,
      report,
      memoryEvidence,
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="modelledger-report-${evaluation.id}.json"`,
      },
    },
  );
}
