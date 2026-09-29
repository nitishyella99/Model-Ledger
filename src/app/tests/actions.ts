"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  parseAndValidateTestCasesCsv,
  toTestCaseInsert,
  upsertTestCases,
} from "@/lib/data/test-cases";
import { getVersionById } from "@/lib/data/versions";

const testCaseSchema = z.object({
  modelId: z.string().uuid("Select a valid model."),
  modelVersionId: z.string().uuid("Select a valid version.").optional().nullable(),
  stableKey: z.string().trim().max(160).optional(),
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(120),
  input: z.string().trim().min(1).max(8000),
  expectedOutput: z.string().trim().min(1).max(8000),
  evaluatorType: z.enum(["exact_match", "contains", "llm_judge"]),
  threshold: z.coerce.number().min(0).max(1),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  tags: z.string().trim().optional(),
});

const csvImportSchema = z.object({
  modelId: z.string().uuid("Select a valid model."),
  modelVersionId: z.string().uuid("Select a version before importing CSV tests."),
  csv: z.string().trim().optional(),
});

export type TestCaseActionState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
  importedCount?: number;
}>;

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

async function getCsvValue(formData: FormData) {
  const pasted = getStringValue(formData, "csv").trim();

  if (pasted) {
    return pasted;
  }

  const file = formData.get("csvFile");

  if (!(file instanceof File) || file.size === 0) {
    return "";
  }

  if (
    file.type &&
    !["text/csv", "application/vnd.ms-excel", "text/plain"].includes(file.type)
  ) {
    throw new Error("Upload a CSV text file.");
  }

  return file.text();
}

export async function createTestCaseAction(
  _previousState: TestCaseActionState,
  formData: FormData,
): Promise<TestCaseActionState> {
  const rawModelVersionId = getStringValue(formData, "modelVersionId");
  const parsed = testCaseSchema.safeParse({
    modelId: getStringValue(formData, "modelId"),
    modelVersionId: rawModelVersionId ? rawModelVersionId : null,
    stableKey: getStringValue(formData, "stableKey"),
    name: getStringValue(formData, "name"),
    category: getStringValue(formData, "category"),
    input: getStringValue(formData, "input"),
    expectedOutput: getStringValue(formData, "expectedOutput"),
    evaluatorType: getStringValue(formData, "evaluatorType") || "exact_match",
    threshold: getStringValue(formData, "threshold") || "1",
    severity: getStringValue(formData, "severity") || "LOW",
    tags: getStringValue(formData, "tags"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Fix the test case fields before saving.",
    };
  }

  const input = parsed.data;
  await upsertTestCases([
    toTestCaseInsert(input.modelId, {
      modelVersionId: input.modelVersionId ?? null,
      stableKey: input.stableKey || null,
      name: input.name,
      category: input.category,
      input: input.input,
      expectedOutput: input.expectedOutput,
      evaluatorType: input.evaluatorType,
      threshold: input.threshold,
      severity: input.severity,
      tags: input.tags
        ?.split(/[|,;]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    }),
  ]);

  revalidatePath("/tests");
  revalidatePath(`/projects/${input.modelId}`);
  revalidatePath(`/projects/${input.modelId}/tests`);
  revalidatePath("/run-evaluation");
  revalidatePath("/", "layout");

  return {
    status: "success",
    message: "Test case saved.",
    importedCount: 1,
  };
}

export async function importTestCasesCsvAction(
  _previousState: TestCaseActionState,
  formData: FormData,
): Promise<TestCaseActionState> {
  let csv = "";

  try {
    csv = await getCsvValue(formData);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "CSV file could not be read.",
    };
  }

  const parsed = csvImportSchema.safeParse({
    modelId: getStringValue(formData, "modelId"),
    modelVersionId: getStringValue(formData, "modelVersionId"),
    csv,
  });

  if (!parsed.success || !parsed.data.csv) {
    return {
      status: "error",
      message:
        "Select a version and provide a CSV file or pasted CSV content before importing.",
    };
  }

  const version = await getVersionById(parsed.data.modelVersionId);

  if (!version || version.model_id !== parsed.data.modelId) {
    return {
      status: "error",
      message: "Select a version that belongs to this project before importing.",
    };
  }

  const parsedCsv = parseAndValidateTestCasesCsv(parsed.data.csv);

  if (parsedCsv.errors.length > 0) {
    return {
      status: "error",
      message: parsedCsv.errors
        .slice(0, 5)
        .map((error) => `Row ${error.row} ${error.field}: ${error.message}`)
        .join(" "),
    };
  }

  await upsertTestCases(
    parsedCsv.rows.map((row) =>
      toTestCaseInsert(parsed.data.modelId, {
        ...row,
        modelVersionId: parsed.data.modelVersionId,
      }),
    ),
  );

  revalidatePath("/tests");
  revalidatePath(`/projects/${parsed.data.modelId}`);
  revalidatePath(`/projects/${parsed.data.modelId}/tests`);
  revalidatePath("/run-evaluation");
  revalidatePath("/", "layout");

  return {
    status: "success",
    message: `${parsedCsv.rows.length} test cases imported.`,
    importedCount: parsedCsv.rows.length,
  };
}
