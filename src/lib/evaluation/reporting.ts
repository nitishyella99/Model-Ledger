import { analyzeTestResult } from "./engine";
import {
  calculateProjectMetrics,
  calculateVersionMetrics,
  getLatestFactsForVersion,
} from "./metrics";
import type {
  EvaluationDataset,
  EvaluationFact,
  IssueClassification,
  RegressionAnalysis,
  RepeatedFailureAnalysis,
  ResolvedIssueAnalysis,
} from "./types";

export type EvaluationFactAnalysis = Readonly<{
  fact: EvaluationFact;
  classification: IssueClassification;
  regression: RegressionAnalysis;
  repeatedFailure: RepeatedFailureAnalysis;
  resolvedIssue: ResolvedIssueAnalysis;
  previousFailures: EvaluationFact[];
  previousPasses: EvaluationFact[];
}>;

export type AttentionPriority =
  | "HIGH_REGRESSION"
  | "REGRESSION"
  | "HIGH_NEW_FAILURE"
  | "REPEATED_FAILURE";

export type AttentionIssue = Readonly<{
  id: string;
  priority: AttentionPriority;
  fact: EvaluationFact;
  classification: IssueClassification;
  regression: RegressionAnalysis;
  repeatedFailure: RepeatedFailureAnalysis;
  previousRelevantVersion: string | null;
}>;

const highSeverity = new Set(["CRITICAL", "HIGH"]);

function getPreviousFacts(
  history: readonly EvaluationFact[],
  current: EvaluationFact,
  result: "PASS" | "FAIL",
) {
  return history.filter(
    (fact) =>
      fact.id !== current.id &&
      fact.result === result &&
      new Date(fact.versionCreatedAt).getTime() <=
        new Date(current.versionCreatedAt).getTime(),
  );
}

export function analyzeEvaluationFacts(
  dataset: EvaluationDataset,
): EvaluationFactAnalysis[] {
  return dataset.facts.map((fact) => {
    const analysis = analyzeTestResult(dataset, fact.testKey, fact.modelVersionId);

    return {
      fact,
      classification: analysis.classification,
      regression: analysis.regression,
      repeatedFailure: analysis.repeatedFailure,
      resolvedIssue: analysis.resolvedIssue,
      previousFailures: getPreviousFacts(analysis.history, fact, "FAIL"),
      previousPasses: getPreviousFacts(analysis.history, fact, "PASS"),
    };
  });
}

export function getDatasetSummary(dataset: EvaluationDataset) {
  const analyses = analyzeEvaluationFacts(dataset);

  return {
    metrics: calculateProjectMetrics(dataset),
    regressionCount: analyses.filter((analysis) => analysis.regression.isRegression)
      .length,
    analyses,
  };
}

export function getVersionSummary(
  dataset: EvaluationDataset,
  modelVersionId: string,
) {
  const latestFactIds = new Set(
    getLatestFactsForVersion(dataset, modelVersionId).map((fact) => fact.id),
  );
  const analyses = analyzeEvaluationFacts(dataset).filter((analysis) =>
    latestFactIds.has(analysis.fact.id),
  );

  return {
    metrics: calculateVersionMetrics(dataset, modelVersionId),
    regressionCount: analyses.filter((analysis) => analysis.regression.isRegression)
      .length,
    analyses,
  };
}

export function getAttentionIssues(
  dataset: EvaluationDataset,
  modelVersionId?: string,
): AttentionIssue[] {
  const latestFactIds = modelVersionId
    ? new Set(
        getLatestFactsForVersion(dataset, modelVersionId).map((fact) => fact.id),
      )
    : null;
  const analyses = analyzeEvaluationFacts(dataset).filter((analysis) =>
    latestFactIds ? latestFactIds.has(analysis.fact.id) : true,
  );

  return analyses
    .map<AttentionIssue | null>((analysis) => {
      const severity = analysis.fact.severity;

      if (
        analysis.regression.isRegression &&
        severity &&
        highSeverity.has(severity)
      ) {
        return {
          id: analysis.fact.id,
          priority: "HIGH_REGRESSION",
          fact: analysis.fact,
          classification: analysis.classification,
          regression: analysis.regression,
          repeatedFailure: analysis.repeatedFailure,
          previousRelevantVersion: analysis.regression.previousPassingVersion,
        };
      }

      if (analysis.regression.isRegression) {
        return {
          id: analysis.fact.id,
          priority: "REGRESSION",
          fact: analysis.fact,
          classification: analysis.classification,
          regression: analysis.regression,
          repeatedFailure: analysis.repeatedFailure,
          previousRelevantVersion: analysis.regression.previousPassingVersion,
        };
      }

      if (
        analysis.classification === "NEW_FAILURE" &&
        severity &&
        highSeverity.has(severity)
      ) {
        return {
          id: analysis.fact.id,
          priority: "HIGH_NEW_FAILURE",
          fact: analysis.fact,
          classification: analysis.classification,
          regression: analysis.regression,
          repeatedFailure: analysis.repeatedFailure,
          previousRelevantVersion: null,
        };
      }

      if (analysis.classification === "REPEATED_FAILURE") {
        return {
          id: analysis.fact.id,
          priority: "REPEATED_FAILURE",
          fact: analysis.fact,
          classification: analysis.classification,
          regression: analysis.regression,
          repeatedFailure: analysis.repeatedFailure,
          previousRelevantVersion:
            analysis.repeatedFailure.most_recent_previous_failure,
        };
      }

      return null;
    })
    .filter((issue): issue is AttentionIssue => issue !== null)
    .sort((a, b) => {
      const priorityOrder: Record<AttentionPriority, number> = {
        HIGH_REGRESSION: 0,
        REGRESSION: 1,
        HIGH_NEW_FAILURE: 2,
        REPEATED_FAILURE: 3,
      };
      const priorityDifference =
        priorityOrder[a.priority] - priorityOrder[b.priority];

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return (
        new Date(b.fact.evaluatedAt).getTime() -
        new Date(a.fact.evaluatedAt).getTime()
      );
    });
}
