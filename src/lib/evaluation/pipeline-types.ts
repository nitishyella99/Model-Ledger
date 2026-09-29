import type {
  EvaluationSeverity,
  ExecutionStatus,
  Json,
  TestCaseEvaluatorType,
} from "../../types/database";

export type CanonicalTestCase = Readonly<{
  id: string;
  stableKey: string;
  modelId: string;
  name: string;
  category: string;
  input: string;
  expectedOutput: string;
  evaluationCriteria: Json;
  evaluatorType: TestCaseEvaluatorType;
  threshold: number;
  severity: EvaluationSeverity;
  tags: string[];
}>;

export type ExecutableModelConfiguration = Readonly<{
  modelVersionId: string;
  provider: string;
  modelName: string;
  baseUrl: string | null;
  endpointUrl: string | null;
  systemPrompt: string | null;
  temperature: number;
  maxTokens: number | null;
  providerSettings: Json;
  credentialReference: string;
}>;

export type ModelExecutionRequest = Readonly<{
  testCase: CanonicalTestCase;
  configuration: ExecutableModelConfiguration;
  timeoutMs?: number;
}>;

export type TokenUsage = Readonly<{
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}>;

export type ModelExecutionResult = Readonly<{
  output: string;
  latencyMs: number | null;
  tokenUsage: TokenUsage;
  estimatedCostUsd: number | null;
  providerMetadata: Json | null;
  status: ExecutionStatus;
  error: string | null;
}>;

export type AutomaticEvaluationResult = Readonly<{
  score: number;
  passed: boolean;
  reason: string;
  evidence: Json;
  evaluatorType: TestCaseEvaluatorType;
  status: "SUCCESS" | "ERROR";
}>;

export type EvaluationRunCounters = Readonly<{
  totalTests: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  averageScore: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}>;
