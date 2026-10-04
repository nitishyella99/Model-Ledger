import {
  EVALUATION_ANALYSIS_SYSTEM_PROMPT,
  buildEvaluationAnalysisUserPrompt,
} from "./prompts";
import { evaluationAiAnalysisSchema } from "./schemas";
import type {
  AiCompletionProvider,
  EvaluationAiAnalysis,
  EvaluationAnalysisInput,
  EvaluationAnalysisPayload,
  EvaluationAnalysisStatus,
} from "./types";

const MAX_TEXT_LENGTH = 600;
const MAX_HISTORY_ITEMS = 8;
const MAX_VERSION_CHANGES = 6;
const MAX_MEMORIES = 5;
const UNAVAILABLE_MESSAGE = "AI analysis temporarily unavailable.";

function truncateText(value: string | null | undefined, limit = MAX_TEXT_LENGTH) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(0, limit - 3)}...`;
}

function sortMemoriesByUsefulness(
  memories: EvaluationAnalysisInput["hindsightMemories"],
) {
  return [...memories].sort((a, b) => {
    const relevanceA = a.relevance ?? -1;
    const relevanceB = b.relevance ?? -1;

    if (relevanceA !== relevanceB) {
      return relevanceB - relevanceA;
    }

    return (b.timestamp ?? "").localeCompare(a.timestamp ?? "");
  });
}

export function buildEvaluationAnalysisPayload(
  input: EvaluationAnalysisInput,
): EvaluationAnalysisPayload {
  const analysis = input.deterministicAnalysis;

  return {
    currentFacts: {
      model: input.model.name,
      provider: input.model.provider,
      modelPurpose: input.model.purpose,
      version: input.version.version,
      test: input.result.test_name,
      testKey: analysis.testKey,
      category: input.result.category,
      expectedResult: truncateText(input.result.expected_result),
      actualResult: truncateText(input.result.actual_result),
      result: input.result.result,
      severity: input.result.severity,
    },
    deterministicEngine: {
      classification: analysis.classification,
      regressionStatus: analysis.regression.isRegression,
      regressionType: analysis.regression.type,
      previousFailureVersions:
        analysis.repeatedFailure.previous_failure_versions.slice(
          -MAX_HISTORY_ITEMS,
        ),
      previousPassingVersion: analysis.regression.previousPassingVersion,
      originalFailureVersion: analysis.regression.originalFailureVersion,
      resolvedVersion: analysis.regression.resolvedVersion,
      testHistory: analysis.history.slice(-MAX_HISTORY_ITEMS).map((fact) => ({
        version: fact.version,
        result: fact.result,
        evaluatedAt: fact.evaluatedAt,
      })),
    },
    versionChanges: input.versionChanges
      .slice(-MAX_VERSION_CHANGES)
      .map((change) => ({
        type: change.change_type,
        field: change.field_name,
        description: truncateText(change.description) ?? "",
        previousValue: truncateText(change.previous_value),
        newValue: truncateText(change.new_value),
      })),
    hindsightMemory: sortMemoriesByUsefulness(input.hindsightMemories)
      .slice(0, MAX_MEMORIES)
      .map((memory) => ({
        eventType: memory.eventType,
        version: memory.version ?? memory.modelVersionId,
        content: truncateText(memory.content) ?? "",
        relevance: memory.relevance,
      })),
  };
}

function parseAnalysisResponse(response: unknown) {
  return evaluationAiAnalysisSchema.safeParse(response);
}

function flattenAnalysisText(analysis: EvaluationAiAnalysis) {
  return [
    analysis.executiveSummary,
    ...analysis.keyChanges.flatMap((change) => [
      change.change,
      change.impact,
      change.evidence,
    ]),
    ...analysis.historicalEvidence.flatMap((evidence) => [
      evidence.event,
      evidence.outcome,
      evidence.relevance,
    ]),
    ...analysis.recommendedActions.flatMap((action) => [
      action.action,
      action.reason,
    ]),
    ...analysis.limitations,
  ].join("\n");
}

function hasUnsupportedCausalClaim(
  analysis: EvaluationAiAnalysis,
) {
  const text = flattenAnalysisText(analysis).toLowerCase();
  const strongCausalClaim =
    /\b(caused|definitely caused|directly caused|was caused by)\b|\broot cause (is|was)\b/.test(
      text,
    );

  if (!strongCausalClaim) {
    return false;
  }

  // Text in supplied outputs or memory cannot authorize a causal conclusion.
  return true;
}

function contradictsRegressionAuthority(
  analysis: EvaluationAiAnalysis,
  payload: EvaluationAnalysisPayload,
) {
  const text = flattenAnalysisText(analysis).toLowerCase();

  if (payload.deterministicEngine.regressionStatus) {
    return /\bnot (a )?regression\b|\bno regression\b/.test(text);
  }

  return (
    payload.deterministicEngine.classification !== "REGRESSION" &&
    /\bis (a )?regression\b|\bclassified as regression\b/.test(text)
  );
}

function isGroundedAnalysis(
  analysis: EvaluationAiAnalysis,
  payload: EvaluationAnalysisPayload,
) {
  return (
    !hasUnsupportedCausalClaim(analysis) &&
    !contradictsRegressionAuthority(analysis, payload)
  );
}

export async function analyzeEvaluationWithAi(
  input: EvaluationAnalysisInput,
  complete: AiCompletionProvider,
): Promise<EvaluationAnalysisStatus> {
  const payload = buildEvaluationAnalysisPayload(input);
  const request = {
    system: inputSystemPrompt(),
    user: buildEvaluationAnalysisUserPrompt(payload),
    schemaName: "modelledger_evaluation_analysis",
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await complete(request);
      const parsed = parseAnalysisResponse(response);

      if (parsed.success && isGroundedAnalysis(parsed.data, payload)) {
        return {
          ok: true,
          analysis: parsed.data,
        };
      }
    } catch {
      return {
        ok: false,
        message: UNAVAILABLE_MESSAGE,
      };
    }
  }

  return {
    ok: false,
    message: UNAVAILABLE_MESSAGE,
  };
}

export function inputSystemPrompt() {
  return EVALUATION_ANALYSIS_SYSTEM_PROMPT;
}
