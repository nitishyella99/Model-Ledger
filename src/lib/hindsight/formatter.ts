import type {
  EvaluationMemoryContext,
  HindsightMemoryBankId,
  HindsightMemoryMetadata,
  MemoryEventType,
  RegressionMemoryContext,
  ResolutionMemoryContext,
  VersionApprovalMemoryContext,
  VersionChangeMemoryContext,
} from "./types";

const eventTypeLabels: Record<MemoryEventType, string> = {
  evaluation_failure: "evaluation failure",
  evaluation_outcome: "evaluation outcome",
  regression: "regression",
  improvement: "improvement",
  resolved_issue: "resolved issue",
  version_change: "version change",
  fix_remediation: "fix/remediation",
  approval_decision: "approval decision",
  rejection_decision: "rejection decision",
  evaluator_note: "evaluator note",
};

function cleanText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function compactParts(parts: Array<string | null | undefined>) {
  return parts.map(cleanText).filter(Boolean).join(" ");
}

function formatModelLabel(modelName: string | null | undefined) {
  return cleanText(modelName) || "Model";
}

export function getMemoryBankId(modelId: string): HindsightMemoryBankId {
  return `model:${modelId}`;
}

export function getEvaluationOutcomeEventId(resultId: string) {
  return `evaluation_result:${resultId}:outcome`;
}

export function getEvaluationFailureEventId(resultId: string) {
  return `evaluation_result:${resultId}:failure`;
}

export function getRegressionEventId(resultId: string) {
  return `evaluation_result:${resultId}:regression`;
}

export function getImprovementEventId(resultId: string) {
  return `evaluation_result:${resultId}:improvement`;
}

export function getResolutionEventId(resultId: string) {
  return `evaluation_result:${resultId}:resolution`;
}

export function getFixRemediationEventId(resultId: string) {
  return `evaluation_result:${resultId}:fix_remediation`;
}

export function getEvaluatorNoteEventId(resultId: string) {
  return `evaluation_result:${resultId}:evaluator_note`;
}

export function getVersionChangeEventId(changeId: string) {
  return `version_change:${changeId}`;
}

export function getVersionApprovalEventId(modelVersionId: string) {
  return `model_version:${modelVersionId}:approval`;
}

export function getBaseEvaluationMetadata(
  context: EvaluationMemoryContext,
  eventType: MemoryEventType,
): HindsightMemoryMetadata {
  return {
    model_id: context.modelId,
    model_version_id: context.fact.modelVersionId,
    evaluation_id: context.fact.evaluationId,
    result_id: context.fact.id,
    event_type: eventType,
    test_key: context.fact.testKey,
    severity: context.fact.severity ?? "",
    version: context.fact.version,
    timestamp: context.fact.evaluatedAt,
  };
}

export function getVersionChangeMetadata(
  context: VersionChangeMemoryContext,
): HindsightMemoryMetadata {
  return {
    model_id: context.modelId,
    model_version_id: context.change.model_version_id,
    version_change_id: context.change.id,
    event_type: "version_change",
    change_type: context.change.change_type,
    version: context.version,
    timestamp: context.change.created_at,
  };
}

export function formatEvaluationOutcomeMemory(
  context: EvaluationMemoryContext,
) {
  const { fact } = context;
  return compactParts([
    `${formatModelLabel(context.modelName)} ${fact.version} ${fact.result === "PASS" ? "passed" : "failed"} ${fact.testName}.`,
    `Expected: ${fact.expectedResult ?? "not recorded"}.`,
    `Actual: ${fact.actualResult ?? "not recorded"}.`,
    `Severity: ${fact.severity ?? "not recorded"}.`,
  ]);
}

export function formatFailureMemory(context: EvaluationMemoryContext) {
  const { fact } = context;
  return compactParts([
    `${formatModelLabel(context.modelName)} ${fact.version} failed ${fact.testName}.`,
    `Expected ${fact.expectedResult ?? "not recorded"}.`,
    `Actual result ${fact.actualResult ?? "not recorded"}.`,
    `Severity ${fact.severity ?? "not recorded"}.`,
  ]);
}

