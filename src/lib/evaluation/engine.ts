import { calculateEvaluationMetrics } from "./metrics";
import {
  classifyIssue,
  compareVersionResults,
  detectRegression,
  detectRepeatedFailure,
  detectResolvedIssue,
  getTestHistory,
  orderFactsChronologically,
  orderVersionsChronologically,
} from "./regression";
import type {
  EvaluationDataset,
  EvaluationDiagnostic,
  EvaluationFact,
  EvaluationMetrics,
  EvaluationResultInput,
  EvaluationRunInput,
  IssueClassification,
  RegressionAnalysis,
  RepeatedFailureAnalysis,
  ResolvedIssueAnalysis,
  VersionChangeInput,
  VersionComparisonSummary,
  VersionOrderInput,
} from "./types";

export type BuildEvaluationDatasetInput = Readonly<{
  versions: readonly VersionOrderInput[];
  evaluations: readonly EvaluationRunInput[];
  results: readonly EvaluationResultInput[];
}>;

export type TestResultAnalysis = Readonly<{
  testKey: string;
  current: EvaluationFact | null;
  history: EvaluationFact[];
  metrics: EvaluationMetrics;
  repeatedFailure: RepeatedFailureAnalysis;
  resolvedIssue: ResolvedIssueAnalysis;
  regression: RegressionAnalysis;
  classification: IssueClassification;
}>;

function compareDateStrings(a: string, b: string) {
  const timestampDifference = new Date(a).getTime() - new Date(b).getTime();

  if (timestampDifference !== 0) {
    return timestampDifference;
  }

  return a.localeCompare(b);
}

