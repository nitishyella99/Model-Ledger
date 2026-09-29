import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeEvaluationWithAi,
  buildEvaluationAnalysisPayload,
  inputSystemPrompt,
} from "../../src/lib/ai/analyze-evaluation";
import type {
  AiCompletionProvider,
  EvaluationAiAnalysis,
  EvaluationAnalysisInput,
} from "../../src/lib/ai/types";
import {
  analyzeTestResult,
  buildEvaluationDataset,
} from "../../src/lib/evaluation/engine";
import type { HindsightRecallMemory } from "../../src/lib/hindsight/types";

const baseDate = Date.parse("2026-01-01T00:00:00.000Z");

const model = {
  id: "model-1",
  name: "Customer Support Agent",
  provider: "OpenAI",
  purpose: "Answers customer support policy questions.",
  current_model_version_id: "version-5",
  created_at: new Date(baseDate).toISOString(),
  updated_at: new Date(baseDate).toISOString(),
};

const versions = [
  {
    id: "version-1",
    model_id: model.id,
    version: "v1.2",
    status: "APPROVED" as const,
    created_at: new Date(baseDate).toISOString(),
  },
  {
    id: "version-2",
    model_id: model.id,
    version: "v1.3",
    status: "APPROVED" as const,
    created_at: new Date(baseDate + 86_400_000).toISOString(),
  },
  {
    id: "version-3",
    model_id: model.id,
    version: "v1.4",
    status: "MONITORING" as const,
    created_at: new Date(baseDate + 172_800_000).toISOString(),
  },
  {
    id: "version-4",
    model_id: model.id,
    version: "v1.5",
    status: "MONITORING" as const,
    created_at: new Date(baseDate + 259_200_000).toISOString(),
  },
  {
    id: "version-5",
    model_id: model.id,
    version: "v1.6",
    status: "MONITORING" as const,
    created_at: new Date(baseDate + 345_600_000).toISOString(),
  },
];

function evaluation(index: number, modelVersionId: string) {
  return {
    id: `evaluation-${index}`,
    model_id: model.id,
    model_version_id: modelVersionId,
    name: `Evaluation ${index}`,
    evaluated_at: new Date(baseDate + index * 86_400_000 + 1000).toISOString(),
    notes: null,
    created_at: new Date(baseDate + index * 86_400_000).toISOString(),
  };
}

function result(
  index: number,
  evaluationId: string,
  outcome: "PASS" | "FAIL",
) {
  return {
    id: `result-${index}`,
    evaluation_id: evaluationId,
    test_name: "Refund Policy",
    test_key: "refund-policy",
    category: "Policy",
    test_input: "Can a customer refund after 45 days?",
    expected_result: "Explain that the policy does not allow this refund.",
    actual_result:
      outcome === "PASS"
        ? "The refund is not available after 45 days."
        : "The customer can receive a refund.",
    result: outcome,
    severity: "HIGH" as const,
    evaluator_notes: null,
    created_at: new Date(baseDate + index * 86_400_000 + 2000).toISOString(),
  };
}

const validAnalysis: EvaluationAiAnalysis = {
  executiveSummary:
    "Refund Policy changed from PASS in v1.5 to FAIL in v1.6 according to stored facts.",
  keyChanges: [
    {
      change: "Refund Policy changed from pass to fail.",
      impact: "The current version degraded on a high-severity policy test.",
      evidence: "Stored facts show v1.5 passed and v1.6 failed.",
    },
  ],
  historicalEvidence: [
    {
      event: "v1.5 passed Refund Policy.",
      outcome: "The same test passed before this failure.",
      relevance: "The previous pass makes the current failure a regression candidate.",
    },
  ],
  recommendedActions: [
    {
      action: "Compare system prompts between v1.1 and v1.2.",
      reason: "A prompt change is present in the supplied evidence and may be relevant.",
    },
  ],
  confidence: "MEDIUM",
  limitations: ["No memory confirms the exact root cause."],
};

const cautiousRegressionAnalysis: EvaluationAiAnalysis = {
  executiveSummary:
    "Refund Policy failed after prior passing versions, and the deterministic engine classifies the current result as a regression.",
  keyChanges: [
    {
      change: "Refund Policy failed after previous passing versions.",
      impact: "The deterministic engine classifies this as a regression.",
      evidence: "The supplied history includes a previous failure, later passes, and a current failure.",
    },
    {
      change: "System prompt changed.",
      impact: "The change may be relevant and should be reviewed.",
      evidence: "The supplied version change describes updated refund guidance.",
    },
  ],
  historicalEvidence: [
    {
      event: "Refund Policy failed earlier, then passed in later supplied versions.",
      outcome: "The issue was previously resolved before recurring.",
      relevance: "The recurrence can guide debugging without proving causation.",
    },
  ],
  recommendedActions: [
    {
      action:
        "Compare the system prompt between the last passing version and the failing version.",
      reason: "The supplied evidence contains a relevant prompt change.",
    },
  ],
  confidence: "MEDIUM",
  limitations: ["No supplied evidence confirms the exact root cause."],
};

