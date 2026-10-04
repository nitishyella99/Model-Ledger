import { requireOwnedModel } from "@/lib/data/models";
import "server-only";

import type { EvaluationDataset, EvaluationFact } from "@/lib/evaluation/types";
import type { RunReportData } from "@/lib/evaluation/report-data";
import { getHindsightClient } from "./client";
import { retainMemoryWithClient } from "./core";
import {
  getBaseEvaluationMetadata,
  getEvaluationFailureEventId,
  getEvaluationOutcomeEventId,
} from "./formatter";
import type {
  HindsightRecallMemory,
  MemoryEventType,
  RetainMemoryResult,
} from "./types";

function compareFactsNewestFirst(a: EvaluationFact, b: EvaluationFact) {
  return new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime();
}

function getMemoryEventType(fact: EvaluationFact): MemoryEventType {
  return fact.result === "FAIL" ? "evaluation_failure" : "evaluation_outcome";
}

function getMemoryEventId(fact: EvaluationFact) {
  return fact.result === "FAIL"
    ? getEvaluationFailureEventId(fact.id)
    : getEvaluationOutcomeEventId(fact.id);
}

function formatStoredFactMemory(modelName: string | null | undefined, fact: EvaluationFact) {
  const modelLabel = modelName?.trim() || "Model";
  const result = fact.result === "PASS" ? "passed" : "failed";

  return [
    `${modelLabel} ${fact.version} ${result} ${fact.testName}.`,
    `Expected: ${fact.expectedResult ?? "not recorded"}.`,
    `Actual: ${fact.actualResult ?? "not recorded"}.`,
    `Severity: ${fact.severity ?? "not recorded"}.`,
  ].join(" ");
}

function getHistoricalFactsForReport(
  dataset: EvaluationDataset,
  report: RunReportData,
) {
  const currentEvaluationId = report.evaluation.id;
  const currentTestKeys = new Set(report.tests.map((test) => test.testKey));
  const seen = new Set<string>();

  return dataset.facts
    .filter(
      (fact) =>
        fact.evaluationId !== currentEvaluationId &&
        new Date(fact.evaluatedAt).getTime() <= new Date(report.evaluation.evaluated_at).getTime() &&
        currentTestKeys.has(fact.testKey),
    )
    .sort(compareFactsNewestFirst)
    .filter((fact) => {
      if (seen.has(fact.id)) {
        return false;
      }

      seen.add(fact.id);
      return true;
    });
}

function toRecallMemory(
  fact: EvaluationFact,
  content: string,
): HindsightRecallMemory {
  return {
    id: `stored:${fact.id}`,
    content,
    relevance: null,
    eventType: getMemoryEventType(fact),
    modelVersionId: fact.modelVersionId,
    version: fact.version,
    evaluationId: fact.evaluationId,
    testKey: fact.testKey,
    timestamp: fact.evaluatedAt,
  };
}

export function buildStoredReportMemories(input: {
  dataset: EvaluationDataset;
  report: RunReportData;
  modelName?: string | null;
  limit?: number;
}): HindsightRecallMemory[] {
  return getHistoricalFactsForReport(input.dataset, input.report)
    .slice(0, input.limit ?? 8)
    .map((fact) =>
      toRecallMemory(fact, formatStoredFactMemory(input.modelName, fact)),
    );
}

export async function backfillReportMemories(input: {
  modelId: string;
  modelName?: string | null;
  dataset: EvaluationDataset;
  report: RunReportData;
  limit?: number;
}): Promise<RetainMemoryResult[]> {
  await requireOwnedModel(input.modelId);
  const client = getHindsightClient();

  if (!client) {
    return [];
  }

  const facts = getHistoricalFactsForReport(input.dataset, input.report).slice(
    0,
    input.limit ?? 20,
  );

  const results = await Promise.all(
    facts.map((fact) => {
      const eventType = getMemoryEventType(fact);
      const content = formatStoredFactMemory(input.modelName, fact);

      return retainMemoryWithClient(client, {
        modelId: input.modelId,
        eventId: getMemoryEventId(fact),
        eventType,
        content,
        timestamp: fact.evaluatedAt,
        metadata: getBaseEvaluationMetadata(
          {
            modelId: input.modelId,
            modelName: input.modelName,
            fact,
          },
          eventType,
        ),
      });
    }),
  );

  return results.filter((result) => result.ok);
}
