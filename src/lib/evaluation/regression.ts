import type {
  EvaluationFact,
  IssueClassification,
  RegressionAnalysis,
  RepeatedFailureAnalysis,
  ResolvedIssueAnalysis,
  ResultTransition,
  TestHistoryEntry,
  TestTransition,
  VersionChangeInput,
  VersionComparisonSummary,
  VersionOrderInput,
} from "./types";

function compareDateStrings(a: string, b: string) {
  const timestampDifference = new Date(a).getTime() - new Date(b).getTime();

  if (timestampDifference !== 0) {
    return timestampDifference;
  }

  return a.localeCompare(b);
}

export function orderVersionsChronologically(
  versions: readonly VersionOrderInput[],
): VersionOrderInput[] {
  return [...versions].sort((a, b) => {
    const createdAtComparison = compareDateStrings(a.created_at, b.created_at);

    if (createdAtComparison !== 0) {
      return createdAtComparison;
    }

    return a.version.localeCompare(b.version, undefined, { numeric: true });
  });
}

export function orderFactsChronologically(
  facts: readonly EvaluationFact[],
): EvaluationFact[] {
  return [...facts].sort((a, b) => {
    const versionComparison = compareDateStrings(
      a.versionCreatedAt,
      b.versionCreatedAt,
    );

    if (versionComparison !== 0) {
      return versionComparison;
    }

    const evaluationComparison = compareDateStrings(a.evaluatedAt, b.evaluatedAt);

    if (evaluationComparison !== 0) {
      return evaluationComparison;
    }

    const resultComparison = compareDateStrings(
      a.resultCreatedAt,
      b.resultCreatedAt,
    );

    if (resultComparison !== 0) {
      return resultComparison;
    }

    return a.id.localeCompare(b.id);
  });
}

export function getTestHistory(
  facts: readonly EvaluationFact[],
  testKey: string,
): TestHistoryEntry[] {
  return orderFactsChronologically(
    facts.filter((fact) => fact.testKey === testKey),
  );
}

export function detectRepeatedFailure(
  current: EvaluationFact | null,
  history: readonly EvaluationFact[],
): RepeatedFailureAnalysis {
  if (!current || current.result !== "FAIL") {
    return {
      is_repeated_failure: false,
      previous_failure_versions: [],
      most_recent_previous_failure: null,
    };
  }

  const previousFailures = orderFactsChronologically(history).filter(
    (fact) =>
      fact.testKey === current.testKey &&
      fact.modelVersionId !== current.modelVersionId &&
      fact.result === "FAIL" &&
      compareDateStrings(fact.versionCreatedAt, current.versionCreatedAt) < 0,
  );

  return {
    is_repeated_failure: previousFailures.length > 0,
    previous_failure_versions: previousFailures.map((fact) => fact.version),
    most_recent_previous_failure:
      previousFailures.at(-1)?.version ?? null,
  };
}

export function detectResolvedIssue(
  current: EvaluationFact | null,
  history: readonly EvaluationFact[],
): ResolvedIssueAnalysis {
  if (!current || current.result !== "PASS") {
    return {
      was_previously_failed: false,
      resolved_in_version: null,
      stable_versions_after_resolution: [],
    };
  }

  const orderedHistory = orderFactsChronologically(history).filter(
    (fact) => fact.testKey === current.testKey,
  );
  const currentIndex = orderedHistory.findIndex((fact) => fact.id === current.id);
  const earlierFacts =
    currentIndex === -1 ? orderedHistory : orderedHistory.slice(0, currentIndex);
  const wasPreviouslyFailed = earlierFacts.some((fact) => fact.result === "FAIL");

  if (!wasPreviouslyFailed) {
    return {
      was_previously_failed: false,
      resolved_in_version: null,
      stable_versions_after_resolution: [],
    };
  }

  const lastFailureIndex = earlierFacts.findLastIndex(
    (fact) => fact.result === "FAIL",
  );
  const firstPassAfterLastFailure = orderedHistory
    .slice(lastFailureIndex + 1)
    .find((fact) => fact.result === "PASS");
  const stableVersionsAfterResolution = firstPassAfterLastFailure
    ? orderedHistory
        .slice(
          orderedHistory.findIndex(
            (fact) => fact.id === firstPassAfterLastFailure.id,
          ) + 1,
        )
        .filter((fact) => fact.result === "PASS")
        .map((fact) => fact.version)
    : [];

  return {
    was_previously_failed: true,
    resolved_in_version: firstPassAfterLastFailure?.version ?? current.version,
    stable_versions_after_resolution: stableVersionsAfterResolution,
  };
}

export function detectRegression(
  current: EvaluationFact | null,
  history: readonly EvaluationFact[],
): RegressionAnalysis {
  if (!current) {
    return {
      isRegression: false,
      type: "NONE",
      currentVersion: null,
      previousPassingVersion: null,
      originalFailureVersion: null,
      resolvedVersion: null,
    };
  }

  if (current.result !== "FAIL") {
    return {
      isRegression: false,
      type: "NONE",
      currentVersion: current.version,
      previousPassingVersion: null,
      originalFailureVersion: null,
      resolvedVersion: null,
    };
  }

  const orderedEarlierFacts = orderFactsChronologically(history).filter(
    (fact) =>
      fact.testKey === current.testKey &&
      fact.modelVersionId !== current.modelVersionId &&
      compareDateStrings(fact.versionCreatedAt, current.versionCreatedAt) < 0,
  );
  const previousPasses = orderedEarlierFacts.filter(
    (fact) => fact.result === "PASS",
  );
  const previousFailures = orderedEarlierFacts.filter(
    (fact) => fact.result === "FAIL",
  );

  if (previousPasses.length === 0) {
    return {
      isRegression: false,
      type: previousFailures.length > 0 ? "REPEATED_FAILURE" : "NEW_FAILURE",
      currentVersion: current.version,
      previousPassingVersion: null,
      originalFailureVersion: previousFailures[0]?.version ?? null,
      resolvedVersion: null,
    };
  }

  const originalFailure = previousFailures[0] ?? null;
  const resolvedVersion = originalFailure
    ? orderedEarlierFacts.find(
        (fact) =>
          fact.result === "PASS" &&
          compareDateStrings(
            fact.versionCreatedAt,
            originalFailure.versionCreatedAt,
          ) > 0,
      )
    : previousPasses[0];

  return {
    isRegression: true,
    type: "RETURNED_FAILURE",
    currentVersion: current.version,
    previousPassingVersion: previousPasses.at(-1)?.version ?? null,
    originalFailureVersion: originalFailure?.version ?? null,
    resolvedVersion: resolvedVersion?.version ?? null,
  };
}

