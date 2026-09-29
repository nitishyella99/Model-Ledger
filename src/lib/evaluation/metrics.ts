import type {
  EvaluationFact,
  EvaluationMetrics,
  EvaluationResultSeverity,
  IssueClassification,
} from "./types";
import type { EvaluationDataset } from "./types";
import {
  classifyIssue,
  orderFactsChronologically,
} from "./regression";

const severityOrder: EvaluationResultSeverity[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

export function emptyFailuresBySeverity(): Record<EvaluationResultSeverity, number> {
  return {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
}

export function calculateEvaluationMetrics(
  facts: readonly EvaluationFact[],
): EvaluationMetrics {
  const failuresBySeverity = emptyFailuresBySeverity();
  const passedTests = facts.filter((fact) => fact.result === "PASS").length;
  const failedTests = facts.filter((fact) => fact.result === "FAIL").length;

  for (const fact of facts) {
    if (fact.result === "FAIL" && fact.severity) {
      failuresBySeverity[fact.severity] += 1;
    }
  }

  const totalTests = facts.length;

  return {
    total_tests: totalTests,
    passed_tests: passedTests,
    failed_tests: failedTests,
    pass_rate: totalTests === 0 ? 0 : passedTests / totalTests,
    failure_rate: totalTests === 0 ? 0 : failedTests / totalTests,
    failures_by_severity: severityOrder.reduce(
      (counts, severity) => ({
        ...counts,
        [severity]: failuresBySeverity[severity],
      }),
      emptyFailuresBySeverity(),
    ),
  };
}

export type TelemetryMetrics = Readonly<{
  average_latency_ms: number | null;
  total_latency_ms: number | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
}>;

export type EvaluationResultMetricInput = Readonly<{
  id: string;
  evaluation_id: string;
  result: "PASS" | "FAIL";
  severity: EvaluationResultSeverity | null;
  score?: number | null;
  model_latency_ms?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  estimated_cost_usd?: number | null;
  provider_status?: string | null;
  execution_status?: string | null;
}>;

export type CategoryMetricInput = EvaluationResultMetricInput &
  Readonly<{
    category: string | null;
  }>;

export type RunClassificationCounts = Readonly<{
  regressions: number;
  improvements: number;
  persistent_failures: number;
  stable_tests: number;
}>;

export type RunMetrics = Readonly<{
  evaluation_id: string;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  error_count: number;
  pass_rate: number;
  average_score: number | null;
  failures_by_severity: Record<EvaluationResultSeverity, number>;
  telemetry: TelemetryMetrics;
  classifications: RunClassificationCounts;
}>;

export type CategoryMetrics = Readonly<{
  category: string;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  error_count: number;
  pass_rate: number;
  average_score: number | null;
  telemetry: TelemetryMetrics;
}>;

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values: readonly unknown[]) {
  const numeric = values.filter(finiteNumber);

  if (numeric.length === 0) {
    return null;
  }

  return numeric.reduce((total, value) => total + value, 0) / numeric.length;
}

function sumOrNull(values: readonly unknown[]) {
  const numeric = values.filter(finiteNumber);

  if (numeric.length === 0) {
    return null;
  }

  return numeric.reduce((total, value) => total + value, 0);
}

function resultHasExecutionError(result: EvaluationResultMetricInput) {
  const status = result.execution_status ?? result.provider_status;

  return status !== null && status !== undefined && status !== "SUCCESS";
}

function compareDateStrings(a: string, b: string) {
  const timestampDifference = new Date(a).getTime() - new Date(b).getTime();

  if (timestampDifference !== 0) {
    return timestampDifference;
  }

  return a.localeCompare(b);
}

function pickLatestFact(facts: readonly EvaluationFact[]) {
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

function classifyResultByFactId(dataset: EvaluationDataset, factId: string) {
  const current = dataset.facts.find((fact) => fact.id === factId) ?? null;

  if (!current) {
    return null;
  }

  const history = orderFactsChronologically(
    dataset.facts.filter((fact) => fact.testKey === current.testKey),
  );

  return classifyIssue(current, history);
}

export function calculateTelemetryMetrics(
  results: readonly EvaluationResultMetricInput[],
): TelemetryMetrics {
  return {
    average_latency_ms: average(results.map((result) => result.model_latency_ms)),
    total_latency_ms: sumOrNull(results.map((result) => result.model_latency_ms)),
    total_input_tokens: sumOrNull(results.map((result) => result.input_tokens)),
    total_output_tokens: sumOrNull(results.map((result) => result.output_tokens)),
    total_tokens: sumOrNull(results.map((result) => result.total_tokens)),
    estimated_cost_usd: sumOrNull(
      results.map((result) => result.estimated_cost_usd),
    ),
  };
}

export function calculateRunClassificationCounts(
  dataset: EvaluationDataset,
  results: readonly EvaluationResultMetricInput[],
): RunClassificationCounts {
  const classifications = results.map(
    (result) => classifyResultByFactId(dataset, result.id),
  ).filter((value): value is IssueClassification => value !== null);
  const count = (classification: IssueClassification) =>
    classifications.filter((value) => value === classification).length;

  return {
    regressions: count("REGRESSION"),
    improvements: count("RESOLVED"),
    persistent_failures: count("REPEATED_FAILURE"),
    stable_tests:
      count("STABLE_PASS") +
      count("STABLE_FAIL"),
  };
}

export function calculateRunMetrics(
  evaluationId: string,
  results: readonly EvaluationResultMetricInput[],
  dataset: EvaluationDataset,
): RunMetrics {
  const runResults = results.filter(
    (result) => result.evaluation_id === evaluationId,
  );
  const facts: EvaluationFact[] = runResults.map((result) => ({
    id: result.id,
    evaluationId: result.evaluation_id,
    modelVersionId: "",
    version: "",
    versionCreatedAt: "",
    evaluatedAt: "",
    resultCreatedAt: "",
    testName: "",
    testKey: "",
    category: "",
    expectedResult: null,
    actualResult: null,
    result: result.result,
    severity: result.severity,
    score: result.score ?? null,
  }));
  const metrics = calculateEvaluationMetrics(facts);

  return {
    evaluation_id: evaluationId,
    total_tests: metrics.total_tests,
    passed_tests: metrics.passed_tests,
    failed_tests: metrics.failed_tests,
    error_count: runResults.filter(resultHasExecutionError).length,
    pass_rate: metrics.pass_rate,
    average_score: average(runResults.map((result) => result.score)),
    failures_by_severity: metrics.failures_by_severity,
    telemetry: calculateTelemetryMetrics(runResults),
    classifications: calculateRunClassificationCounts(dataset, runResults),
  };
}

export function calculateCategoryMetrics(
  results: readonly CategoryMetricInput[],
): CategoryMetrics[] {
  const categories = new Map<string, CategoryMetricInput[]>();

  for (const result of results) {
    const category = result.category?.trim() || "Uncategorized";
    categories.set(category, [...(categories.get(category) ?? []), result]);
  }

  return [...categories.entries()]
    .map(([category, categoryResults]) => {
      const facts: EvaluationFact[] = categoryResults.map((result) => ({
        id: result.id,
        evaluationId: result.evaluation_id,
        modelVersionId: "",
        version: "",
        versionCreatedAt: "",
        evaluatedAt: "",
        resultCreatedAt: "",
        testName: "",
        testKey: "",
        category,
        expectedResult: null,
        actualResult: null,
        result: result.result,
        severity: result.severity,
        score: result.score ?? null,
      }));
      const metrics = calculateEvaluationMetrics(facts);

      return {
        category,
        total_tests: metrics.total_tests,
        passed_tests: metrics.passed_tests,
        failed_tests: metrics.failed_tests,
        error_count: categoryResults.filter(resultHasExecutionError).length,
        pass_rate: metrics.pass_rate,
        average_score: average(categoryResults.map((result) => result.score)),
        telemetry: calculateTelemetryMetrics(categoryResults),
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category));
}

export function getLatestFactsForVersion(
  dataset: EvaluationDataset,
  modelVersionId: string,
) {
  const byTestKey = new Map<string, EvaluationFact[]>();

  for (const fact of dataset.facts.filter(
    (entry) => entry.modelVersionId === modelVersionId,
  )) {
    byTestKey.set(fact.testKey, [...(byTestKey.get(fact.testKey) ?? []), fact]);
  }

  return [...byTestKey.values()]
    .map((facts) => pickLatestFact(facts))
    .filter((fact): fact is EvaluationFact => Boolean(fact));
}

export function calculateVersionMetrics(
  dataset: EvaluationDataset,
  modelVersionId: string,
): EvaluationMetrics {
  return calculateEvaluationMetrics(
    getLatestFactsForVersion(dataset, modelVersionId),
  );
}

export function calculateProjectMetrics(dataset: EvaluationDataset): EvaluationMetrics {
  const latestByTestKey = new Map<string, EvaluationFact[]>();

  for (const fact of dataset.facts) {
    latestByTestKey.set(fact.testKey, [
      ...(latestByTestKey.get(fact.testKey) ?? []),
      fact,
    ]);
  }

  return calculateEvaluationMetrics(
    [...latestByTestKey.values()]
      .map((facts) => pickLatestFact(facts))
      .filter((fact): fact is EvaluationFact => Boolean(fact)),
  );
}
