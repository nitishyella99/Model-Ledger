import "server-only";

import { completeLlmJudge } from "@/lib/ai/client";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import {
  createEvaluation,
  createEvaluationResults,
  getEvaluationById,
  getEvaluationResultsByEvaluationIds,
  updateEvaluation,
} from "@/lib/data/evaluations";
import { getEffectiveModelVersionConfiguration } from "@/lib/data/model-configurations";
import { getModelById } from "@/lib/data/models";
import { createEvaluationRecommendations } from "@/lib/data/recommendations";
import { getTestCasesByIds, getTestCasesByModelId } from "@/lib/data/test-cases";
import { getVersionById, getVersionChangesByVersionIds } from "@/lib/data/versions";
import { analyzeFactResult } from "@/lib/evaluation/engine";
import { buildRunReportData } from "@/lib/evaluation/report-data";
import { buildEvidenceGroundedRecommendations } from "@/lib/evaluation/recommendations";
import { retainEvaluationResultMemories } from "@/lib/hindsight/retain";
import { isHindsightConfigured } from "@/lib/hindsight/client";
import { recallEvaluationDetailMemory } from "@/lib/hindsight/recall";
import type { HindsightRecallMemory } from "@/lib/hindsight/types";
import type { Json } from "@/types/database";
import { runAutomaticEvaluation } from "./orchestrator";
import { createModelExecutor } from "./providers";
import type {
  CanonicalTestCase,
  ExecutableModelConfiguration,
} from "./pipeline-types";

type RunSuiteInput = Readonly<{
  modelId: string;
  modelVersionId: string;
  testCaseIds?: string[];
  name?: string;
}>;

function toCanonicalTestCase(
  row: Awaited<ReturnType<typeof getTestCasesByModelId>>[number],
): CanonicalTestCase {
  return {
    id: row.id,
    stableKey: row.stable_key,
    modelId: row.model_id,
    name: row.name,
    category: row.category,
    input: row.input,
    expectedOutput: row.expected_output,
    evaluationCriteria: row.evaluation_criteria,
    evaluatorType: row.evaluator_type,
    threshold: row.threshold,
    severity: row.severity,
    tags: row.tags,
  };
}

function toExecutableConfiguration(
  row: Awaited<ReturnType<typeof getEffectiveModelVersionConfiguration>>,
): ExecutableModelConfiguration {
  return {
    modelVersionId: row.model_version_id,
    provider: row.provider,
    modelName: row.model_name,
    baseUrl: row.base_url,
    endpointUrl: row.endpoint_url,
    systemPrompt: row.system_prompt,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    providerSettings: row.provider_settings,
    credentialReference: row.credential_reference,
  };
}

async function retainRunMemories(
  modelId: string,
  modelName: string,
  modelVersionId: string,
  evaluationId: string,
) {
  const dataset = await getEvaluationDatasetByModelId(modelId);
  const versionChanges = await getVersionChangesByVersionIds([modelVersionId]);
  const runFacts = dataset.facts.filter(
    (fact) =>
      fact.modelVersionId === modelVersionId &&
      fact.evaluationId === evaluationId,
  );

  await Promise.all(
    runFacts.map((fact) => {
      const analysis = analyzeFactResult(dataset, fact.id);

      return retainEvaluationResultMemories({
        modelId,
        modelName,
        fact,
        versionChanges,
        regression: analysis.regression,
        resolution: analysis.resolvedIssue,
        evaluatorNote: fact.actualResult,
      });
    }),
  );
}

