import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateContains, evaluateExactMatch } from "../../src/lib/evaluation/evaluators";
import { buildEvaluationDataset, compareVersions } from "../../src/lib/evaluation/engine";
import { runAutomaticEvaluation } from "../../src/lib/evaluation/orchestrator";
import type { ModelExecutor } from "../../src/lib/evaluation/providers";
import type {
  CanonicalTestCase,
  ExecutableModelConfiguration,
} from "../../src/lib/evaluation/pipeline-types";
import type { TablesInsert, TablesUpdate } from "../../src/types/database";

const baseTestCase: CanonicalTestCase = {
  id: "test-1",
  stableKey: "refund-policy",
  modelId: "model-1",
  name: "Refund Policy",
  category: "policy",
  input: "Customer asks for a late refund.",
  expectedOutput: "Decline the refund politely.",
  evaluationCriteria: {},
  evaluatorType: "exact_match",
  threshold: 1,
  severity: "HIGH",
  tags: [],
};

const config: ExecutableModelConfiguration = {
  modelVersionId: "version-1",
  provider: "openai",
  modelName: "gpt-4o-mini",
  baseUrl: null,
  endpointUrl: null,
  systemPrompt: "Be helpful.",
  temperature: 0,
  maxTokens: 200,
  providerSettings: {},
  credentialReference: "OPENAI_API_KEY",
};

describe("automatic evaluation pipeline", () => {
  it("evaluates exact match and contains rules automatically", () => {
    const exact = evaluateExactMatch(
      baseTestCase,
      " Decline the refund politely. ",
    );
    const contains = evaluateContains(
      {
        ...baseTestCase,
        evaluatorType: "contains",
        threshold: 0.5,
        evaluationCriteria: {
          contains: ["decline", "policy window"],
        },
      },
      "We should decline the request because it is outside the window.",
    );

    assert.equal(exact.passed, true);
    assert.equal(exact.score, 1);
    assert.equal(contains.passed, true);
    assert.equal(contains.score, 0.5);
  });

  it("persists each test and keeps model failures distinct from evaluation failures", async () => {
    const runs: Array<TablesInsert<"evaluations"> & { id: string }> = [];
    const updates: TablesUpdate<"evaluations">[] = [];
    const results: TablesInsert<"evaluation_results">[] = [];
    const executor: ModelExecutor = {
      execute: async ({ testCase }) => {
        if (testCase.id === "test-2") {
          return {
            output: "",
            latencyMs: 10,
            tokenUsage: {
              inputTokens: null,
              outputTokens: null,
              totalTokens: null,
            },
            estimatedCostUsd: null,
            providerMetadata: null,
            status: "RATE_LIMIT",
            error: "rate limited",
          };
        }

        return {
          output: testCase.expectedOutput,
          latencyMs: 20,
          tokenUsage: {
            inputTokens: 8,
            outputTokens: 5,
            totalTokens: 13,
          },
          estimatedCostUsd: 0.0001,
          providerMetadata: { requestId: "req-1" },
          status: "SUCCESS",
          error: null,
        };
      },
    };

    const output = await runAutomaticEvaluation({
      modelId: "model-1",
      modelVersionId: "version-1",
      name: "Automatic run",
      configuration: config,
      testCases: [
        baseTestCase,
        {
          ...baseTestCase,
          id: "test-2",
          stableKey: "privacy",
          name: "Privacy",
        },
      ],
      executor,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      repository: {
        createRun: async (input) => {
          runs.push({ ...input, id: "evaluation-1" });

          return {
            id: "evaluation-1",
            evaluated_at: input.evaluated_at,
          };
        },
        updateRun: async (_evaluationId, input) => {
          updates.push(input);
        },
        createResult: async (input) => {
          results.push(input);

          return { id: `result-${results.length}` };
        },
      },
    });

    assert.equal(output.status, "PARTIAL");
    assert.equal(output.counters.totalTests, 2);
    assert.equal(output.counters.passedCount, 1);
    assert.equal(output.counters.errorCount, 1);
    assert.equal(results.length, 2);
    assert.equal(results[0].result, "PASS");
    assert.equal(results[0].score, 1);
    assert.equal(results[1].result, "FAIL");
    assert.equal(results[1].execution_status, "RATE_LIMIT");
    assert.equal(results[1].evaluator_status, "ERROR");
    assert.equal(updates.at(-1)?.status, "PARTIAL");
    assert.equal(runs[0].status, "RUNNING");
  });

  it("adds score deltas to existing version comparison without changing transitions", () => {
    const dataset = buildEvaluationDataset({
      versions: [
        {
          id: "version-1",
          version: "v1",
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "version-2",
          version: "v2",
          created_at: "2026-01-02T00:00:00.000Z",
        },
      ],
      evaluations: [
        {
          id: "evaluation-1",
          model_version_id: "version-1",
          evaluated_at: "2026-01-01T01:00:00.000Z",
          created_at: "2026-01-01T01:00:00.000Z",
        },
        {
          id: "evaluation-2",
          model_version_id: "version-2",
          evaluated_at: "2026-01-02T01:00:00.000Z",
          created_at: "2026-01-02T01:00:00.000Z",
        },
      ],
      results: [
        {
          id: "result-1",
          evaluation_id: "evaluation-1",
          test_name: "Refund",
          test_key: "refund",
          category: "policy",
          expected_result: "Expected",
          actual_result: "Actual",
          result: "PASS",
          severity: "LOW",
          score: 0.95,
          created_at: "2026-01-01T01:00:01.000Z",
        },
        {
          id: "result-2",
          evaluation_id: "evaluation-2",
          test_name: "Refund",
          test_key: "refund",
          category: "policy",
          expected_result: "Expected",
          actual_result: "Actual",
          result: "PASS",
          severity: "LOW",
          score: 0.8,
          created_at: "2026-01-02T01:00:01.000Z",
        },
      ],
    });

    const comparison = compareVersions(dataset, "version-1", "version-2");

    assert.equal(comparison?.transitions[0]?.transition, "PASS_TO_PASS");
    assert.equal(comparison?.transitions[0]?.scoreDelta, -0.15);
  });
});
