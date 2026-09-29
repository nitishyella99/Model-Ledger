import type { TestResultAnalysis } from "../evaluation/engine";
import type { HindsightRecallMemory } from "../hindsight/types";
import type { EvaluationSeverity, Tables } from "../../types/database";

type EvaluationAnalysisResult = Readonly<{
  id: string;
  test_name: string;
  test_key: string | null;
  category: string;
  expected_result: string | null;
  actual_result: string | null;
  result: "PASS" | "FAIL";
  severity: EvaluationSeverity;
}>;
type ModelRow = Tables<"models">;
type ModelVersionRow = Tables<"model_versions">;
type VersionChangeRow = Tables<"version_changes">;

export type AnalysisConfidence = "LOW" | "MEDIUM" | "HIGH";

export type EvaluationAiAnalysis = Readonly<{
  executiveSummary: string;
  keyChanges: Array<{
    change: string;
    impact: string;
    evidence: string;
  }>;
  historicalEvidence: Array<{
    event: string;
    outcome: string;
    relevance: string;
  }>;
  recommendedActions: Array<{
    action: string;
    reason: string;
  }>;
  confidence: AnalysisConfidence;
  limitations: string[];
}>;

export type EvaluationAnalysisStatus =
  | Readonly<{
      ok: true;
      analysis: EvaluationAiAnalysis;
    }>
  | Readonly<{
      ok: false;
      message: string;
    }>;

export type EvaluationAnalysisInput = Readonly<{
  model: ModelRow;
  version: ModelVersionRow;
  result: EvaluationAnalysisResult;
  deterministicAnalysis: TestResultAnalysis;
  versionChanges: readonly VersionChangeRow[];
  hindsightMemories: readonly HindsightRecallMemory[];
}>;

export type AiCompletionRequest = Readonly<{
  system: string;
  user: string;
  schemaName: string;
}>;

export type AiCompletionProvider = (
  request: AiCompletionRequest,
) => Promise<unknown>;

export type EvaluationAnalysisPayload = Readonly<{
  currentFacts: {
    model: string;
    provider: string;
    modelPurpose: string;
    version: string;
    test: string;
    testKey: string;
    category: string;
    expectedResult: string | null;
    actualResult: string | null;
    result: string;
    severity: string;
  };
  deterministicEngine: {
    classification: string;
    regressionStatus: boolean;
    regressionType: string;
    previousFailureVersions: string[];
    previousPassingVersion: string | null;
    originalFailureVersion: string | null;
    resolvedVersion: string | null;
    testHistory: Array<{
      version: string;
      result: string;
      evaluatedAt: string;
    }>;
  };
  versionChanges: Array<{
    type: string;
    field: string | null;
    description: string;
    previousValue: string | null;
    newValue: string | null;
  }>;
  hindsightMemory: Array<{
    eventType: string | null;
    version: string | null;
    content: string;
    relevance: number | null;
  }>;
}>;
