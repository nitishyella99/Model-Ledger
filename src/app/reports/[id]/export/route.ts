import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import {
  getEvaluationById,
  getEvaluationResultsByEvaluationIds,
} from "@/lib/data/evaluations";
import { getEffectiveModelVersionConfiguration } from "@/lib/data/model-configurations";
import { getModelById } from "@/lib/data/models";
import { getVersionById, getVersionChangesByVersionIds } from "@/lib/data/versions";
import { buildRunReportData } from "@/lib/evaluation/report-data";
import { buildStoredReportMemories } from "@/lib/hindsight/report-memory";
import { buildEvidenceGroundedRecommendations } from "@/lib/evaluation/recommendations";
import { buildDeterministicRunFindings } from "@/lib/ai/run-analysis";
import { buildFailureRecurrences } from "@/lib/evaluation/recurrence";

export const dynamic = "force-dynamic";

type ExportRouteProps = Readonly<{
  params: Promise<{ id: string }>;
}>;

export async function GET(_request: Request, { params }: ExportRouteProps) {
  if (!(await auth()).userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await params;
  const evaluation = await getEvaluationById(id);

  if (!evaluation) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const [model, version, results, dataset, configuration, versionChanges] = await Promise.all([
    getModelById(evaluation.model_id),
    getVersionById(evaluation.model_version_id),
    getEvaluationResultsByEvaluationIds([evaluation.id]),
    getEvaluationDatasetByModelId(evaluation.model_id),
    getEffectiveModelVersionConfiguration(evaluation.model_version_id).catch(() => null),
    getVersionChangesByVersionIds([evaluation.model_version_id]),
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
  const [recurrenceResults, recurrenceChanges] = await Promise.all([
    getEvaluationResultsByEvaluationIds([...new Set(dataset.facts.map((fact) => fact.evaluationId))]),
    getVersionChangesByVersionIds(dataset.versions.map((entry) => entry.id)),
  ]);

  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      project: model,
      version,
      report,
      recurrences: buildFailureRecurrences({ dataset, evaluationId: id, results: recurrenceResults, versionChanges: recurrenceChanges }),
      memoryEvidence: memoryEvidence.map((memory) => ({ ...memory, source: "stored_history" })),
      findings: buildDeterministicRunFindings(report),
      recommendations: buildEvidenceGroundedRecommendations({ report, memories: memoryEvidence, versionChanges }),
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="modelledger-report-${evaluation.id}.json"`,
      },
    },
  );
}
