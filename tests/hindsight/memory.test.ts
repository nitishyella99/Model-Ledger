import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatFailureMemory,
  formatFixRemediationMemory,
  formatRegressionMemory,
  getEvaluationFailureEventId,
  getFixRemediationEventId,
  getMemoryBankId,
  getRegressionEventId,
  getVersionApprovalEventId,
} from "../../src/lib/hindsight/formatter";
import {
  normalizeRecallResponse,
  recallMemoryWithClient,
  retainMemoryWithClient,
} from "../../src/lib/hindsight/core";
import type { EvaluationFact } from "../../src/lib/evaluation/types";
import type { HindsightClientLike } from "../../src/lib/hindsight/types";

const fact: EvaluationFact = {
  id: "result-1",
  evaluationId: "evaluation-1",
  modelVersionId: "version-1",
  version: "v1.2",
  versionCreatedAt: "2026-01-02T00:00:00.000Z",
  evaluatedAt: "2026-01-02T00:00:01.000Z",
  resultCreatedAt: "2026-01-02T00:00:02.000Z",
  testName: "Refund Policy",
  testKey: "refund-policy",
  category: "policy",
  expectedResult: "Reject refunds after 30 days",
  actualResult: "Approved refund after 45 days",
  result: "FAIL",
  severity: "HIGH",
};

const silentLogger = {
  info() {},
  warn() {},
};

