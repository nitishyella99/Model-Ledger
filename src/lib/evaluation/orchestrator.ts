import type {
  EvaluationRunStatus,
  Json,
  TablesInsert,
  TablesUpdate,
} from "../../types/database";
import { evaluateOutput, type EvaluationJudge } from "./evaluators";
import type { ModelExecutor } from "./providers";
import type {
  AutomaticEvaluationResult,
  CanonicalTestCase,
  EvaluationRunCounters,
  ExecutableModelConfiguration,
  ModelExecutionResult,
} from "./pipeline-types";

export type EvaluationRunRepository = Readonly<{
  createRun: (
    input: TablesInsert<"evaluations">,
  ) => Promise<{ id: string; evaluated_at: string }>;
  updateRun: (
    evaluationId: string,
    input: TablesUpdate<"evaluations">,
  ) => Promise<unknown>;
  createResult: (
    input: TablesInsert<"evaluation_results">,
  ) => Promise<{ id: string }>;
}>;

export type RunAutomaticEvaluationInput = Readonly<{
  modelId: string;
  modelVersionId: string;
  name: string;
  configuration: ExecutableModelConfiguration;
  testCases: CanonicalTestCase[];
  repository: EvaluationRunRepository;
  executor: ModelExecutor;
  judge?: EvaluationJudge;
  now?: () => Date;
}>;

export type RunAutomaticEvaluationOutput = Readonly<{
  evaluationId: string;
  status: EvaluationRunStatus;
  counters: EvaluationRunCounters;
}>;

function jsonOrNull(value: Json | null | undefined): Json | null {
  return value ?? null;
}

function safeTruncate(value: string | null | undefined, maxLen = 4000): string | null {
  if (value === null || value === undefined) return null;
  return value.length > maxLen ? `${value.slice(0, maxLen)}... [truncated]` : value;
}

function emptyExecutionFailure(
  status: ModelExecutionResult["status"],
  error: string,
): ModelExecutionResult {
  return {
    output: "",
    latencyMs: null,
    tokenUsage: {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    },
    estimatedCostUsd: null,
    providerMetadata: null,
    status,
    error: safeTruncate(error, 1000) ?? "Execution error",
  };
}

function evaluationFailureForModelFailure(
  execution: ModelExecutionResult,
): AutomaticEvaluationResult {
  return {
    score: 0,
    passed: false,
    reason: execution.error ?? "Model execution failed.",
    evidence: {
      providerStatus: execution.status,
      providerError: execution.error,
    },
    evaluatorType: "exact_match",
    status: "ERROR",
  };
}

function summarizeRun(
  results: Array<{
    execution: ModelExecutionResult;
    evaluation: AutomaticEvaluationResult;
  }>,
): EvaluationRunCounters {
  const totalTests = results.length;
  const passedCount = results.filter((result) => result.evaluation.passed).length;
  const failedCount = results.filter(
    (result) =>
      !result.evaluation.passed &&
      result.execution.status === "SUCCESS" &&
      result.evaluation.status === "SUCCESS",
  ).length;
  const errorCount = results.filter(
    (result) =>
      result.execution.status !== "SUCCESS" ||
      result.evaluation.status !== "SUCCESS",
  ).length;
  const scoreTotal = results.reduce(
    (total, result) => total + result.evaluation.score,
    0,
  );
  const totalInputTokens = results.reduce(
    (total, result) => total + (result.execution.tokenUsage.inputTokens ?? 0),
    0,
  );
  const totalOutputTokens = results.reduce(
    (total, result) => total + (result.execution.tokenUsage.outputTokens ?? 0),
    0,
  );
  const totalTokens = results.reduce(
    (total, result) => total + (result.execution.tokenUsage.totalTokens ?? 0),
    0,
  );
  const estimatedCostUsd = results.reduce(
    (total, result) => total + (result.execution.estimatedCostUsd ?? 0),
    0,
  );

  return {
    totalTests,
    passedCount,
    failedCount,
    errorCount,
    averageScore: totalTests === 0 ? 0 : scoreTotal / totalTests,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    estimatedCostUsd,
  };
}

function getRunStatus(counters: EvaluationRunCounters): EvaluationRunStatus {
  if (counters.totalTests === 0) {
    return "FAILED";
  }

  if (counters.errorCount === 0) {
    return "COMPLETED";
  }

  if (counters.errorCount === counters.totalTests) {
    return "FAILED";
  }

  return "PARTIAL";
}

