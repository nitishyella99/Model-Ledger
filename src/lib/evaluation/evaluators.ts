import type { AiCompletionProvider } from "../ai/types";
import type { Json } from "../../types/database";
import type {
  AutomaticEvaluationResult,
  CanonicalTestCase,
} from "./pipeline-types";

export type EvaluationJudge = Readonly<{
  complete?: AiCompletionProvider;
}>;

function clampScore(value: number) {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function getCriteriaObject(testCase: CanonicalTestCase) {
  return testCase.evaluationCriteria &&
    typeof testCase.evaluationCriteria === "object" &&
    !Array.isArray(testCase.evaluationCriteria)
    ? (testCase.evaluationCriteria as Record<string, unknown>)
    : {};
}

function getContainsRules(testCase: CanonicalTestCase) {
  const criteria = getCriteriaObject(testCase);
  const rawRules = criteria.contains ?? criteria.required_phrases ?? [];

  if (Array.isArray(rawRules)) {
    return rawRules
      .map((rule) => (typeof rule === "string" ? rule.trim() : ""))
      .filter(Boolean);
  }

  if (typeof rawRules === "string") {
    return rawRules
      .split(/[|;\n]/)
      .map((rule) => rule.trim())
      .filter(Boolean);
  }

  return testCase.expectedOutput
    .split(/[|;\n]/)
    .map((rule) => rule.trim())
    .filter(Boolean);
}

export function evaluateExactMatch(
  testCase: CanonicalTestCase,
  actualOutput: string,
): AutomaticEvaluationResult {
  const score =
    normalize(actualOutput) === normalize(testCase.expectedOutput) ? 1 : 0;

  return {
    score,
    passed: score >= testCase.threshold,
    reason:
      score === 1
        ? "Actual output exactly matched the expected output."
        : "Actual output did not exactly match the expected output.",
    evidence: {
      expected: testCase.expectedOutput,
      actual: actualOutput,
    },
    evaluatorType: "exact_match",
    status: "SUCCESS",
  };
}

export function evaluateContains(
  testCase: CanonicalTestCase,
  actualOutput: string,
): AutomaticEvaluationResult {
  const rules = getContainsRules(testCase);
  const normalizedOutput = normalize(actualOutput);
  const matched = rules.filter((rule) =>
    normalizedOutput.includes(normalize(rule)),
  );
  const score = rules.length === 0 ? 0 : matched.length / rules.length;

  return {
    score: clampScore(score),
    passed: score >= testCase.threshold,
    reason:
      rules.length === 0
        ? "No contains rules were configured."
        : `${matched.length} of ${rules.length} required phrases were present.`,
    evidence: {
      required: rules,
      matched,
      missing: rules.filter((rule) => !matched.includes(rule)),
    },
    evaluatorType: "contains",
    status: "SUCCESS",
  };
}

function parseJudgeResponse(response: unknown) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    throw new Error("Judge response was not an object.");
  }

  const record = response as Record<string, unknown>;
  const score = clampScore(Number(record.score));

  const evidence = (
    record.evidence && typeof record.evidence === "object"
      ? JSON.parse(JSON.stringify(record.evidence))
      : { response: JSON.parse(JSON.stringify(response)) }
  ) as Json;

  return {
    score,
    reason:
      typeof record.reason === "string"
        ? record.reason
        : "Judge returned a score without a reason.",
    evidence,
  };
}

export async function evaluateWithLlmJudge(
  testCase: CanonicalTestCase,
  actualOutput: string,
  judge: EvaluationJudge,
): Promise<AutomaticEvaluationResult> {
  if (!judge.complete) {
    return {
      score: 0,
      passed: false,
      reason: "LLM judge is not configured.",
      evidence: {},
      evaluatorType: "llm_judge",
      status: "ERROR",
    };
  }

  try {
    const response = await judge.complete({
      schemaName: "modelledger_llm_judge",
      system:
        "You are an evaluation judge. Return JSON with score from 0 to 1, reason, and evidence. Judge only against the supplied expected output and criteria.",
      user: JSON.stringify({
        input: testCase.input,
        expectedOutput: testCase.expectedOutput,
        criteria: testCase.evaluationCriteria,
        actualOutput,
      }),
    });
    const parsed = parseJudgeResponse(response);

    return {
      score: parsed.score,
      passed: parsed.score >= testCase.threshold,
      reason: parsed.reason,
      evidence: parsed.evidence,
      evaluatorType: "llm_judge",
      status: "SUCCESS",
    };
  } catch (error) {
    return {
      score: 0,
      passed: false,
      reason:
        error instanceof Error
          ? error.message
          : "LLM judge failed unexpectedly.",
      evidence: {},
      evaluatorType: "llm_judge",
      status: "ERROR",
    };
  }
}

export async function evaluateOutput(
  testCase: CanonicalTestCase,
  actualOutput: string,
  judge: EvaluationJudge = {},
): Promise<AutomaticEvaluationResult> {
  if (testCase.evaluatorType === "contains") {
    return evaluateContains(testCase, actualOutput);
  }

  if (testCase.evaluatorType === "llm_judge") {
    return evaluateWithLlmJudge(testCase, actualOutput, judge);
  }

  return evaluateExactMatch(testCase, actualOutput);
}
