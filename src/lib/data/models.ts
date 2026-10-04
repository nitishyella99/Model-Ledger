import "server-only";
import { requireUserId } from "@/lib/auth";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";
import { throwDataAccessError } from "./errors";

export type ModelRow = Tables<"models">;
export type CreateModelInput = Omit<TablesInsert<"models">, "owner_user_id">;
export type UpdateModelInput = Omit<TablesUpdate<"models">, "owner_user_id">;

export async function getModels(): Promise<ModelRow[]> {
  const userId = await requireUserId();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("models")
    .select("*")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throwDataAccessError("getModels", error);
  }

  return data;
}

export async function getModelById(modelId: string): Promise<ModelRow | null> {
  const userId = await requireUserId();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("models")
    .select("*")
    .eq("id", modelId)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (error) {
    throwDataAccessError("getModelById", error);
  }

  return data;
}

export async function createModel(input: CreateModelInput): Promise<ModelRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("models")
    .insert({ ...input, owner_user_id: await requireUserId() })
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
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("models")
    .update({
      name: input.name,
      provider: input.provider,
      purpose: input.purpose,
      current_model_version_id: input.current_model_version_id,
      updated_at: input.updated_at,
    })
    .eq("id", modelId)
    .select("*")
    .single();

  if (error) {
    throwDataAccessError("updateModel", error);
  }

  return data;
}

export async function requireOwnedModel(modelId: string) {
  const model = await getModelById(modelId);
  if (!model) throw new Error("Project not found.");
  return model;
}
