import { requireOwnedModel } from "@/lib/data/models";
import "server-only";

import {
  formatEvaluationOutcomeMemory,
  formatEvaluatorNoteMemory,
  formatFailureMemory,
  formatFixRemediationMemory,
  formatImprovementMemory,
  formatApprovalDecisionMemory,
  formatRegressionMemory,
  formatResolutionMemory,
  formatVersionChangeMemory,
  getBaseEvaluationMetadata,
  getEvaluationFailureEventId,
  getEvaluationOutcomeEventId,
  getEvaluatorNoteEventId,
  getFixRemediationEventId,
  getImprovementEventId,
  getRegressionEventId,
  getResolutionEventId,
  getVersionApprovalEventId,
  getVersionChangeEventId,
  getVersionChangeMetadata,
} from "./formatter";
import { getHindsightClient } from "./client";
import { retainMemoryWithClient } from "./core";
import type {
  EvaluationMemoryContext,
  RegressionMemoryContext,
  ResolutionMemoryContext,
  RetainMemoryResult,
  VersionApprovalMemoryContext,
  VersionChangeMemoryContext,
} from "./types";

export async function retainEvaluationOutcome(
  context: EvaluationMemoryContext,
) {
  await requireOwnedModel(context.modelId);
  return retainMemoryWithClient(getHindsightClient(), {
    modelId: context.modelId,
    eventId: getEvaluationOutcomeEventId(context.fact.id),
    eventType: "evaluation_outcome",
    content: formatEvaluationOutcomeMemory(context),
    timestamp: context.fact.evaluatedAt,
    metadata: getBaseEvaluationMetadata(context, "evaluation_outcome"),
  });
}

export async function retainEvaluationFailure(
  context: EvaluationMemoryContext,
) {
  if (context.fact.result !== "FAIL") {
    return null;
  }

  await requireOwnedModel(context.modelId);
  return retainMemoryWithClient(getHindsightClient(), {
    modelId: context.modelId,
    eventId: getEvaluationFailureEventId(context.fact.id),
    eventType: "evaluation_failure",
    content: formatFailureMemory(context),
    timestamp: context.fact.evaluatedAt,
    metadata: getBaseEvaluationMetadata(context, "evaluation_failure"),
  });
}

export async function retainRegression(context: RegressionMemoryContext) {
  if (!context.regression.isRegression) {
    return null;
  }

  await requireOwnedModel(context.modelId);
  return retainMemoryWithClient(getHindsightClient(), {
    modelId: context.modelId,
    eventId: getRegressionEventId(context.fact.id),
    eventType: "regression",
    content: formatRegressionMemory(context),
    timestamp: context.fact.evaluatedAt,
    metadata: getBaseEvaluationMetadata(context, "regression"),
  });
}

export async function retainResolution(context: ResolutionMemoryContext) {
  if (!context.resolution.was_previously_failed) {
    return null;
  }

  await requireOwnedModel(context.modelId);
  return retainMemoryWithClient(getHindsightClient(), {
    modelId: context.modelId,
    eventId: getResolutionEventId(context.fact.id),
    eventType: "resolved_issue",
    content: formatResolutionMemory(context),
    timestamp: context.fact.evaluatedAt,
    metadata: getBaseEvaluationMetadata(context, "resolved_issue"),
  });
}

export async function retainImprovement(context: ResolutionMemoryContext) {
  if (!context.resolution.was_previously_failed) {
    return null;
  }

  await requireOwnedModel(context.modelId);
  return retainMemoryWithClient(getHindsightClient(), {
    modelId: context.modelId,
    eventId: getImprovementEventId(context.fact.id),
    eventType: "improvement",
    content: formatImprovementMemory(context),
    timestamp: context.fact.evaluatedAt,
    metadata: getBaseEvaluationMetadata(context, "improvement"),
  });
}

export async function retainFixRemediation(context: ResolutionMemoryContext) {
  if (!context.resolution.was_previously_failed) {
    return null;
  }

  await requireOwnedModel(context.modelId);
  return retainMemoryWithClient(getHindsightClient(), {
    modelId: context.modelId,
    eventId: getFixRemediationEventId(context.fact.id),
    eventType: "fix_remediation",
    content: formatFixRemediationMemory(context),
    timestamp: context.fact.evaluatedAt,
    metadata: getBaseEvaluationMetadata(context, "fix_remediation"),
  });
}

export async function retainEvaluatorNote(
  context: EvaluationMemoryContext,
  note: string | null | undefined,
) {
  const trimmedNote = note?.trim();

  if (!trimmedNote) {
    return null;
  }

  await requireOwnedModel(context.modelId);
  return retainMemoryWithClient(getHindsightClient(), {
    modelId: context.modelId,
    eventId: getEvaluatorNoteEventId(context.fact.id),
    eventType: "evaluator_note",
    content: formatEvaluatorNoteMemory(context, trimmedNote),
    timestamp: context.fact.evaluatedAt,
    metadata: getBaseEvaluationMetadata(context, "evaluator_note"),
  });
}

export async function retainEvaluationResultMemories(
  context: EvaluationMemoryContext &
    Pick<RegressionMemoryContext, "regression"> &
    Pick<ResolutionMemoryContext, "resolution"> &
    Readonly<{ evaluatorNote?: string | null }>,
): Promise<RetainMemoryResult[]> {
  const shouldRetainOutcome =
    context.regression.isRegression || context.resolution.was_previously_failed;
  const results = await Promise.all([
    shouldRetainOutcome ? retainEvaluationOutcome(context) : null,
    retainEvaluationFailure(context),
    retainRegression(context),
    retainImprovement(context),
    retainResolution(context),
    retainFixRemediation(context),
    retainEvaluatorNote(context, context.evaluatorNote),
  ]);

  return results.filter((result): result is RetainMemoryResult => result !== null);
}

export async function retainVersionChange(
  context: VersionChangeMemoryContext,
) {
  await requireOwnedModel(context.modelId);
  return retainMemoryWithClient(getHindsightClient(), {
    modelId: context.modelId,
    eventId: getVersionChangeEventId(context.change.id),
    eventType: "version_change",
    content: formatVersionChangeMemory(context),
    timestamp: context.change.created_at,
    metadata: getVersionChangeMetadata(context),
  });
}

export async function retainVersionApprovalDecision(
  context: VersionApprovalMemoryContext,
) {
  if (context.status !== "APPROVED") {
    return null;
  }

  await requireOwnedModel(context.modelId);
  return retainMemoryWithClient(getHindsightClient(), {
    modelId: context.modelId,
    eventId: getVersionApprovalEventId(context.modelVersionId),
    eventType: "approval_decision",
    content: formatApprovalDecisionMemory(context),
    timestamp: context.timestamp,
    metadata: {
      model_id: context.modelId,
      model_version_id: context.modelVersionId,
      event_type: "approval_decision",
      timestamp: context.timestamp,
    },
  });
}
