export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ModelVersionStatus =
  | "DRAFT"
  | "APPROVED"
  | "MONITORING"
  | "DEPRECATED";

export type VersionChangeType =
  | "SYSTEM_PROMPT"
  | "TOOLING"
  | "POLICY"
  | "MODEL_CONFIG"
  | "EVALUATION"
  | "OTHER";

export type EvaluationResultValue = "PASS" | "FAIL";

export type EvaluationSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TestCaseEvaluatorType = "exact_match" | "contains" | "llm_judge";

export type EvaluationRunStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED";

export type ExecutionStatus =
  | "SUCCESS"
  | "AUTH_FAILURE"
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "API_FAILURE"
  | "MALFORMED_RESPONSE";

export type EvaluatorStatus = "SUCCESS" | "ERROR";

import type { DeploymentTables } from "../lib/deployment/types";

export type Database = {
  public: {
    Tables: DeploymentTables & {
      models: {
        Row: {
          owner_user_id: string | null;
          id: string;
          name: string;
          provider: string;
          purpose: string;
          current_model_version_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner_user_id?: string | null;
          id?: string;
          name: string;
          provider: string;
          purpose: string;
          current_model_version_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          owner_user_id?: string | null;
          id?: string;
          name?: string;
          provider?: string;
          purpose?: string;
          current_model_version_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "models_current_model_version_id_fkey";
            columns: ["current_model_version_id"];
            referencedRelation: "model_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      model_versions: {
        Row: {
          id: string;
          model_id: string;
          version: string;
          status: ModelVersionStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          model_id: string;
          version: string;
          status?: ModelVersionStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          model_id?: string;
          version?: string;
          status?: ModelVersionStatus;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "model_versions_model_id_fkey";
            columns: ["model_id"];
            referencedRelation: "models";
            referencedColumns: ["id"];
          },
        ];
      };
      version_changes: {
        Row: {
          id: string;
          model_version_id: string;
          change_type: VersionChangeType;
          field_name: string | null;
          previous_value: string | null;
          new_value: string | null;
          description: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          model_version_id: string;
          change_type: VersionChangeType;
          field_name?: string | null;
          previous_value?: string | null;
          new_value?: string | null;
          description: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          model_version_id?: string;
          change_type?: VersionChangeType;
          field_name?: string | null;
          previous_value?: string | null;
          new_value?: string | null;
          description?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "version_changes_model_version_id_fkey";
            columns: ["model_version_id"];
            referencedRelation: "model_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      test_cases: {
        Row: {
          id: string;
          stable_key: string;
          model_id: string;
          model_version_id: string | null;
          name: string;
          category: string;
          input: string;
          expected_output: string;
          evaluation_criteria: Json;
          evaluator_type: TestCaseEvaluatorType;
          threshold: number;
          severity: EvaluationSeverity;
          tags: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          stable_key: string;
          model_id: string;
          model_version_id?: string | null;
          name: string;
          category: string;
          input: string;
          expected_output: string;
          evaluation_criteria?: Json;
          evaluator_type?: TestCaseEvaluatorType;
          threshold?: number;
          severity?: EvaluationSeverity;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          stable_key?: string;
          model_id?: string;
          model_version_id?: string | null;
          name?: string;
          category?: string;
          input?: string;
          expected_output?: string;
          evaluation_criteria?: Json;
          evaluator_type?: TestCaseEvaluatorType;
          threshold?: number;
          severity?: EvaluationSeverity;
          tags?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "test_cases_model_id_fkey";
            columns: ["model_id"];
            referencedRelation: "models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "test_cases_model_version_id_fkey";
            columns: ["model_version_id"];
            referencedRelation: "model_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      model_version_configurations: {
        Row: {
          id: string;
          model_version_id: string;
          provider: string;
          model_name: string;
          base_url: string | null;
          endpoint_url: string | null;
          system_prompt: string | null;
          temperature: number;
          max_tokens: number | null;
          provider_settings: Json;
          credential_reference: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          model_version_id: string;
          provider: string;
          model_name: string;
          base_url?: string | null;
          endpoint_url?: string | null;
          system_prompt?: string | null;
          temperature?: number;
          max_tokens?: number | null;
          provider_settings?: Json;
          credential_reference: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          model_version_id?: string;
          provider?: string;
          model_name?: string;
          base_url?: string | null;
          endpoint_url?: string | null;
          system_prompt?: string | null;
          temperature?: number;
          max_tokens?: number | null;
          provider_settings?: Json;
          credential_reference?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "model_version_configurations_model_version_id_fkey";
            columns: ["model_version_id"];
            referencedRelation: "model_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      evaluations: {
        Row: {
          id: string;
          model_id: string;
          model_version_id: string;
          name: string;
          evaluated_at: string;
          notes: string | null;
          status: EvaluationRunStatus;
          started_at: string | null;
          ended_at: string | null;
          duration_ms: number | null;
          total_tests: number | null;
          passed_count: number | null;
          failed_count: number | null;
          error_count: number | null;
          average_score: number | null;
          total_input_tokens: number | null;
          total_output_tokens: number | null;
          total_tokens: number | null;
          estimated_cost_usd: number | null;
          run_metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          model_id: string;
          model_version_id: string;
          name: string;
          evaluated_at: string;
          notes?: string | null;
          status?: EvaluationRunStatus;
          started_at?: string | null;
          ended_at?: string | null;
          duration_ms?: number | null;
          total_tests?: number | null;
          passed_count?: number | null;
          failed_count?: number | null;
          error_count?: number | null;
          average_score?: number | null;
          total_input_tokens?: number | null;
          total_output_tokens?: number | null;
          total_tokens?: number | null;
          estimated_cost_usd?: number | null;
          run_metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          model_id?: string;
          model_version_id?: string;
          name?: string;
          evaluated_at?: string;
          notes?: string | null;
          status?: EvaluationRunStatus;
          started_at?: string | null;
          ended_at?: string | null;
          duration_ms?: number | null;
          total_tests?: number | null;
          passed_count?: number | null;
          failed_count?: number | null;
          error_count?: number | null;
          average_score?: number | null;
          total_input_tokens?: number | null;
          total_output_tokens?: number | null;
          total_tokens?: number | null;
          estimated_cost_usd?: number | null;
          run_metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evaluations_model_id_fkey";
            columns: ["model_id"];
            referencedRelation: "models";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evaluations_model_version_id_fkey";
            columns: ["model_version_id"];
            referencedRelation: "model_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      evaluation_results: {
        Row: {
          id: string;
          evaluation_id: string;
          test_case_id: string | null;
          test_name: string;
          test_key: string | null;
          category: string;
          test_input: string;
          expected_result: string;
          actual_result: string;
          result: EvaluationResultValue;
          severity: EvaluationSeverity;
          evaluator_notes: string | null;
          input_snapshot: string | null;
          expected_output_snapshot: string | null;
          evaluation_criteria_snapshot: Json | null;
          evaluator_type: TestCaseEvaluatorType | null;
          threshold: number | null;
          score: number | null;
          passed: boolean | null;
          evaluator_reason: string | null;
          evaluator_evidence: Json | null;
          model_latency_ms: number | null;
          input_tokens: number | null;
          output_tokens: number | null;
          total_tokens: number | null;
          estimated_cost_usd: number | null;
          provider_status: string | null;
          provider_error: string | null;
          provider_metadata: Json | null;
          execution_status: ExecutionStatus | null;
          evaluator_status: EvaluatorStatus | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          evaluation_id: string;
          test_case_id?: string | null;
          test_name: string;
          test_key?: string | null;
          category: string;
          test_input: string;
          expected_result: string;
          actual_result: string;
          result: EvaluationResultValue;
          severity: EvaluationSeverity;
          evaluator_notes?: string | null;
          input_snapshot?: string | null;
          expected_output_snapshot?: string | null;
          evaluation_criteria_snapshot?: Json | null;
          evaluator_type?: TestCaseEvaluatorType | null;
          threshold?: number | null;
          score?: number | null;
          passed?: boolean | null;
          evaluator_reason?: string | null;
          evaluator_evidence?: Json | null;
          model_latency_ms?: number | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          total_tokens?: number | null;
          estimated_cost_usd?: number | null;
          provider_status?: string | null;
          provider_error?: string | null;
          provider_metadata?: Json | null;
          execution_status?: ExecutionStatus | null;
          evaluator_status?: EvaluatorStatus | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          evaluation_id?: string;
          test_case_id?: string | null;
          test_name?: string;
          test_key?: string | null;
          category?: string;
          test_input?: string;
          expected_result?: string;
          actual_result?: string;
          result?: EvaluationResultValue;
          severity?: EvaluationSeverity;
          evaluator_notes?: string | null;
          input_snapshot?: string | null;
          expected_output_snapshot?: string | null;
          evaluation_criteria_snapshot?: Json | null;
          evaluator_type?: TestCaseEvaluatorType | null;
          threshold?: number | null;
          score?: number | null;
          passed?: boolean | null;
          evaluator_reason?: string | null;
          evaluator_evidence?: Json | null;
          model_latency_ms?: number | null;
          input_tokens?: number | null;
          output_tokens?: number | null;
          total_tokens?: number | null;
          estimated_cost_usd?: number | null;
          provider_status?: string | null;
          provider_error?: string | null;
          provider_metadata?: Json | null;
          execution_status?: ExecutionStatus | null;
          evaluator_status?: EvaluatorStatus | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evaluation_results_evaluation_id_fkey";
            columns: ["evaluation_id"];
            referencedRelation: "evaluations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evaluation_results_test_case_id_fkey";
            columns: ["test_case_id"];
            referencedRelation: "test_cases";
            referencedColumns: ["id"];
          },
        ];
      };
      evaluation_recommendations: {
        Row: {
          id: string;
          evaluation_id: string;
          test_key: string | null;
          priority: "HIGH" | "MEDIUM" | "LOW";
          title: string;
          action: string;
          evidence: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          evaluation_id: string;
          test_key?: string | null;
          priority: "HIGH" | "MEDIUM" | "LOW";
          title: string;
          action: string;
          evidence?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          evaluation_id?: string;
          test_key?: string | null;
          priority?: "HIGH" | "MEDIUM" | "LOW";
          title?: string;
          action?: string;
          evidence?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evaluation_recommendations_evaluation_id_fkey";
            columns: ["evaluation_id"];
            referencedRelation: "evaluations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_guided_project: { Args: { p_key: string; p_name: string; p_purpose: string; p_version: string; p_settings: Json; p_tests: Json; p_project?: string }; Returns: string };
      claim_model_job: { Args: { p_id: string; p_owner: string; p_lease: string }; Returns: Json };
      finish_model_job: { Args: { p_id: string; p_lease: string; p_used: number }; Returns: undefined };
      begin_model_upload: { Args: { p_id: string; p_owner: string }; Returns: undefined };
      reserve_model_import: { Args: { p_id: string; p_owner: string; p_bytes: number; p_revision: string }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Row"];

export type TablesInsert<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Insert"];

export type TablesUpdate<TableName extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][TableName]["Update"];
