import "server-only";

import {
  buildEvaluationDataset,
  type EvaluationDataset,
} from "@/lib/evaluation/engine";
import {
  getEvaluationResultsByEvaluationIds,
  getEvaluationsByModelId,
} from "./evaluations";
import { getVersionsByModelId } from "./versions";

export async function getEvaluationDatasetByModelId(
  modelId: string,
): Promise<EvaluationDataset> {
  const [versions, evaluations] = await Promise.all([
    getVersionsByModelId(modelId),
    getEvaluationsByModelId(modelId),
  ]);
  const results = await getEvaluationResultsByEvaluationIds(
    evaluations.map((evaluation) => evaluation.id),
  );

  return buildEvaluationDataset({
    versions,
    evaluations,
    results,
  });
}
