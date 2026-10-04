import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";
import { throwDataAccessError } from "./errors";

export type ModelVersionConfigurationRow =
  Tables<"model_version_configurations">;
export type CreateModelVersionConfigurationInput =
  TablesInsert<"model_version_configurations">;
export type UpdateModelVersionConfigurationInput =
  TablesUpdate<"model_version_configurations">;

export const DEFAULT_NVIDIA_NIM_CONFIGURATION = {
  provider: "nvidia-nim",
  model_name: "deepseek-ai/deepseek-v4.1-flash",
  base_url: null,
  endpoint_url: null,
  system_prompt: null,
  temperature: 0,
  max_tokens: null,
  provider_settings: {},
  credential_reference: "NVIDIA_API_KEY",
} satisfies Omit<
  ModelVersionConfigurationRow,
  "id" | "model_version_id" | "created_at" | "updated_at"
>;

export function getDefaultModelVersionConfiguration(
  modelVersionId: string,
): ModelVersionConfigurationRow {
  return {
    id: `default-nvidia-nim:${modelVersionId}`,
    model_version_id: modelVersionId,
    ...DEFAULT_NVIDIA_NIM_CONFIGURATION,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
}

export async function getModelVersionConfiguration(
  modelVersionId: string,
): Promise<ModelVersionConfigurationRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("model_version_configurations")
    .select("*")
    .eq("model_version_id", modelVersionId)
    .maybeSingle();

  if (error) {
    throwDataAccessError("getModelVersionConfiguration", error);
  }

  return data;
}

export async function getEffectiveModelVersionConfiguration(
  modelVersionId: string,
): Promise<ModelVersionConfigurationRow> {
  return (
    (await getModelVersionConfiguration(modelVersionId)) ??
    getDefaultModelVersionConfiguration(modelVersionId)
  );
}

export async function upsertModelVersionConfiguration(
  input: CreateModelVersionConfigurationInput,
): Promise<ModelVersionConfigurationRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("model_version_configurations")
    .upsert(input, { onConflict: "model_version_id" })
    .select("*")
    .single();

  if (error) {
    throwDataAccessError("upsertModelVersionConfiguration", error);
  }

  return data;
}

export async function updateModelVersionConfiguration(
  modelVersionId: string,
  input: UpdateModelVersionConfigurationInput,
): Promise<ModelVersionConfigurationRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("model_version_configurations")
    .update(input)
    .eq("model_version_id", modelVersionId)
    .select("*")
    .single();

  if (error) {
    throwDataAccessError("updateModelVersionConfiguration", error);
  }

  return data;
}
