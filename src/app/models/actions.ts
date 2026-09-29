"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createModel } from "@/lib/data/models";

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
  fieldErrors?: Partial<Record<keyof z.infer<typeof createModelSchema>, string>>;
};

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function createModelAction(
  _previousState: CreateModelActionState,
  formData: FormData,
): Promise<CreateModelActionState> {
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

  try {
    await createModel({
      name: parsed.data.name,
      provider: parsed.data.provider,
      purpose: parsed.data.purpose,
    });

    revalidatePath("/");
    revalidatePath("/models");
    revalidatePath("/projects");
    revalidatePath("/versions");
    revalidatePath("/run-evaluation");

    return {
      status: "success",
      message: "Project created. Next step: add some test cases.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "The model could not be created.",
    };
  }
}
