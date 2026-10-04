import type { HindsightRecallMemory } from "../hindsight/types";
import type { Tables } from "../../types/database";
type VersionChangeRow = Tables<"version_changes">;
import { hasReportExecutionError } from "./report-data";
import { prioritizeReportTests } from "./report-priority";
import type { RunAiAnalysis } from "../ai/run-analysis";
import type { PerTestReportRow, RunReportData } from "./report-data";

export type CanonicalRecommendation = Readonly<{
  id: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  action: string;
  evidence: string[];
  testKey?: string;
  affectedTestIds: string[];
  verification: string;
  reason?: string;
}>;

function memoryEvidence(memories: readonly HindsightRecallMemory[]) {
  return memories.slice(0, 3).map((memory) => {
    const version = memory.version ?? memory.modelVersionId ?? "unknown version";

    return `memory ${memory.eventType ?? "related"} in ${version}: ${memory.content}`;
  });
}

export function selectReportRecommendations(report: RunReportData, deterministic: readonly CanonicalRecommendation[], ai: RunAiAnalysis | null): CanonicalRecommendation[] {
  if (!ai) return deterministic.slice(0, 5);
  const errorIds = new Set(report.tests.filter(hasReportExecutionError).map((test) => test.id));
  const executionActions = deterministic.filter((action) => action.affectedTestIds.some((id) => errorIds.has(id)));
  const actions: CanonicalRecommendation[] = ai.recommendedActions.filter((action) => !action.affectedTestIds.some((id) => errorIds.has(id))).map((action, index) => ({
    id: `ai-${index}`, priority: action.priority, title: action.title, action: action.action, reason: action.reason,
    verification: action.verification, affectedTestIds: action.affectedTestIds, evidence: action.evidenceRefs,
  }));
  const priorities = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return [...executionActions, ...actions, ...(!actions.length ? deterministic.filter((item) => !executionActions.includes(item)) : [])].sort((a, b) => priorities[a.priority] - priorities[b.priority]).slice(0, 5);
}

