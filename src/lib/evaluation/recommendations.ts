import type { HindsightRecallMemory } from "@/lib/hindsight/types";
import type { VersionChangeRow } from "@/lib/data/versions";
import type { PerTestReportRow, RunReportData } from "./report-data";

export type CanonicalRecommendation = Readonly<{
  id: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  action: string;
  evidence: string[];
  testKey?: string;
}>;

function memoryEvidence(memories: readonly HindsightRecallMemory[]) {
  return memories.slice(0, 3).map((memory) => {
    const version = memory.version ?? memory.modelVersionId ?? "unknown version";

    return `memory ${memory.eventType ?? "related"} in ${version}: ${memory.content}`;
  });
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
    ...memoryEvidence(memories),
  ].filter((item): item is string => Boolean(item));

  if (test.providerStatus && test.providerStatus !== "SUCCESS") {
    return {
      id: `${test.id}:provider-error`,
      priority: "HIGH",
      title: `Fix provider execution for ${test.testName}`,
      action:
        "Check credentials, rate limits, timeout settings, and provider response shape before judging model quality.",
      evidence: [
        `Provider status: ${test.providerStatus}.`,
        test.providerError ? `Provider error: ${test.providerError}.` : null,
      ].filter((item): item is string => Boolean(item)),
      testKey: test.testKey,
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
    };
  }

  if (test.classification === "REPEATED_FAILURE") {
    return {
      id: `${test.id}:persistent`,
      priority: "MEDIUM",
      title: `Prioritize persistent failure in ${test.testName}`,
      action:
        "Use previous failed versions and Hindsight fixes to decide whether this needs prompt, policy, or evaluator criteria changes.",
      evidence: baseEvidence,
      testKey: test.testKey,
    };
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
    };
  }

  return null;
}

export function buildEvidenceGroundedRecommendations(input: {
  report: RunReportData;
  memories?: readonly HindsightRecallMemory[];
  versionChanges?: readonly VersionChangeRow[];
}): CanonicalRecommendation[] {
  const memories = input.memories ?? [];
  const versionChanges = input.versionChanges ?? [];
  const recommendations = input.report.tests
    .map((test) => recommendationForTest(test, memories, versionChanges))
    .filter(
      (recommendation): recommendation is CanonicalRecommendation =>
        recommendation !== null,
    );

  if (input.report.regressions === 0 && input.report.errors === 0) {
    recommendations.push({
      id: `${input.report.evaluation.id}:stable-suite`,
      priority: "LOW",
      title: "Keep this suite as the current baseline",
      action:
        "Use these canonical tests as the baseline for the next version comparison.",
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