function durationMs(startedAt: string, endedAt: string) {
  return Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runAutomaticEvaluation(
  input: RunAutomaticEvaluationInput,
): Promise<RunAutomaticEvaluationOutput> {
  const now = input.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const run = await input.repository.createRun({
    model_id: input.modelId,
    model_version_id: input.modelVersionId,
    name: input.name,
    evaluated_at: startedAt,
    started_at: startedAt,
    status: "RUNNING",
    total_tests: input.testCases.length,
    notes: null,
    run_metadata: {
      mode: "automatic",
      provider: input.configuration.provider,
      modelName: input.configuration.modelName,
    },
  });
  const persisted: Array<{
    execution: ModelExecutionResult;
    evaluation: AutomaticEvaluationResult;
  }> = [];

  for (let i = 0; i < input.testCases.length; i += 1) {
    const testCase = input.testCases[i];
    if (i > 0) {
      await sleep(1000);
    }
    let execution: ModelExecutionResult;

    try {
      execution = await input.executor.execute({
        testCase,
        configuration: input.configuration,
      });
    } catch (error) {
      execution = emptyExecutionFailure(
        "API_FAILURE",
        error instanceof Error
          ? error.message
          : "Model execution failed unexpectedly.",
      );
    }

    const automaticEvaluation =
      execution.status === "SUCCESS"
        ? await evaluateOutput(testCase, execution.output, input.judge)
        : evaluationFailureForModelFailure(execution);
    persisted.push({ execution, evaluation: automaticEvaluation });

    try {
      await input.repository.createResult({
        evaluation_id: run.id,
        test_case_id: testCase.id,
        test_name: safeTruncate(testCase.name, 200) ?? "Unnamed test",
        test_key: testCase.stableKey,
        category: safeTruncate(testCase.category, 120) ?? "General",
        test_input: safeTruncate(testCase.input, 4000) ?? "",
        expected_result: safeTruncate(testCase.expectedOutput, 4000) ?? "",
        actual_result: safeTruncate(execution.output, 4000) ?? "",
        result: automaticEvaluation.passed ? "PASS" : "FAIL",
        severity: automaticEvaluation.passed ? "LOW" : testCase.severity,
        evaluator_notes: safeTruncate(automaticEvaluation.reason, 2000),
        input_snapshot: safeTruncate(testCase.input, 4000) ?? "",
        expected_output_snapshot: safeTruncate(testCase.expectedOutput, 4000) ?? "",
        evaluation_criteria_snapshot: jsonOrNull(testCase.evaluationCriteria),
        evaluator_type: testCase.evaluatorType,
        threshold: testCase.threshold,
        score: automaticEvaluation.score,
        passed: automaticEvaluation.passed,
        evaluator_reason: safeTruncate(automaticEvaluation.reason, 2000),
        evaluator_evidence: automaticEvaluation.evidence,
        model_latency_ms: execution.latencyMs,
        input_tokens: execution.tokenUsage.inputTokens,
        output_tokens: execution.tokenUsage.outputTokens,
        total_tokens: execution.tokenUsage.totalTokens,
        estimated_cost_usd: execution.estimatedCostUsd,
        provider_status: execution.status,
        provider_error: safeTruncate(execution.error, 1000),
        provider_metadata: execution.providerMetadata,
        execution_status: execution.status,
        evaluator_status: automaticEvaluation.status,
      });
    } catch (createErr) {
      console.error(`Failed to persist evaluation result for test "${testCase.name}":`, createErr);
    }
  }

  const endedAt = now().toISOString();
  const counters = summarizeRun(persisted);
  const status = getRunStatus(counters);

  await input.repository.updateRun(run.id, {
    status,
    evaluated_at: endedAt,
    ended_at: endedAt,
    duration_ms: durationMs(startedAt, endedAt),
    total_tests: counters.totalTests,
    passed_count: counters.passedCount,
    failed_count: counters.failedCount,
    error_count: counters.errorCount,
    average_score: counters.averageScore,
    total_input_tokens: counters.totalInputTokens,
    total_output_tokens: counters.totalOutputTokens,
    total_tokens: counters.totalTokens,
    estimated_cost_usd: counters.estimatedCostUsd,
  });

  return {
    evaluationId: run.id,
    status,
    counters,
  };
}
