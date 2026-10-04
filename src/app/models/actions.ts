"use server";

import { requireUserId } from "@/lib/auth";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createModel, updateModel } from "@/lib/data/models";
import {
  parseAndValidateTestCasesCsv,
  toTestCaseInsert,
  upsertTestCases,
} from "@/lib/data/test-cases";
import { createModelVersion } from "@/lib/data/versions";

const createModelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Model name is required.")
    .max(120, "Model name must be 120 characters or fewer."),
  provider: z
    .string()
    .trim()
    .min(1, "Choose what you are testing.")
    .max(120, "Project type must be 120 characters or fewer."),
  purpose: z
    .string()
    .trim()
    .min(1, "Short description is required.")
    .max(1000, "Purpose must be 1,000 characters or fewer."),
});

export type CreateModelActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  createdProjectId?: string;
  createdVersions?: { id: string; version: string }[];
  fieldErrors?: Partial<
    Record<keyof z.infer<typeof createModelSchema> | "versions" | "csv", string>
  >;
};

type VersionCsv = {
  index: number;
  csv: string;
};

type ParsedVersionCsv = VersionCsv & {
  rows: ReturnType<typeof parseAndValidateTestCasesCsv>["rows"];
};

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

async function getCsvFileText(value: FormDataEntryValue | undefined) {
  if (!(value instanceof File) || value.size === 0) {
    return "";
  }

  if (
    value.type &&
    !["text/csv", "application/vnd.ms-excel", "text/plain"].includes(value.type)
  ) {
    throw new Error("Upload a CSV text file.");
  }

  return value.text();
}

async function getVersionCsvValues(formData: FormData, versionCount: number) {
  const files = formData.getAll("versionCsvFile");
  const csvEntries = await Promise.all(
    Array.from({ length: versionCount }, async (_, index) => ({
      index,
      csv: (await getCsvFileText(files[index])).trim(),
    })),
  );

  return csvEntries.filter((entry) => entry.csv.length > 0);
}

export async function createModelAction(
  _previousState: CreateModelActionState,
  formData: FormData,
): Promise<CreateModelActionState> {
  await requireUserId();
  const versionNames = formData
    .getAll("versions")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  const parsed = createModelSchema.safeParse({
    name: getStringValue(formData, "name"),
    provider: getStringValue(formData, "provider"),
    purpose: getStringValue(formData, "purpose"),
  });

  if (!parsed.success) {
    const fieldErrors: CreateModelActionState["fieldErrors"] = {};

    for (const issue of parsed.error.issues) {
      const fieldName = issue.path[0];

      if (typeof fieldName === "string") {
        fieldErrors[fieldName as keyof typeof fieldErrors] = issue.message;
      }
    }

    return {
      status: "error",
      message: "Fix the highlighted fields before creating the project.",
      fieldErrors,
    };
  }

  if (versionNames.length === 0) {
    return {
      status: "error",
      message: "Add at least one version before creating the project.",
      fieldErrors: {
        versions: "Add at least one version.",
      },
    };
  }

  let versionCsvs: VersionCsv[] = [];

  try {
    versionCsvs = await getVersionCsvValues(formData, versionNames.length);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "CSV file could not be read.",
      fieldErrors: {
        csv: "Upload CSV text files only.",
      },
    };
  }

  const parsedVersionCsvs: ParsedVersionCsv[] = [];

  for (const versionCsv of versionCsvs) {
    const parsedCsv = parseAndValidateTestCasesCsv(versionCsv.csv);

    if (parsedCsv.errors.length > 0) {
      const versionName =
        versionNames[versionCsv.index] ?? `Version ${versionCsv.index + 1}`;

      return {
        status: "error",
        message: parsedCsv.errors
          .slice(0, 5)
          .map(
            (error) =>
              `${versionName} row ${error.row} ${error.field}: ${error.message}`,
          )
          .join(" "),
        fieldErrors: {
          csv: "Fix the CSV rows before importing.",
        },
      };
    }

    parsedVersionCsvs.push({
      ...versionCsv,
      rows: parsedCsv.rows,
    });
  }

  try {
    const model = await createModel({
      name: parsed.data.name,
      provider: parsed.data.provider,
      purpose: parsed.data.purpose,
    });
    const versions = await Promise.all(
      versionNames.map((version) =>
        createModelVersion({
          model_id: model.id,
          version,
          status: "DRAFT",
        }),
      ),
    );
    const currentVersion = versions.at(-1) ?? versions[0];
    let importedCount = 0;
    let importedFileCount = 0;

    if (currentVersion) {
      await updateModel(model.id, {
        current_model_version_id: currentVersion.id,
        updated_at: new Date().toISOString(),
      });
    }

    for (const parsedCsv of parsedVersionCsvs) {
      const version = versions[parsedCsv.index];

      if (version) {
        await upsertTestCases(
          parsedCsv.rows.map((row) =>
            toTestCaseInsert(model.id, {
              ...row,
              modelVersionId: version.id,
            }),
          ),
        );
        importedCount += parsedCsv.rows.length;
        importedFileCount += 1;
      }
    }

    revalidatePath("/dashboard");
    revalidatePath("/models");
    revalidatePath("/projects");
    revalidatePath("/versions");
    revalidatePath("/tests");
    revalidatePath("/run-evaluation");
    revalidatePath(`/projects/${model.id}`);
    revalidatePath(`/projects/${model.id}/tests`);

    return {
      status: "success",
      createdProjectId: model.id,
      createdVersions: versions.map(version => ({ id: version.id, version: version.version })),
      message:
        importedCount > 0
          ? `Project created with ${versions.length} version${versions.length === 1 ? "" : "s"} and ${importedCount} test case${importedCount === 1 ? "" : "s"} from ${importedFileCount} CSV file${importedFileCount === 1 ? "" : "s"}.`
          : `Project created with ${versions.length} version${versions.length === 1 ? "" : "s"}. Upload test cases from the Test Cases page before generating a report.`,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "The model could not be created.",
    };
  }
}
