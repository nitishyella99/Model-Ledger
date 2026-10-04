"use server";

import { requireUserId } from "@/lib/auth";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  getTestCasesByIds,
  parseAndValidateTestCasesCsv,
  updateTestCase,
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

export type EditTestCasesActionState = Readonly<{
  status: "idle" | "success" | "error";
  message?: string;
  updatedCount?: number;
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
  await requireUserId();
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
  await requireUserId();
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

const editableEvaluatorTypes = ["exact_match", "contains", "llm_judge"] as const;
const editableSeverities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

function getStringValues(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string");
}

export async function updateTestCasesAction(
  _previousState: EditTestCasesActionState,
  formData: FormData,
): Promise<EditTestCasesActionState> {
  await requireUserId();
  const modelId = getStringValue(formData, "modelId");
  const modelVersionId = getStringValue(formData, "modelVersionId");
  const ids = getStringValues(formData, "testCaseId");
  const names = getStringValues(formData, "name");
  const categories = getStringValues(formData, "category");
  const inputs = getStringValues(formData, "input");
  const expectedOutputs = getStringValues(formData, "expectedOutput");
  const evaluatorTypes = getStringValues(formData, "evaluatorType");
  const thresholds = getStringValues(formData, "threshold");
  const severities = getStringValues(formData, "severity");
  const tags = getStringValues(formData, "tags");

  if (!modelId || !modelVersionId) {
    return {
      status: "error",
      message: "Select a project and version before saving test cases.",
    };
  }

  if (ids.length === 0) {
    return {
      status: "error",
      message: "There are no test cases to save for this version.",
    };
  }

  try {
    const version = await getVersionById(modelVersionId);

    if (!version || version.model_id !== modelId) {
      return {
        status: "error",
        message: "Select a version that belongs to this project.",
      };
    }

    const existingCases = await getTestCasesByIds(ids);

    if (
      existingCases.length !== ids.length ||
      existingCases.some((testCase) => testCase.model_id !== modelId)
    ) {
      return {
        status: "error",
        message: "One or more selected test cases do not belong to this project.",
      };
    }

    await Promise.all(
      ids.map((id, index) => {
        const threshold = Number(thresholds[index] ?? "1");
        const evaluatorType = evaluatorTypes[index];
        const severity = severities[index];

        if (!names[index]?.trim() || !categories[index]?.trim()) {
          throw new Error("Each test case needs a name and suite.");
        }

        if (!inputs[index]?.trim() || !expectedOutputs[index]?.trim()) {
          throw new Error("Each test case needs input and expected output.");
        }

        if (
          !editableEvaluatorTypes.includes(
            evaluatorType as (typeof editableEvaluatorTypes)[number],
          )
        ) {
          throw new Error("Select a valid evaluator type.");
        }

        if (
          !editableSeverities.includes(
            severity as (typeof editableSeverities)[number],
          )
        ) {
          throw new Error("Select a valid severity.");
        }

        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
          throw new Error("Threshold must be between 0 and 1.");
        }

        return updateTestCase(id, {
          model_id: modelId,
          model_version_id: modelVersionId,
          name: names[index].trim(),
          category: categories[index].trim(),
          input: inputs[index].trim(),
          expected_output: expectedOutputs[index].trim(),
          evaluator_type: evaluatorType as (typeof editableEvaluatorTypes)[number],
          threshold,
          severity: severity as (typeof editableSeverities)[number],
          tags: (tags[index] ?? "")
            .split(/[|,;]/)
            .map((tag) => tag.trim())
            .filter(Boolean),
          updated_at: new Date().toISOString(),
        });
      }),
    );

    revalidatePath("/tests");
    revalidatePath("/tests/edit");
    revalidatePath(`/projects/${modelId}`);
    revalidatePath(`/projects/${modelId}/tests`);
    revalidatePath("/run-evaluation");

    return {
      status: "success",
      message: `${ids.length} test case${ids.length === 1 ? "" : "s"} saved.`,
      updatedCount: ids.length,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Test cases could not be saved.",
    };
  }
}
