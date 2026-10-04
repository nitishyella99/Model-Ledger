import type { Tables } from "../../types/database";
import { hasReportExecutionError } from "./report-status";
export { hasReportExecutionError } from "./report-status";
type EvaluationResultRow = Tables<"evaluation_results">;
type EvaluationRow = Tables<"evaluations">;
type ModelVersionConfigurationRow = Tables<"model_version_configurations">;
type VersionChangeRow = Tables<"version_changes">;
export type TelemetryCoverage = Readonly<{ recorded: number; total: number }>;
export type ReportTelemetryCoverage = Record<"inputTokens" | "outputTokens" | "totalTokens" | "estimatedCostUsd", TelemetryCoverage>;
import type {
  EvaluationDataset,
  EvaluationFact,
  IssueClassification,
  TestTransition,
  VersionComparisonSummary,
} from "./types";
import {
  analyzeFactResult,
  compareVersions,
  getStableTestKey,
} from "./engine";
import { analyzeEvaluationFacts, getVersionSummary } from "./reporting";
import { sameTestDefinition } from "./regression";
import {
  calculateCategoryMetrics,
  calculateRunMetrics,
} from "./metrics";

export type CategoryPerformance = Readonly<{
  category: string;
  total: number;
  passed: number;
  failed: number;
  errors: number;
  passRate: number;
  averageScore: number | null;
  averageLatencyMs: number | null;
  tokens: number | null;
  estimatedCostUsd: number | null;
  telemetryCoverage: ReportTelemetryCoverage;
}>;

export type PerTestReportRow = Readonly<{
  id: string;
  evaluationId: string;
  testName: string;
  testKey: string;
  category: string;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  result: "PASS" | "FAIL";
  severity: string;
  score: number | null;
  scoreDelta: number | null;
  classification: IssueClassification;
  baselineVersion: string | null;
  baselineResult: "PASS" | "FAIL" | null;
  evaluatorType: string | null;
  evaluatorReason: string | null;
  evaluatorEvidence: string;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  providerStatus: string | null;
  providerError: string | null;
  executionStatus: string | null;
  evaluatorStatus: string | null;
  comparisonEligibility: "COMPARABLE" | "NO_BASELINE" | "DEFINITION_CHANGED";
  history: Array<{ version: string; result: "PASS" | "FAIL"; evaluatedAt: string }>;
  historyOmittedCount: number;
}>;

export type RunReportData = Readonly<{
  evaluation: EvaluationRow;
  configuration: ModelVersionConfigurationRow | null;
  totalTests: number;
  passed: number;
  failed: number;
  errors: number;
  passRate: number;
  averageScore: number | null;
  averageLatencyMs: number | null;
  totalTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  telemetryCoverage: ReportTelemetryCoverage;
  categoryPerformance: CategoryPerformance[];
  tests: PerTestReportRow[];
  regressions: number;
  improvements: number;
  persistentFailures: number;
  stable: number;
}>;

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function telemetryCoverage(results: readonly EvaluationResultRow[]): ReportTelemetryCoverage {
  const coverage = (field: keyof EvaluationResultRow) => ({ recorded: results.filter((row) => finiteNumber(row[field]) !== null).length, total: results.length });
  return { inputTokens: coverage("input_tokens"), outputTokens: coverage("output_tokens"), totalTokens: coverage("total_tokens"), estimatedCostUsd: coverage("estimated_cost_usd") };
}

