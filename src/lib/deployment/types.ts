import type { Json } from "../../types/database";

export type DeploymentStage = "draft" | "uploading" | "validating" | "queued" | "preparing" | "evaluating" | "ready" | "failed" | "cancelled";
export type ModelSource = "upload" | "huggingface" | "api";
export type ArtifactFile = { path: string; size: number; modified?: number };
export type ModelSettings = { source: ModelSource; repository: string; revision: string; endpoint: string; model: string; systemPrompt: string; files: ArtifactFile[]; reuseTests: boolean; draftCsv?: string; displayName?: string; deleting?: boolean; artifactStorage?: "r2" | "supabase" };
export type Onboarding = {
  id: string; owner_user_id: string; model_id: string; model_version_id: string;
  idempotency_key: string; stage: DeploymentStage; settings: ModelSettings;
  error: string | null; completed_tests: number; total_tests: number;
  evaluation_id: string | null; baseline_version_id: string | null;
  artifact_revision: string | null; worker_id: string | null;
  artifact_bytes?: number;
  lease_token: string | null; lease_expires_at: string | null; attempt: number;
  reserved_seconds: number; used_seconds: number; cancel_requested: boolean;
  reviewed_at: string | null; created_at: string; updated_at: string;
  test_snapshot?: TestSnapshot[];
};
export type DeploymentTables = {
  model_private_credentials: { Row: { operation_id: string; ciphertext: string; updated_at: string }; Insert: { operation_id: string; ciphertext: string; updated_at?: string }; Update: { ciphertext?: string; updated_at?: string }; Relationships: [] };
  model_onboarding: { Row: Onboarding; Insert: Partial<Onboarding>; Update: Partial<Onboarding>; Relationships: [] };
  deployment_allowances: { Row: { owner_user_id: string; enabled: boolean; remaining_seconds: number; max_job_seconds: number; max_storage_bytes: number }; Insert: { owner_user_id: string; enabled?: boolean; remaining_seconds?: number; max_job_seconds?: number; max_storage_bytes?: number }; Update: { enabled?: boolean; remaining_seconds?: number; max_job_seconds?: number; max_storage_bytes?: number }; Relationships: [] };
};
export const emptySettings: ModelSettings = { source: "upload", repository: "", revision: "main", endpoint: "", model: "", systemPrompt: "", files: [], reuseTests: true };
export type GuidedInput = { name: string; purpose: string; version: string; projectId?: string; versionId?: string; operationId?: string; idempotencyKey: string; settings: ModelSettings; csv: string; credential?: string; intent: "draft" | "evaluate" | "upload" };
export type GuidedState = { error?: string; fields?: Record<string, string>; operation?: Onboarding; message?: string };
export type Guidance = { title: string; message: string; action: string | null; href: string | null; automatic: boolean };
export type TestSnapshot = { id: string; stable_key: string; name: string; category: string; input: string; expected_output: string; evaluator_type: "exact_match" | "contains" | "llm_judge"; threshold: number; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; tags: string[]; evaluation_criteria: Json };
