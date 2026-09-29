import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";
import { throwDataAccessError } from "./errors";

export type ModelRow = Tables<"models">;
export type CreateModelInput = TablesInsert<"models">;
export type UpdateModelInput = TablesUpdate<"models">;

export async function getModels(): Promise<ModelRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("models")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throwDataAccessError("getModels", error);
  }

  return data;
}

export async function getModelById(modelId: string): Promise<ModelRow | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("models")
    .select("*")
    .eq("id", modelId)
    .maybeSingle();

  if (error) {
    throwDataAccessError("getModelById", error);
  }

  return data;
}

export async function createModel(input: CreateModelInput): Promise<ModelRow> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("models")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throwDataAccessError("createModel", error);
  }

  return data;
}

export async function updateModel(
  modelId: string,
  input: UpdateModelInput,
): Promise<ModelRow> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("models")
    .update(input)
    .eq("id", modelId)
    .select("*")
    .single();

  if (error) {
    throwDataAccessError("updateModel", error);
  }

  return data;
}