function stringifyEvidence(value: unknown) {
  if (!value) {
    return "No evaluator evidence recorded.";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function getPreviousFact(history: readonly EvaluationFact[], currentId: string) {
  const currentIndex = history.findIndex((fact) => fact.id === currentId);

  if (currentIndex <= 0) {
    return null;
  }

  return history.slice(0,currentIndex).reverse().find(fact => sameTestDefinition(fact,history[currentIndex])) || null;
}

function getScoreDelta(current: EvaluationResultRow, previous: EvaluationFact | null) {
  if (typeof current.score !== "number" || typeof previous?.score !== "number") {
    return null;
  }

  return Number((current.score - previous.score).toFixed(4));
}

function buildPerTestRows(
  results: readonly EvaluationResultRow[],
  dataset: EvaluationDataset,
): PerTestReportRow[] {
  return results.map((result) => {
    const testKey = getStableTestKey(result);
    const analysis = analyzeFactResult(dataset, result.id);
    const previous = getPreviousFact(analysis.history, result.id);
    const historicalFacts = analysis.history.slice(0, analysis.history.findIndex((fact) => fact.id === result.id) + 1);

    return {
      id: result.id,
      evaluationId: result.evaluation_id,
      testName: result.test_name,
      testKey,
      category: result.category?.trim() || "Uncategorized",
      input: result.input_snapshot ?? result.test_input,
      expectedOutput: result.expected_output_snapshot ?? result.expected_result,
      actualOutput: result.actual_result,
      result: result.result,
      severity: result.severity,
      score: finiteNumber(result.score),
      scoreDelta: getScoreDelta(result, previous),
      classification: analysis.classification,
      baselineVersion: previous?.version ?? null,
      baselineResult: previous?.result ?? null,
      evaluatorType: result.evaluator_type,
      evaluatorReason: result.evaluator_reason ?? result.evaluator_notes,
      evaluatorEvidence: stringifyEvidence(result.evaluator_evidence),
      latencyMs: finiteNumber(result.model_latency_ms),
      inputTokens: finiteNumber(result.input_tokens),
      outputTokens: finiteNumber(result.output_tokens),
      totalTokens: finiteNumber(result.total_tokens),
      estimatedCostUsd: finiteNumber(result.estimated_cost_usd),
      providerStatus: result.provider_status,
      providerError: result.provider_error,
      executionStatus: result.execution_status,
      evaluatorStatus: result.evaluator_status,
      comparisonEligibility: previous ? "COMPARABLE" : analysis.history.findIndex((fact) => fact.id === result.id) > 0 ? "DEFINITION_CHANGED" : "NO_BASELINE",
      history: historicalFacts.slice(-8).map((fact) => ({ version: fact.version, result: fact.result, evaluatedAt: fact.evaluatedAt })),
      historyOmittedCount: Math.max(0, historicalFacts.length - 8),
    };
  });
}

export function buildRunReportData(input: {
  evaluation: EvaluationRow;
  results: readonly EvaluationResultRow[];
  dataset: EvaluationDataset;
  configuration: ModelVersionConfigurationRow | null;
}): RunReportData {
  const runResults = input.results.filter((result) => result.evaluation_id === input.evaluation.id);
  const tests = buildPerTestRows(
    runResults,
    input.dataset,
  );
  const metrics = calculateRunMetrics(
    input.evaluation.id,
    runResults,
    input.dataset,
  );
  const categoryMetrics = calculateCategoryMetrics(runResults);

  return {
    evaluation: input.evaluation,
    configuration: input.configuration,
    totalTests: metrics.total_tests,
    passed: metrics.passed_tests,
    failed: metrics.failed_tests,
    errors: tests.filter(hasReportExecutionError).length,
    passRate: metrics.pass_rate,
    averageScore: metrics.average_score,
    averageLatencyMs: metrics.telemetry.average_latency_ms,
    totalTokens: metrics.telemetry.total_tokens,
    inputTokens: metrics.telemetry.total_input_tokens,
    outputTokens: metrics.telemetry.total_output_tokens,
    estimatedCostUsd: metrics.telemetry.estimated_cost_usd,
    telemetryCoverage: telemetryCoverage(runResults),
    categoryPerformance: categoryMetrics.map((category) => ({
      category: category.category,
      total: category.total_tests,
      passed: category.passed_tests,
      failed: category.failed_tests,
      errors: tests.filter((test) => test.category === category.category && hasReportExecutionError(test)).length,
      passRate: category.pass_rate,
      averageScore: category.average_score,
      averageLatencyMs: category.telemetry.average_latency_ms,
      tokens: category.telemetry.total_tokens,
      estimatedCostUsd: category.telemetry.estimated_cost_usd,
      telemetryCoverage: telemetryCoverage(runResults.filter((row) => (row.category?.trim() || "Uncategorized") === category.category)),
    })),
    tests,
    regressions: metrics.classifications.regressions,
    improvements: metrics.classifications.improvements,
    persistentFailures: metrics.classifications.persistent_failures,
    stable: metrics.classifications.stable_tests,
  };
}

export function buildVersionReportData(
  dataset: EvaluationDataset,
  modelVersionId: string,
) {
  const summary = getVersionSummary(dataset, modelVersionId);
  const analyses = analyzeEvaluationFacts(dataset).filter(
    (analysis) => analysis.fact.modelVersionId === modelVersionId,
  );

  return {
    summary,
    analyses,
    improvements: analyses.filter(
      (analysis) => analysis.classification === "RESOLVED",
    ).length,
    persistentFailures: analyses.filter(
      (analysis) => analysis.classification === "REPEATED_FAILURE",
    ).length,
    stable: analyses.filter((analysis) =>
      ["STABLE_PASS", "STABLE_FAIL"].includes(analysis.classification),
    ).length,
  };
}

export function buildComparisonReportData(
  dataset: EvaluationDataset,
  fromVersionId: string,
  toVersionId: string,
  versionChanges: readonly VersionChangeRow[] = [],
): VersionComparisonSummary | null {
  return compareVersions(dataset, fromVersionId, toVersionId, versionChanges);
}

export function getTransitionLabel(transition: TestTransition["transition"]) {
  if (transition === "PASS_TO_FAIL") return "Regression";
  if (transition === "FAIL_TO_PASS") return "Improvement";
  if (transition === "FAIL_TO_FAIL") return "Persistent Failure";
  if (transition === "PASS_TO_PASS") return "Stable";
  if (transition === "NEW_TEST") return "New Test";
  return "Removed Test";
}
