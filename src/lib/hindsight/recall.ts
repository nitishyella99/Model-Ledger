import { requireOwnedModel } from "@/lib/data/models";
import "server-only";

import { getHindsightClient } from "./client";
import { recallMemoryWithClient } from "./core";
import type {
  HindsightRecallMemory,
  MemoryEventType,
  RecallForEvaluationInput,
  RecallMemoryResult,
} from "./types";

function describeEventTypes(eventTypes: readonly MemoryEventType[] | undefined) {
  return eventTypes?.length ? eventTypes.join(", ") : "relevant memories";
}

function buildEvaluationRecallQuery(input: RecallForEvaluationInput) {
  return [
    `Find ${describeEventTypes(input.eventTypes)} for this ModelLedger evaluation.`,
    input.testKey ? `Test key: ${input.testKey}.` : null,
    input.category ? `Category: ${input.category}.` : null,
    input.currentFailureDescription
      ? `Current failure: ${input.currentFailureDescription}.`
      : null,
    "Prefer similar previous failures, versions where they occurred, previous fixes, outcomes of those fixes, historical regressions, and relevant version changes.",
  ]
    .filter(Boolean)
    .join(" ");
}

export async function recallForEvaluation(input: RecallForEvaluationInput) {
  await requireOwnedModel(input.modelId);
  const query = buildEvaluationRecallQuery(input);

  return recallMemoryWithClient(getHindsightClient(), input.modelId, query, {
    budget: "low",
    limit: input.limit ?? 8,
    types: ["world", "experience", "observation"],
  });
}

export type RecallMemorySearchInput = Readonly<{
  modelId: string;
  query?: string | null;
  eventType?: MemoryEventType | "all" | null;
  version?: string | null;
  limit?: number;
}>;

export async function recallMemorySearch(input: RecallMemorySearchInput) {
  const query = [
    input.query?.trim() || "ModelLedger historical memory",
    input.eventType && input.eventType !== "all"
      ? `Event type: ${input.eventType}.`
      : null,
    input.version ? `Version context: ${input.version}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  await requireOwnedModel(input.modelId);
  const result = await recallMemoryWithClient(
    getHindsightClient(),
    input.modelId,
    query,
    {
      budget: "low",
      limit: input.limit ?? 12,
      types: ["world", "experience", "observation"],
    },
  );

  if (!input.eventType || input.eventType === "all") {
    return result;
  }

  return {
    ...result,
    memories: result.memories.filter(
      (memory) => memory.eventType === input.eventType,
    ),
  };
}

function uniqueMemories(memories: readonly HindsightRecallMemory[]) {
  const seen = new Set<string>();

  return memories.filter((memory) => {
    if (seen.has(memory.id)) {
      return false;
    }

    seen.add(memory.id);
    return true;
  });
}

export type EvaluationDetailRecallGroups = Readonly<{
  similarFailures: RecallMemoryResult;
  previousResolutions: RecallMemoryResult;
  historicalRegressions: RecallMemoryResult;
  relevantVersionChanges: RecallMemoryResult;
  all: HindsightRecallMemory[];
}>;

export async function recallEvaluationDetailMemory(
  input: Omit<RecallForEvaluationInput, "eventTypes">,
): Promise<EvaluationDetailRecallGroups> {
  const [
    similarFailures,
    previousResolutions,
    historicalRegressions,
    relevantVersionChanges,
  ] = await Promise.all([
    recallSimilarPreviousFailures(input),
    recallPreviousFixes(input),
    recallHistoricalRegressions(input),
    recallRelevantVersionChanges(input),
  ]);

  return {
    similarFailures,
    previousResolutions,
    historicalRegressions,
    relevantVersionChanges,
    all: uniqueMemories([
      ...similarFailures.memories,
      ...previousResolutions.memories,
      ...historicalRegressions.memories,
      ...relevantVersionChanges.memories,
    ]),
  };
}

export async function recallSimilarPreviousFailures(
  input: Omit<RecallForEvaluationInput, "eventTypes">,
) {
  return recallForEvaluation({
    ...input,
    eventTypes: ["evaluation_failure"],
  });
}

export async function recallPreviousFixes(
  input: Omit<RecallForEvaluationInput, "eventTypes">,
) {
  return recallForEvaluation({
    ...input,
    eventTypes: ["improvement", "resolved_issue", "fix_remediation"],
  });
}

export async function recallHistoricalRegressions(
  input: Omit<RecallForEvaluationInput, "eventTypes">,
) {
  return recallForEvaluation({
    ...input,
    eventTypes: ["regression"],
  });
}

export async function recallRelevantVersionChanges(
  input: Omit<RecallForEvaluationInput, "eventTypes">,
) {
  return recallForEvaluation({
    ...input,
    eventTypes: ["version_change"],
  });
}

export async function recallGeneralTestHistoryMemory(
  input: Omit<RecallForEvaluationInput, "eventTypes">,
) {
  return recallForEvaluation({
    ...input,
    eventTypes: [
      "evaluation_outcome",
      "evaluation_failure",
      "regression",
      "improvement",
      "resolved_issue",
      "fix_remediation",
      "version_change",
      "approval_decision",
      "rejection_decision",
      "evaluator_note",
    ],
  });
}
