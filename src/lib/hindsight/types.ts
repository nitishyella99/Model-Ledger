import type {
  EvaluationFact,
  RegressionAnalysis,
  ResolvedIssueAnalysis,
  VersionChangeInput,
} from "../evaluation/types";

export type MemoryEventType =
  | "evaluation_failure"
  | "evaluation_outcome"
  | "regression"
  | "improvement"
  | "resolved_issue"
  | "version_change"
  | "fix_remediation"
  | "approval_decision"
  | "rejection_decision"
  | "evaluator_note";

export type HindsightMemoryMetadata = Record<string, string>;

export type HindsightMemoryBankId = `model:${string}`;

export type RetainMemoryInput = Readonly<{
  modelId: string;
  eventId: string;
  eventType: MemoryEventType;
  content: string;
  timestamp?: string | Date | null;
  metadata?: HindsightMemoryMetadata;
}>;

export type RetainMemoryResult = Readonly<{
  ok: boolean;
  skipped: boolean;
  eventId: string;
  bankId: HindsightMemoryBankId;
  error?: string;
}>;

export type HindsightRecallMemory = Readonly<{
  id: string;
  content: string;
  relevance: number | null;
  eventType: MemoryEventType | null;
  modelVersionId: string | null;
  version: string | null;
  evaluationId: string | null;
  testKey: string | null;
  timestamp: string | null;
}>;

export type RecallMemoryResult = Readonly<{
  ok: boolean;
  bankId: HindsightMemoryBankId;
  memories: HindsightRecallMemory[];
  error?: string;
}>;

export type RecallForEvaluationInput = Readonly<{
  modelId: string;
  testKey?: string | null;
  category?: string | null;
  currentFailureDescription?: string | null;
  eventTypes?: readonly MemoryEventType[];
  limit?: number;
}>;

export type HindsightClientLike = Readonly<{
  retain: (
    bankId: string,
    content: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  recall: (
    bankId: string,
    query: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  getBankProfile?: (bankId: string) => Promise<unknown>;
  createBank?: (
    bankId: string,
    profile?: Record<string, unknown>,
  ) => Promise<unknown>;
}>;

export type EvaluationMemoryContext = Readonly<{
  modelId: string;
  modelName?: string | null;
  fact: EvaluationFact;
  versionChanges?: readonly VersionChangeInput[];
}>;

export type RegressionMemoryContext = EvaluationMemoryContext &
  Readonly<{
    regression: RegressionAnalysis;
  }>;

export type ResolutionMemoryContext = EvaluationMemoryContext &
  Readonly<{
    resolution: ResolvedIssueAnalysis;
  }>;

export type VersionChangeMemoryContext = Readonly<{
  modelId: string;
  modelName?: string | null;
  version: string;
  change: VersionChangeInput;
}>;

export type VersionApprovalMemoryContext = Readonly<{
  modelId: string;
  modelName?: string | null;
  modelVersionId: string;
  version: string;
  status: string;
  timestamp: string;
}>;
