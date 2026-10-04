import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";
import { throwDataAccessError } from "./errors";

export type EvaluationRow = Tables<"evaluations">;
export type EvaluationResultRow = Tables<"evaluation_results">;
export type CreateEvaluationInput = TablesInsert<"evaluations">;
export type CreateEvaluationResultInput = TablesInsert<"evaluation_results">;
export type UpdateEvaluationInput = TablesUpdate<"evaluations">;

export async function getEvaluations(): Promise<EvaluationRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("evaluations")
    .select("*")
    .order("evaluated_at", { ascending: false });

  if (error) {
    throwDataAccessError("getEvaluations", error);
  }

  return data;
}

export async function getEvaluationsByModelId(
  modelId: string,
): Promise<EvaluationRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("evaluations")
    .select("*")
    .eq("model_id", modelId)
    .order("evaluated_at", { ascending: false });

  if (error) {
    throwDataAccessError("getEvaluationsByModelId", error);
  }

  return data;
}

export async function getEvaluationById(
  evaluationId: string,
): Promise<EvaluationRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("evaluations")
    .select("*")
    .eq("id", evaluationId)
    .maybeSingle();

  if (error) {
    throwDataAccessError("getEvaluationById", error);
  }

  return data;
}

export async function getEvaluationResultsByEvaluationIds(
  evaluationIds: string[],
): Promise<EvaluationResultRow[]> {
  if (evaluationIds.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("evaluation_results")
    .select("*")
    .in("evaluation_id", evaluationIds)
    .order("created_at", { ascending: false });

  if (error) {
    throwDataAccessError("getEvaluationResultsByEvaluationIds", error);
  }

  return data;
}

export async function getEvaluationResultsByEvaluationId(
  evaluationId: string,
): Promise<EvaluationResultRow[]> {
  return getEvaluationResultsByEvaluationIds([evaluationId]);
}

export async function createEvaluation(
  input: CreateEvaluationInput,
): Promise<EvaluationRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("evaluations")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throwDataAccessError("createEvaluation", error);
  }

  return data;
}

export async function createEvaluationResults(
  inputs: CreateEvaluationResultInput[],
): Promise<EvaluationResultRow[]> {
  if (inputs.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("evaluation_results")
    .insert(inputs)
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throwDataAccessError("createEvaluationResults", error);
  }

  return data;
}

export async function updateEvaluation(
  evaluationId: string,
  input: UpdateEvaluationInput,
): Promise<EvaluationRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("evaluations")
    .update(input)
    .eq("id", evaluationId)
    .select("*")
    .single();

  if (error) {
    throwDataAccessError("updateEvaluation", error);
  }

  return data;
}