export function classifyIssue(
  current: EvaluationFact | null,
  history: readonly EvaluationFact[],
): IssueClassification {
  // Classification precedence is deterministic:
  // regression beats repeated failure, repeated failure beats new failure,
  // a pass after any earlier failure is resolved, and pass-only history is stable.
  if (!current) {
    return "STABLE_PASS";
  }

  const orderedHistory = orderFactsChronologically(history).filter(
    (fact) => fact.testKey === current.testKey,
  );
  const currentIndex = orderedHistory.findIndex((fact) => fact.id === current.id);
  const earlierFacts =
    currentIndex === -1 ? [] : orderedHistory.slice(0, currentIndex);

  if (current.result === "FAIL") {
    const regression = detectRegression(current, orderedHistory);

    if (regression.isRegression) {
      return "REGRESSION";
    }

    if (earlierFacts.some((fact) => fact.result === "FAIL")) {
      return "REPEATED_FAILURE";
    }

    return "NEW_FAILURE";
  }

  if (earlierFacts.some((fact) => fact.result === "FAIL")) {
    return "RESOLVED";
  }

  return "STABLE_PASS";
}

function getTransition(
  fromResult: EvaluationFact | null,
  toResult: EvaluationFact | null,
): ResultTransition {
  if (!fromResult) {
    return "NEW_TEST";
  }

  if (!toResult) {
    return "REMOVED_TEST";
  }

  if (fromResult.result === "PASS" && toResult.result === "PASS") {
    return "PASS_TO_PASS";
  }

  if (fromResult.result === "PASS" && toResult.result === "FAIL") {
    return "PASS_TO_FAIL";
  }

  if (fromResult.result === "FAIL" && toResult.result === "PASS") {
    return "FAIL_TO_PASS";
  }

  return "FAIL_TO_FAIL";
}

function getScoreDelta(
  fromResult: EvaluationFact | null,
  toResult: EvaluationFact | null,
) {
  if (fromResult?.score === null || fromResult?.score === undefined) {
    return null;
  }

  if (toResult?.score === null || toResult?.score === undefined) {
    return null;
  }

  return Number((toResult.score - fromResult.score).toFixed(4));
}

function latestFactsForVersion(
  facts: readonly EvaluationFact[],
  modelVersionId: string,
) {
  return new Map(
    orderFactsChronologically(
      facts.filter((fact) => fact.modelVersionId === modelVersionId),
    ).map((fact) => [fact.testKey, fact]),
  );
}

export function compareVersionResults(
  versions: readonly VersionOrderInput[],
  facts: readonly EvaluationFact[],
  fromVersionId: string,
  toVersionId: string,
  versionChanges: readonly VersionChangeInput[] = [],
): VersionComparisonSummary | null {
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const fromVersion = versionById.get(fromVersionId);
  const toVersion = versionById.get(toVersionId);

  if (!fromVersion || !toVersion) {
    return null;
  }

  const fromFactsByTestKey = latestFactsForVersion(facts, fromVersionId);
  const toFactsByTestKey = latestFactsForVersion(facts, toVersionId);
  const allTestKeys = [
    ...new Set([...fromFactsByTestKey.keys(), ...toFactsByTestKey.keys()]),
  ].sort();
  const transitions: TestTransition[] = allTestKeys.map((testKey) => {
    const fromResult = fromFactsByTestKey.get(testKey) ?? null;
    const toResult = toFactsByTestKey.get(testKey) ?? null;
    const representative = toResult ?? fromResult;

    return {
      testKey,
      testName: representative?.testName ?? testKey,
      category: representative?.category ?? "Uncategorized",
      transition: getTransition(fromResult, toResult),
      fromResult,
      toResult,
      scoreDelta: getScoreDelta(fromResult, toResult),
    };
  });

  return {
    fromVersion,
    toVersion,
    total_matching_tests: transitions.filter(
      (transition) =>
        transition.fromResult !== null && transition.toResult !== null,
    ).length,
    unchanged_passes: transitions.filter(
      (transition) => transition.transition === "PASS_TO_PASS",
    ).length,
    unchanged_failures: transitions.filter(
      (transition) => transition.transition === "FAIL_TO_FAIL",
    ).length,
    newly_failed_tests: transitions.filter(
      (transition) => transition.transition === "PASS_TO_FAIL",
    ).length,
    newly_fixed_tests: transitions.filter(
      (transition) => transition.transition === "FAIL_TO_PASS",
    ).length,
    new_tests: transitions.filter(
      (transition) => transition.transition === "NEW_TEST",
    ).length,
    removed_tests: transitions.filter(
      (transition) => transition.transition === "REMOVED_TEST",
    ).length,
    transitions,
    version_changes: [...versionChanges]
      .filter((change) => change.model_version_id === toVersionId)
      .sort((a, b) => compareDateStrings(a.created_at, b.created_at)),
  };
}