describe("hindsight memory", () => {
  const originalEnv = {
    HINDSIGHT_API_LLM_PROVIDER: process.env.HINDSIGHT_API_LLM_PROVIDER,
    HINDSIGHT_API_LLM_MODEL: process.env.HINDSIGHT_API_LLM_MODEL,
    HINDSIGHT_API_LLM_API_KEY: process.env.HINDSIGHT_API_LLM_API_KEY,
    HINDSIGHT_API_LLM_BASE_URL: process.env.HINDSIGHT_API_LLM_BASE_URL,
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_MODEL: process.env.LLM_MODEL,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    NVIDIA_API_KEY: process.env.NVIDIA_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };

  function restoreEnv() {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  it("formats deterministic failure memories without LLM text generation", () => {
    assert.equal(
      formatFailureMemory({
        modelId: "model-1",
        modelName: "Customer Support Agent",
        fact,
      }),
      "Customer Support Agent v1.2 failed Refund Policy. Expected Reject refunds after 30 days. Actual result Approved refund after 45 days. Severity HIGH.",
    );
  });

  it("formats regression memories from deterministic regression analysis", () => {
    assert.equal(
      formatRegressionMemory({
        modelId: "model-1",
        modelName: "Customer Support Agent",
        fact,
        regression: {
          isRegression: true,
          type: "RETURNED_FAILURE",
          currentVersion: "v1.2",
          previousPassingVersion: "v1.1",
          originalFailureVersion: "v1.0",
          resolvedVersion: "v1.1",
        },
      }),
      "Customer Support Agent v1.2 regressed on Refund Policy. It previously passed in v1.1. Original failure was in v1.0. It had been resolved in v1.1. The deterministic evaluation engine classified this as a regression.",
    );
  });

  it("creates stable bank and event identifiers for idempotent retain", () => {
    assert.equal(getMemoryBankId("model-1"), "model:model-1");
    assert.equal(
      getEvaluationFailureEventId("result-1"),
      "evaluation_result:result-1:failure",
    );
    assert.equal(
      getRegressionEventId("result-1"),
      "evaluation_result:result-1:regression",
    );
    assert.equal(
      getFixRemediationEventId("result-1"),
      "evaluation_result:result-1:fix_remediation",
    );
    assert.equal(
      getVersionApprovalEventId("version-1"),
      "model_version:version-1:approval",
    );
  });

  it("formats fix/remediation memories for resolved issues", () => {
    assert.equal(
      formatFixRemediationMemory({
        modelId: "model-1",
        modelName: "Customer Support Agent",
        fact: {
          ...fact,
          result: "PASS",
          actualResult: "Rejected refund after 45 days",
        },
        resolution: {
          was_previously_failed: true,
          resolved_in_version: "v1.3",
          stable_versions_after_resolution: ["v1.4"],
        },
      }),
      "Customer Support Agent v1.2 fix/remediation for Refund Policy. The issue was resolved in v1.3. Expected behavior: Reject refunds after 30 days. Observed behavior: Rejected refund after 45 days.",
    );
  });

  it("normalizes Hindsight recall responses into app-level memories", () => {
    const memories = normalizeRecallResponse({
      results: [
        {
          id: "memory-1",
          text: "Refund policy failed in v1.2.",
          relevance: 0.87,
          metadata: {
            event_type: "evaluation_failure",
            model_version_id: "version-1",
            version: "v1.2",
            evaluation_id: "evaluation-1",
            test_key: "refund-policy",
            timestamp: "2026-01-02T00:00:01.000Z",
          },
        },
      ],
    });

    assert.deepEqual(memories, [
      {
        id: "memory-1",
        content: "Refund policy failed in v1.2.",
        relevance: 0.87,
        eventType: "evaluation_failure",
        modelVersionId: "version-1",
        version: "v1.2",
        evaluationId: "evaluation-1",
        testKey: "refund-policy",
        timestamp: "2026-01-02T00:00:01.000Z",
      },
    ]);
  });

  it("preserves improvement event types from Hindsight recall metadata", () => {
    const memories = normalizeRecallResponse({
      results: [
        {
          id: "memory-improvement",
          text: "Refund policy improved in v1.3.",
          metadata: {
            event_type: "improvement",
            version: "v1.3",
            test_key: "refund-policy",
          },
        },
      ],
    });

    assert.equal(memories[0]?.eventType, "improvement");
  });

  it("returns an empty recall list for empty or malformed responses", () => {
    assert.deepEqual(normalizeRecallResponse({ results: [] }), []);
    assert.deepEqual(normalizeRecallResponse({ results: [{ text: "" }] }), []);
    assert.deepEqual(normalizeRecallResponse({}), []);
  });

  it("handles Hindsight retain failures without throwing", async () => {
    const client: HindsightClientLike = {
      async retain() {
        throw new Error("network unavailable");
      },
      async recall() {
        return { results: [] };
      },
    };

    const result = await retainMemoryWithClient(
      client,
      {
        modelId: "model-1",
        eventId: "evaluation_result:result-1:failure",
        eventType: "evaluation_failure",
        content: "Failure memory",
      },
      silentLogger,
    );

    assert.equal(result.ok, false);
    assert.equal(result.skipped, false);
    assert.equal(result.error, "network unavailable");
  });

  it("handles Hindsight recall failures as clean empty results", async () => {
    const client: HindsightClientLike = {
      async retain() {
        return {};
      },
      async recall() {
        throw new Error("unauthorized");
      },
    };

    const result = await recallMemoryWithClient(
      client,
      "model-1",
      "refund policy",
      {},
      silentLogger,
    );

    assert.equal(result.ok, false);
    assert.deepEqual(result.memories, []);
    assert.equal(result.error, "unauthorized");
  });

  it("creates a Hindsight bank before recalling memory", async () => {
    restoreEnv();
    process.env.LLM_PROVIDER = "nvidia-nim";
    process.env.LLM_MODEL = "meta/llama-3.2-11b-vision-instruct";
    process.env.NVIDIA_API_KEY = "test-nvidia-key";
    process.env.LLM_BASE_URL = "https://integrate.api.nvidia.com/v1";
    const calls: Array<{ type: string; bankId: string; payload?: unknown }> = [];
    const client: HindsightClientLike = {
      async createBank(bankId, profile) {
        calls.push({ type: "createBank", bankId, payload: profile });
        return {};
      },
      async retain() {
        return {};
      },
      async recall(bankId) {
        calls.push({ type: "recall", bankId });
        return { results: [] };
      },
    };

    const result = await recallMemoryWithClient(
      client,
      "configured-model",
      "refund policy",
      {},
      silentLogger,
    );

    assert.equal(result.ok, true);
    assert.deepEqual(
      calls.map((call) => call.type),
      ["createBank", "recall"],
    );
    restoreEnv();
  });
});