export function formatRegressionMemory(context: RegressionMemoryContext) {
  const { fact, regression } = context;
  return compactParts([
    `${formatModelLabel(context.modelName)} ${fact.version} regressed on ${fact.testName}.`,
    regression.previousPassingVersion
      ? `It previously passed in ${regression.previousPassingVersion}.`
      : null,
    regression.originalFailureVersion
      ? `Original failure was in ${regression.originalFailureVersion}.`
      : null,
    regression.resolvedVersion
      ? `It had been resolved in ${regression.resolvedVersion}.`
      : null,
    "The deterministic evaluation engine classified this as a regression.",
  ]);
}

export function formatImprovementMemory(context: ResolutionMemoryContext) {
  const { fact, resolution } = context;

  return compactParts([
    `${formatModelLabel(context.modelName)} ${fact.version} improved on ${fact.testName}.`,
    resolution.resolved_in_version
      ? `Failure was resolved in ${resolution.resolved_in_version}.`
      : "The deterministic evaluation engine classified this as an improvement.",
    fact.expectedResult ? `Expected behavior: ${fact.expectedResult}.` : null,
    fact.actualResult ? `Actual output: ${fact.actualResult}.` : null,
  ]);
}

export function formatResolutionMemory(context: ResolutionMemoryContext) {
  const { fact, resolution } = context;
  const versionChangeText = context.versionChanges?.length
    ? `This version included ${context.versionChanges
        .map((change) =>
          compactParts([
            change.field_name
              ? `${change.field_name} ${change.change_type.toLowerCase().replaceAll("_", " ")} change`
              : `${change.change_type.toLowerCase().replaceAll("_", " ")} change`,
            change.description ? `(${change.description})` : null,
          ]),
        )
        .join("; ")}.`
    : null;

  return compactParts([
    `${formatModelLabel(context.modelName)} ${fact.version} resolved ${fact.testName}.`,
    resolution.resolved_in_version
      ? `The issue became resolved in ${resolution.resolved_in_version}.`
      : null,
    versionChangeText,
    resolution.stable_versions_after_resolution.length > 0
      ? `Stable passing versions after resolution: ${resolution.stable_versions_after_resolution.join(", ")}.`
      : null,
  ]);
}

export function formatFixRemediationMemory(context: ResolutionMemoryContext) {
  const { fact, resolution } = context;
  const versionChangeText = context.versionChanges?.length
    ? `This version included ${context.versionChanges
        .map((change) =>
          compactParts([
            change.field_name
              ? `${change.field_name} ${change.change_type.toLowerCase().replaceAll("_", " ")} change`
              : `${change.change_type.toLowerCase().replaceAll("_", " ")} change`,
            change.description ? `(${change.description})` : null,
          ]),
        )
        .join("; ")}.`
    : null;

  return compactParts([
    `${formatModelLabel(context.modelName)} ${fact.version} fix/remediation for ${fact.testName}.`,
    resolution.resolved_in_version
      ? `The issue was resolved in ${resolution.resolved_in_version}.`
      : "The issue was resolved by this passing evaluation.",
    versionChangeText,
    fact.expectedResult ? `Expected behavior: ${fact.expectedResult}.` : null,
    fact.actualResult ? `Observed behavior: ${fact.actualResult}.` : null,
  ]);
}

export function formatEvaluatorNoteMemory(
  context: EvaluationMemoryContext,
  note: string,
) {
  return compactParts([
    `${formatModelLabel(context.modelName)} ${context.fact.version} evaluator note for ${context.fact.testName}.`,
    note,
  ]);
}

export function formatVersionChangeMemory(context: VersionChangeMemoryContext) {
  const { change } = context;
  return compactParts([
    `${formatModelLabel(context.modelName)} ${context.version} recorded a ${change.change_type.toLowerCase().replaceAll("_", " ")} version change.`,
    change.field_name ? `Field: ${change.field_name}.` : null,
    `Description: ${change.description}.`,
    change.previous_value ? `Previous value: ${change.previous_value}.` : null,
    change.new_value ? `New value: ${change.new_value}.` : null,
  ]);
}

export function formatApprovalDecisionMemory(
  context: VersionApprovalMemoryContext,
) {
  return compactParts([
    `${formatModelLabel(context.modelName)} ${context.version} received an approval decision.`,
    `Status: ${context.status}.`,
  ]);
}

export function formatMemoryContextLabel(eventType: MemoryEventType) {
  return `ModelLedger ${eventTypeLabels[eventType]}`;
}