const memories: HindsightRecallMemory[] = [
  {
    id: "memory-low",
    content: "Older unrelated failure.",
    relevance: 0.1,
    eventType: "evaluation_failure",
    modelVersionId: "version-1",
    version: "v1.0",
    evaluationId: "evaluation-1",
    testKey: "refund-policy",
    timestamp: new Date(baseDate).toISOString(),
  },
  {
    id: "memory-high",
    content: "Refund Policy was previously fixed by reviewing policy wording.",
    relevance: 0.9,
    eventType: "resolved_issue",
    modelVersionId: "version-2",
    version: "v1.1",
    evaluationId: "evaluation-2",
    testKey: "refund-policy",
    timestamp: new Date(baseDate + 86_400_000).toISOString(),
  },
];

function buildInput(outcomes: Array<"PASS" | "FAIL">): EvaluationAnalysisInput {
  const evaluations = outcomes.map((_, index) =>
    evaluation(index + 1, versions[index].id),
  );
  const results = outcomes.map((outcome, index) =>
    result(index + 1, evaluations[index].id, outcome),
  );
  const dataset = buildEvaluationDataset({
    versions: versions.slice(0, outcomes.length),
    evaluations,
    results,
  });

  return {
    model,
    version: versions[outcomes.length - 1],
    result: results[outcomes.length - 1],
    deterministicAnalysis: analyzeTestResult(
      dataset,
      "refund-policy",
      versions[outcomes.length - 1].id,
    ),
    versionChanges: [
      {
        id: "change-1",
        model_version_id: versions[outcomes.length - 1].id,
        change_type: "SYSTEM_PROMPT",
        field_name: "system_prompt",
        previous_value: "Old refund wording",
        new_value: "New refund wording",
        description: "Updated system prompt refund guidance.",
        created_at: new Date(baseDate + 172_800_000).toISOString(),
      },
    ],
    hindsightMemories: memories,
  };
}

