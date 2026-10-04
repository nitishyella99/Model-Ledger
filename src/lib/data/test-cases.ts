import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/types/database";
import {
  parseAndValidateTestCasesCsv,
  parseTestCasesCsv,
  stableKeyForCsvTest,
  type CsvTestCaseInput,
  type CsvValidationError,
  type ParsedTestCasesCsv,
} from "./test-case-csv";
import { throwDataAccessError } from "./errors";

export type TestCaseRow = Tables<"test_cases">;
export type CreateTestCaseInput = TablesInsert<"test_cases">;
export type UpdateTestCaseInput = TablesUpdate<"test_cases">;
export {
  parseAndValidateTestCasesCsv,
  parseTestCasesCsv,
  type CsvTestCaseInput,
  type CsvValidationError,
  type ParsedTestCasesCsv,
};

export async function getTestCasesByModelId(
  modelId: string,
): Promise<TestCaseRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("test_cases")
    .select("*")
    .eq("model_id", modelId)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throwDataAccessError("getTestCasesByModelId", error);
  }

  return data;
}

export async function getTestCasesByIds(
  testCaseIds: string[],
): Promise<TestCaseRow[]> {
  if (testCaseIds.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("test_cases")
    .select("*")
    .in("id", testCaseIds)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throwDataAccessError("getTestCasesByIds", error);
  }

  return data;
}

export async function createTestCase(
  input: CreateTestCaseInput,
): Promise<TestCaseRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("test_cases")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throwDataAccessError("createTestCase", error);
  }

  return data;
}

export async function upsertTestCases(
  inputs: CreateTestCaseInput[],
): Promise<TestCaseRow[]> {
  if (inputs.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("test_cases")
    .upsert(inputs, { onConflict: "model_id,model_version_id,stable_key" })
    .select("*")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    if (isMissingModelVersionColumnError(error)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from("test_cases")
        .upsert(inputs.map(toLegacyTestCaseInsert), {
          onConflict: "model_id,stable_key",
        })
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (legacyError) {
        throwDataAccessError("upsertTestCases", legacyError);
      }

      return legacyData.map(normalizeTestCaseRow);
    }

    throwDataAccessError("upsertTestCases", error);
  }

  return data.map(normalizeTestCaseRow);
}

export async function updateTestCase(
  testCaseId: string,
  input: UpdateTestCaseInput,
): Promise<TestCaseRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("test_cases")
    .update(input)
    .eq("id", testCaseId)
    .select("*")
    .single();

  if (error) {
    throwDataAccessError("updateTestCase", error);
  }

  return data;
}

export function toTestCaseInsert(
  modelId: string,
  input: CsvTestCaseInput,
): CreateTestCaseInput {
  const stableKey = stableKeyForCsvTest(input);

  return {
    stable_key: stableKey,
    model_id: modelId,
    model_version_id: input.modelVersionId ?? null,
    name: input.name,
    category: input.category,
    input: input.input,
    expected_output: input.expectedOutput,
    evaluation_criteria: (input.evaluationCriteria ?? {}) as Json,
    evaluator_type: input.evaluatorType ?? "exact_match",
    threshold: input.threshold ?? 1,
    severity: input.severity ?? "LOW",
    tags: input.tags ?? [],
  };
}

function isMissingModelVersionColumnError(error: {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}) {
  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    (error.code === "PGRST204" || error.code === "42703") &&
    text.includes("model_version_id")
  );
}

function toLegacyTestCaseInsert(input: CreateTestCaseInput) {
  const legacyInput = { ...input };
  delete legacyInput.model_version_id;

  return legacyInput;
}

function normalizeTestCaseRow(row: unknown): TestCaseRow {
  const record = row as Record<string, unknown>;

  if ("model_version_id" in record) {
    return record as TestCaseRow;
  }

  return {
    ...record,
    model_version_id: null,
  } as TestCaseRow;
}