function versionChangeEvidence(versionChanges: readonly VersionChangeRow[]) {
  return versionChanges.slice(0, 3).map((change) =>
    [
      change.change_type,
      change.field_name ? `on ${change.field_name}` : null,
      change.description,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function recommendationForTest(
  test: PerTestReportRow,
  memories: readonly HindsightRecallMemory[],
  versionChanges: readonly VersionChangeRow[],
): CanonicalRecommendation | null {
  const baseEvidence = [
    `${test.testName} is ${test.classification.replaceAll("_", " ")} with result ${test.result}.`,
    test.evaluatorReason ? `Evaluator: ${test.evaluatorReason}` : null,
    test.scoreDelta !== null ? `Score delta: ${test.scoreDelta}.` : null,
    test.baselineVersion
      ? `Baseline: ${test.baselineVersion} ${test.baselineResult ?? ""}.`
      : null,
    ...versionChangeEvidence(versionChanges),
    ...memoryEvidence(memories.filter((memory) => memory.testKey === test.testKey)),
  ].filter((item): item is string => Boolean(item));

  const affectedTestIds = [test.id];
  const verification = `Re-run ${test.testName} with the same input and criteria; inspect its output and evaluator evidence and confirm successful execution.`;
  if (hasReportExecutionError(test)) {
    const status = test.executionStatus ?? test.providerStatus;
    const repairs: Record<string, string> = {
      AUTH_FAILURE: "Verify the configured provider credential reference and its access to the selected model, then retry this test.",
      TIMEOUT: "Inspect request size and provider latency for this input; verify the timeout and retry this test before drawing a quality conclusion.",
      RATE_LIMIT: "Inspect provider rate-limit details and request concurrency; retry this test after restoring available capacity.",
      MALFORMED_RESPONSE: "Inspect the stored provider response shape and output extraction for this input; repair parsing and retry this test.",
      API_FAILURE: "Inspect the stored provider error and selected endpoint/model for this input; resolve the API failure and retry this test.",
    };
    return {
      id: `${test.id}:provider-error`,
      priority: "HIGH",
      title: `Fix execution or evaluation for ${test.testName}`,
      action: status === "SUCCESS" && test.evaluatorStatus === "ERROR" ? `Inspect the evaluator reason, response schema, and criteria for ${test.testName}; repair evaluation and retry the same output before judging model quality.` : repairs[status ?? ""] ?? `Inspect the recorded execution/evaluator status and error for ${test.testName}; retry successful execution and evaluation before judging model quality.`,
      evidence: [
        `Provider status: ${test.providerStatus}.`,
        `Execution status: ${test.executionStatus}. Evaluator status: ${test.evaluatorStatus}.`,
        test.providerError ? `Provider error: ${test.providerError}.` : null,
      ].filter((item): item is string => Boolean(item)),
      testKey: test.testKey,
      affectedTestIds, verification,
    };
  }

  if (test.classification === "REGRESSION") {
    return {
      id: `${test.id}:regression`,
      priority: "HIGH",
      title: `Investigate regression in ${test.testName}`,
      action:
        "Compare the current prompt/configuration against the last passing baseline and restore or strengthen the behavior that protected this test.",
      evidence: baseEvidence,
      testKey: test.testKey,
      affectedTestIds, verification,
    };
  }

  if (test.classification === "RESOLVED") {
    return {
      id: `${test.id}:resolution`,
      priority: "LOW",
      title: `Preserve fix for ${test.testName}`,
      action:
        "Keep this test in the canonical suite and retain the related config/version change as a future rollback clue.",
      evidence: baseEvidence,
      testKey: test.testKey,
      affectedTestIds, verification,
    };
  }

  if (test.classification === "REPEATED_FAILURE") {
    return {
      id: `${test.id}:persistent`,
      priority: ["HIGH", "CRITICAL"].includes(test.severity) ? "HIGH" : "MEDIUM",
      title: `Prioritize persistent failure in ${test.testName}`,
      action:
        "Use previous failed versions and Hindsight fixes to decide whether this needs prompt, policy, or evaluator criteria changes.",
      evidence: baseEvidence,
      testKey: test.testKey,
      affectedTestIds, verification,
    };
  }

  if (test.result === "FAIL") {
    return { id: `${test.id}:failure`, priority: ["HIGH", "CRITICAL"].includes(test.severity) ? "HIGH" : "MEDIUM", title: `Investigate failure in ${test.testName}`, action: `Compare the input, expected behavior, actual output, and evaluator reasoning for ${test.testName}; isolate the unmet requirement before changing the prompt or evaluator.`, evidence: baseEvidence, testKey: test.testKey, affectedTestIds, verification };
  }
  if (typeof test.scoreDelta === "number" && test.scoreDelta <= -0.15) {
    return {
      id: `${test.id}:score-drop`,
      priority: "MEDIUM",
      title: `Review score drop in ${test.testName}`,
      action:
        "Inspect evaluator evidence and actual output even though the deterministic PASS/FAIL state did not regress.",
      evidence: baseEvidence,
      testKey: test.testKey,
      affectedTestIds, verification,
    };
  }

  return null;
}

export function buildEvidenceGroundedRecommendations(input: {
  report: RunReportData;
  memories?: readonly HindsightRecallMemory[];
  versionChanges?: readonly VersionChangeRow[];
}): CanonicalRecommendation[] {
  const memories = (input.memories ?? []).filter((memory) => !memory.timestamp || Date.parse(memory.timestamp) <= Date.parse(input.report.evaluation.evaluated_at));
  const versionChanges = (input.versionChanges ?? []).filter((change) => Date.parse(change.created_at) <= Date.parse(input.report.evaluation.evaluated_at));
  const recommendations = prioritizeReportTests(input.report.tests)
    .map((test) => recommendationForTest(test, memories, versionChanges))
    .filter(
      (recommendation): recommendation is CanonicalRecommendation =>
        recommendation !== null,
    );

  if (input.report.evaluation.status === "COMPLETED" && (input.report.evaluation.total_tests === null || input.report.evaluation.total_tests === input.report.totalTests) && input.report.totalTests > 0 && input.report.passed === input.report.totalTests && input.report.failed === 0 && input.report.errors === 0) {
    recommendations.push({
      id: `${input.report.evaluation.id}:stable-suite`,
      priority: "LOW",
      title: "Keep this suite as the current baseline",
      action:
        "Use these canonical tests as the baseline for the next version comparison.",
      affectedTestIds: [],
      verification: "Keep the same test definitions for the next run and verify comparisons remain eligible.",
      evidence: [
        `${input.report.passed} of ${input.report.totalTests} tests passed.`,
        `Average score: ${
          input.report.averageScore === null
            ? "not recorded"
            : input.report.averageScore.toFixed(2)
        }.`,
      ],
    });
  }

  return recommendations.sort((a, b) => {
    const priority = { HIGH: 0, MEDIUM: 1, LOW: 2 };

    return priority[a.priority] - priority[b.priority];
  });
}