async function persistRunRecommendations(
  evaluationId: string,
  modelId: string,
  modelVersionId: string,
  configuration: NonNullable<
    Awaited<ReturnType<typeof getEffectiveModelVersionConfiguration>>
  >,
) {
  const [evaluation, results, dataset, versionChanges] = await Promise.all([
    getEvaluationById(evaluationId),
    getEvaluationResultsByEvaluationIds([evaluationId]),
    getEvaluationDatasetByModelId(modelId),
    getVersionChangesByVersionIds([modelVersionId]),
  ]);

  if (!evaluation) {
    return;
  }

  const report = buildRunReportData({
    evaluation,
    results,
    dataset,
    configuration,
  });
  const memories = await recallRunRecommendationMemories(modelId, report);
  const recommendations = buildEvidenceGroundedRecommendations({
    report,
    memories,
    versionChanges,
  }).filter((recommendation) => recommendation.priority !== "LOW");

  await createEvaluationRecommendations(
    recommendations.map((recommendation) => ({
      evaluation_id: evaluationId,
      test_key: recommendation.testKey ?? null,
      priority: recommendation.priority,
      title: recommendation.title,
      action: recommendation.action,
      evidence: {
        deterministicFacts: recommendation.evidence.filter(
          (item) => !item.startsWith("memory ") && !item.includes(": memory"),
        ),
        recalledHistoricalEvidence: recommendation.evidence.filter(
          (item) => item.startsWith("memory ") || item.includes(": memory"),
        ),
        generatedAction: recommendation.action,
      } as Json,
    })),
  );
}

async function recallRunRecommendationMemories(
  modelId: string,
  report: ReturnType<typeof buildRunReportData>,
): Promise<HindsightRecallMemory[]> {
  if (!isHindsightConfigured()) {
    return [];
  }

  const importantTests = report.tests.filter(
    (test) =>
      test.result === "FAIL" ||
      ["REGRESSION", "REPEATED_FAILURE", "RESOLVED"].includes(
        test.classification,
      ),
  );
  const recalls = await Promise.all(
    importantTests.slice(0, 5).map((test) =>
      recallEvaluationDetailMemory({
        modelId,
        testKey: test.testKey,
        category: test.category,
        currentFailureDescription:
          test.result === "FAIL"
            ? `${test.testName}: expected ${test.expectedOutput}; actual ${test.actualOutput}`
            : null,
        limit: 4,
      }),
    ),
  );
  const seen = new Set<string>();

  return recalls
    .flatMap((recall) => recall.all)
    .filter((memory) => {
      if (seen.has(memory.id)) {
        return false;
      }

      seen.add(memory.id);
      return true;
    });
}

export async function runConfiguredEvaluationSuite(input: RunSuiteInput) {
  const [model, version, configuration] = await Promise.all([
    getModelById(input.modelId),
    getVersionById(input.modelVersionId),
    getEffectiveModelVersionConfiguration(input.modelVersionId),
  ]);

  if (!model || !version || version.model_id !== input.modelId) {
    throw new Error("Select a version that belongs to the selected model.");
  }

  const testCaseRows =
    input.testCaseIds && input.testCaseIds.length > 0
      ? await getTestCasesByIds(input.testCaseIds)
      : await getTestCasesByModelId(input.modelId);
  const testCasesMap = new Map<string, typeof testCaseRows[number]>();
  for (const row of testCaseRows) {
    if (row.model_id !== input.modelId) continue;
    const key = row.stable_key || row.id;
    const existing = testCasesMap.get(key);
    if (!existing) {
      testCasesMap.set(key, row);
    } else if (
      row.model_version_id === input.modelVersionId &&
      existing.model_version_id !== input.modelVersionId
    ) {
      testCasesMap.set(key, row);
    }
  }
  const testCases = Array.from(testCasesMap.values()).map(toCanonicalTestCase);

  if (testCases.length === 0) {
    throw new Error("No reusable test cases are available for this model version.");
  }

  const result = await runAutomaticEvaluation({
    modelId: input.modelId,
    modelVersionId: input.modelVersionId,
    name: input.name ?? `${model.name} ${version.version} automatic evaluation`,
    configuration: toExecutableConfiguration(configuration),
    testCases,
    executor: createModelExecutor(configuration.provider),
    judge: {
      complete: completeLlmJudge,
    },
    repository: {
      createRun: createEvaluation,
      updateRun: updateEvaluation,
      createResult: async (resultInput) => {
        const [row] = await createEvaluationResults([resultInput]);

        return row;
      },
    },
  });

  await retainRunMemories(
    input.modelId,
    model.name,
    input.modelVersionId,
    result.evaluationId,
  );
  await persistRunRecommendations(
    result.evaluationId,
    input.modelId,
    input.modelVersionId,
    configuration,
  );

  return result;
}
