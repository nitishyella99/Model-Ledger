import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert } from "@/types/database";
import { throwDataAccessError } from "./errors";

export type EvaluationRecommendationRow = Tables<"evaluation_recommendations">;
export type CreateEvaluationRecommendationInput =
  TablesInsert<"evaluation_recommendations">;

export async function getRecommendationsByEvaluationId(
  evaluationId: string,
): Promise<EvaluationRecommendationRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("evaluation_recommendations")
    .select("*")
    .eq("evaluation_id", evaluationId)
    .order("created_at", { ascending: true });

  if (error) {
    throwDataAccessError("getRecommendationsByEvaluationId", error);
  }

  return data;
}

export async function createEvaluationRecommendations(
  inputs: CreateEvaluationRecommendationInput[],
): Promise<EvaluationRecommendationRow[]> {
  if (inputs.length === 0) {
    return [];
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("evaluation_recommendations")
    .insert(inputs)
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throwDataAccessError("createEvaluationRecommendations", error);
  }

  return data;
}