describe("AI evaluation analysis", () => {
  it("returns valid structured output", async () => {
    const complete: AiCompletionProvider = async () => validAnalysis;
    const result = await analyzeEvaluationWithAi(
      buildInput(["PASS", "PASS", "FAIL"]),
      complete,
    );

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.analysis.confidence : null, "MEDIUM");
  });

  it("retries malformed output once", async () => {
    let calls = 0;
    const complete: AiCompletionProvider = async () => {
      calls += 1;
      return calls === 1 ? { executiveSummary: "" } : validAnalysis;
    };
    const result = await analyzeEvaluationWithAi(
      buildInput(["PASS", "PASS", "FAIL"]),
      complete,
    );

    assert.equal(calls, 2);
    assert.equal(result.ok, true);
  });

  it("returns a safe failure when the provider fails", async () => {
    const complete: AiCompletionProvider = async () => {
      throw new Error("provider unavailable");
    };
    const result = await analyzeEvaluationWithAi(
      buildInput(["PASS", "PASS", "FAIL"]),
      complete,
    );

    assert.deepEqual(result, {
      ok: false,
      message: "AI analysis temporarily unavailable.",
    });
  });

  it("returns a safe failure after repeated malformed output", async () => {
    const complete: AiCompletionProvider = async () => ({
      executiveSummary: "",
    });
    const result = await analyzeEvaluationWithAi(
      buildInput(["PASS", "PASS", "FAIL"]),
      complete,
    );

    assert.deepEqual(result, {
      ok: false,
      message: "AI analysis temporarily unavailable.",
    });
  });

  it("handles no historical memory", () => {
    const payload = buildEvaluationAnalysisPayload({
      ...buildInput(["PASS", "PASS", "FAIL"]),
      hindsightMemories: [],
    });

    assert.deepEqual(payload.hindsightMemory, []);
  });

  it("builds a regression payload from deterministic analysis", () => {
    const payload = buildEvaluationAnalysisPayload(
      buildInput(["PASS", "PASS", "FAIL"]),
    );

    assert.equal(payload.deterministicEngine.classification, "REGRESSION");
    assert.equal(payload.deterministicEngine.regressionStatus, true);
    assert.equal(payload.deterministicEngine.previousPassingVersion, "v1.3");
    assert.equal(payload.hindsightMemory[0].eventType, "resolved_issue");
  });

  it("builds a new failure payload without inventing previous failures", () => {
    const payload = buildEvaluationAnalysisPayload(buildInput(["FAIL"]));

    assert.equal(payload.deterministicEngine.classification, "NEW_FAILURE");
    assert.deepEqual(payload.deterministicEngine.previousFailureVersions, []);
    assert.equal(payload.deterministicEngine.previousPassingVersion, null);
  });

  it("builds a repeated failure payload without labeling it regression", () => {
    const payload = buildEvaluationAnalysisPayload(buildInput(["FAIL", "FAIL"]));

    assert.equal(
      payload.deterministicEngine.classification,
      "REPEATED_FAILURE",
    );
    assert.equal(payload.deterministicEngine.regressionStatus, false);
    assert.equal(payload.deterministicEngine.regressionType, "REPEATED_FAILURE");
  });

  it("builds the primary Refund Policy regression payload", () => {
    const payload = buildEvaluationAnalysisPayload(
      buildInput(["FAIL", "PASS", "PASS", "PASS", "FAIL"]),
    );

    assert.equal(payload.currentFacts.test, "Refund Policy");
    assert.equal(payload.deterministicEngine.classification, "REGRESSION");
    assert.equal(payload.deterministicEngine.regressionStatus, true);
    assert.equal(payload.deterministicEngine.previousPassingVersion, "v1.5");
    assert.equal(payload.deterministicEngine.originalFailureVersion, "v1.2");
    assert.equal(payload.deterministicEngine.resolvedVersion, "v1.3");
    assert.deepEqual(
      payload.deterministicEngine.testHistory.map(
        (entry) => `${entry.version}:${entry.result}`,
      ),
      ["v1.2:FAIL", "v1.3:PASS", "v1.4:PASS", "v1.5:PASS", "v1.6:FAIL"],
    );
  });

  it("retries unsupported causal claims and accepts cautious wording", async () => {
    let calls = 0;
    const complete: AiCompletionProvider = async () => {
      calls += 1;

      return calls === 1
        ? {
            ...validAnalysis,
            executiveSummary: "The system prompt change caused the regression.",
          }
        : cautiousRegressionAnalysis;
    };
    const result = await analyzeEvaluationWithAi(
      buildInput(["PASS", "PASS", "FAIL"]),
      complete,
    );

    assert.equal(calls, 2);
    assert.equal(result.ok, true);
    assert.match(
      result.ok
        ? result.analysis.keyChanges
            .map((change) => `${change.change} ${change.impact}`)
            .join(" ")
        : "",
      /may be relevant/,
    );
  });

  it("rejects regression-authority contradictions", async () => {
    const complete: AiCompletionProvider = async () => ({
      ...validAnalysis,
      executiveSummary: "This is not a regression even though the prompt changed.",
    });
    const result = await analyzeEvaluationWithAi(
      buildInput(["PASS", "PASS", "FAIL"]),
      complete,
    );

    assert.deepEqual(result, {
      ok: false,
      message: "AI analysis temporarily unavailable.",
    });
  });

  it("rejects regression claims for new failures", async () => {
    const complete: AiCompletionProvider = async () => ({
      ...validAnalysis,
      executiveSummary: "This is a regression in the first stored result.",
    });
    const result = await analyzeEvaluationWithAi(buildInput(["FAIL"]), complete);

    assert.deepEqual(result, {
      ok: false,
      message: "AI analysis temporarily unavailable.",
    });
  });

  it("limits histories, memories, and version changes in the payload", () => {
    const input = buildInput([
      "PASS",
      "PASS",
      "PASS",
      "PASS",
      "FAIL",
    ]);
    const extraMemories = Array.from({ length: 8 }, (_, index) => ({
      id: `extra-memory-${index}`,
      content: `Extra memory ${index}`,
      relevance: index / 10,
      eventType: "evaluation_failure" as const,
      modelVersionId: `version-${index}`,
      version: `v${index}`,
      evaluationId: `evaluation-${index}`,
      testKey: "refund-policy",
      timestamp: new Date(baseDate + index * 1000).toISOString(),
    }));
    const extraChanges = Array.from({ length: 8 }, (_, index) => ({
      id: `extra-change-${index}`,
      model_version_id: input.version.id,
      change_type: "SYSTEM_PROMPT" as const,
      field_name: "system_prompt",
      previous_value: `before-${index}`,
      new_value: `after-${index}`,
      description: `Change ${index}`,
      created_at: new Date(baseDate + index * 1000).toISOString(),
    }));
    const payload = buildEvaluationAnalysisPayload({
      ...input,
      versionChanges: extraChanges,
      hindsightMemories: extraMemories,
    });

    assert.equal(payload.deterministicEngine.testHistory.length, 5);
    assert.equal(payload.versionChanges.length, 6);
    assert.equal(payload.hindsightMemory.length, 5);
    assert.deepEqual(
      payload.hindsightMemory.map((memory) => memory.content),
      ["Extra memory 7", "Extra memory 6", "Extra memory 5", "Extra memory 4", "Extra memory 3"],
    );
  });

  it("includes prompt rules that prevent unsupported causal claims", () => {
    const prompt = inputSystemPrompt();

    assert.match(prompt, /Never claim causality unless explicitly supported/);
    assert.match(prompt, /do not say a change caused a regression/i);
    assert.match(prompt, /Never invent historical events/);
    assert.match(prompt, /regressionStatus fields are authoritative/);
    assert.match(prompt, /If hindsightMemory is empty/);
    assert.match(prompt, /evidence does not identify a confirmed root cause/);
  });
});
