import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/database";
import { throwDataAccessError } from "./errors";

export type ModelVersionRow = Tables<"model_versions">;
export type VersionChangeRow = Tables<"version_changes">;
export type CreateModelVersionInput = TablesInsert<"model_versions">;
export type UpdateModelVersionInput = TablesUpdate<"model_versions">;
export type CreateVersionChangeInput = TablesInsert<"version_changes">;

export async function getVersionsByModelId(
  modelId: string,
): Promise<ModelVersionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("model_versions")
    .select("*")
    .eq("model_id", modelId)
    .order("created_at", { ascending: false });

  if (error) {
    throwDataAccessError("getVersionsByModelId", error);
  }

  return data;
}

export async function getVersionById(
  versionId: string,
): Promise<ModelVersionRow | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("model_versions")
    .select("*")
    .eq("id", versionId)
    .maybeSingle();

  if (error) {
    throwDataAccessError("getVersionById", error);
  }

  return data;
}

export async function getChronologicalVersionsByModelId(
  modelId: string,
): Promise<ModelVersionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("model_versions")
    .select("*")
    .eq("model_id", modelId)
    .order("created_at", { ascending: true });

  if (error) {
    throwDataAccessError("getChronologicalVersionsByModelId", error);
  }

  return data;
}

export async function getVersionChangesByVersionIds(
  versionIds: string[],
): Promise<VersionChangeRow[]> {
  if (versionIds.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("version_changes")
    .select("*")
    .in("model_version_id", versionIds)
    .order("created_at", { ascending: true });

  if (error) {
    throwDataAccessError("getVersionChangesByVersionIds", error);
  }

  return data;
}

export async function createModelVersion(
  input: CreateModelVersionInput,
): Promise<ModelVersionRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("model_versions")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throwDataAccessError("createModelVersion", error);
  }

  return data;
}

export async function updateModelVersion(
  versionId: string,
  input: UpdateModelVersionInput,
): Promise<ModelVersionRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("model_versions")
    .update(input)
    .eq("id", versionId)
    .select("*")
    .single();

  if (error) {
    throwDataAccessError("updateModelVersion", error);
  }

  return data;
}

export async function deleteModelVersion(versionId: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("model_versions")
    .delete()
    .eq("id", versionId);

  if (error) {
    throwDataAccessError("deleteModelVersion", error);
  }
}

export async function createVersionChanges(
  inputs: CreateVersionChangeInput[],
): Promise<VersionChangeRow[]> {
  if (inputs.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("version_changes")
    .insert(inputs)
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throwDataAccessError("createVersionChanges", error);
  }

  return data;
}