export function normalizeTestIdentity(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getStableTestKey(
  result: Pick<EvaluationResultInput, "test_key" | "category" | "test_name">,
) {
  const explicitKey = normalizeTestIdentity(result.test_key);

  if (explicitKey) {
    return explicitKey;
  }

  const categoryKey = normalizeTestIdentity(result.category) || "uncategorized";
  const testNameKey = normalizeTestIdentity(result.test_name) || "unnamed-test";

  return `${categoryKey}::${testNameKey}`;
}

export function pickLatestFact(facts: readonly EvaluationFact[]) {
  return [...facts].sort((a, b) => {
    const evaluatedAtComparison = compareDateStrings(
      a.evaluatedAt,
      b.evaluatedAt,
    );

    if (evaluatedAtComparison !== 0) {
      return evaluatedAtComparison;
    }

    const resultCreatedAtComparison = compareDateStrings(
      a.resultCreatedAt,
      b.resultCreatedAt,
    );

    if (resultCreatedAtComparison !== 0) {
      return resultCreatedAtComparison;
    }

    return a.id.localeCompare(b.id);
  }).at(-1);
}

export function buildEvaluationDataset(
  input: BuildEvaluationDatasetInput,
): EvaluationDataset {
  const versions = orderVersionsChronologically(input.versions);
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const evaluationById = new Map(
    input.evaluations.map((evaluation) => [evaluation.id, evaluation]),
  );
  const diagnostics: EvaluationDiagnostic[] = [];
  const rawFacts: EvaluationFact[] = [];

  for (const result of input.results) {
    const evaluation = evaluationById.get(result.evaluation_id);

    if (!evaluation) {
      diagnostics.push({
        code: "MISSING_EVALUATION",
        message: `Result ${result.id} references a missing evaluation.`,
        resultIds: [result.id],
      });
      continue;
    }

    const version = versionById.get(evaluation.model_version_id);

    if (!version) {
      diagnostics.push({
        code: "MISSING_VERSION",
        message: `Evaluation ${evaluation.id} references a missing model version.`,
        modelVersionId: evaluation.model_version_id,
        resultIds: [result.id],
      });
      continue;
    }

    const testKey = getStableTestKey(result);

    if (!normalizeTestIdentity(result.test_key)) {
      diagnostics.push({
        code: "LEGACY_TEST_IDENTITY",
        message:
          "Result has no test_key; deterministic legacy identity uses normalized category and test name.",
        testKey,
        modelVersionId: version.id,
        version: version.version,
        resultIds: [result.id],
      });
    }

    rawFacts.push({
      id: result.id,
      evaluationId: evaluation.id,
      modelVersionId: version.id,
      version: version.version,
      versionCreatedAt: version.created_at,
      evaluatedAt: evaluation.evaluated_at,
      resultCreatedAt: result.created_at,
      testName: result.test_name,
      testKey,
      category: result.category ?? "Uncategorized",
      expectedResult: result.expected_result ?? null,
      actualResult: result.actual_result ?? null,
      result: result.result,
      severity: result.severity,
      score: result.score ?? null,
    });
  }

  const groupedFacts = new Map<string, EvaluationFact[]>();

  for (const fact of rawFacts) {
    const key = `${fact.modelVersionId}::${fact.testKey}`;
    groupedFacts.set(key, [...(groupedFacts.get(key) ?? []), fact]);
  }

  for (const duplicateFacts of groupedFacts.values()) {
    if (duplicateFacts.length > 1) {
      diagnostics.push({
        code: "DUPLICATE_TEST_RESULT",
        message:
          "Multiple results exist for the same version and test_key; latest-snapshot views use the latest evaluated result.",
        testKey: duplicateFacts[0].testKey,
        modelVersionId: duplicateFacts[0].modelVersionId,
        version: duplicateFacts[0].version,
        resultIds: duplicateFacts.map((fact) => fact.id),
      });
    }
  }

  return {
    versions,
    facts: orderFactsChronologically(rawFacts),
    diagnostics,
  };
}

export function calculateMetricsForVersion(
  dataset: EvaluationDataset,
  modelVersionId: string,
) {
  return calculateEvaluationMetrics(
    dataset.facts.filter((fact) => fact.modelVersionId === modelVersionId),
  );
}

export function calculateMetricsForModel(dataset: EvaluationDataset) {
  return calculateEvaluationMetrics(dataset.facts);
}

export function analyzeTestResult(
  dataset: EvaluationDataset,
  testKey: string,
  modelVersionId?: string,
): TestResultAnalysis {
  const history = getTestHistory(dataset.facts, testKey);
  const current = modelVersionId
    ? pickLatestFact(
        history.filter((fact) => fact.modelVersionId === modelVersionId),
      ) ?? null
    : history.at(-1) ?? null;

  return {
    testKey,
    current,
    history,
    metrics: calculateEvaluationMetrics(history),
    repeatedFailure: detectRepeatedFailure(current, history),
    resolvedIssue: detectResolvedIssue(current, history),
    regression: detectRegression(current, history),
    classification: classifyIssue(current, history),
  };
}

export function analyzeFactResult(
  dataset: EvaluationDataset,
  factId: string,
): TestResultAnalysis {
  const current = dataset.facts.find((fact) => fact.id === factId) ?? null;
  const history = current ? getTestHistory(dataset.facts, current.testKey) : [];

  return {
    testKey: current?.testKey ?? "",
    current,
    history,
    metrics: calculateEvaluationMetrics(history),
    repeatedFailure: detectRepeatedFailure(current, history),
    resolvedIssue: detectResolvedIssue(current, history),
    regression: detectRegression(current, history),
    classification: classifyIssue(current, history),
  };
}

export function compareVersions(
  dataset: EvaluationDataset,
  fromVersionId: string,
  toVersionId: string,
  versionChanges: readonly VersionChangeInput[] = [],
): VersionComparisonSummary | null {
  return compareVersionResults(
    dataset.versions,
    dataset.facts,
    fromVersionId,
    toVersionId,
    versionChanges,
  );
}

export {
  calculateEvaluationMetrics,
  classifyIssue,
  compareVersionResults,
  detectRegression,
  detectRepeatedFailure,
  detectResolvedIssue,
  getTestHistory,
  orderFactsChronologically,
  orderVersionsChronologically,
};

export type * from "./types";
