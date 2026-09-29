"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateModel } from "@/lib/data/models";
import { upsertModelVersionConfiguration } from "@/lib/data/model-configurations";
import {
  createModelVersion,
  createVersionChanges,
} from "@/lib/data/versions";
import {
  retainVersionApprovalDecision,
  retainVersionChange,
} from "@/lib/hindsight/retain";
import type { VersionChangeType } from "@/types/database";

const allowedChangeTypes = [
  "SYSTEM_PROMPT",
  "MODEL_CONFIG",
  "TOOLING",
  "POLICY",
  "OTHER",
] as const;

const addVersionSchema = z
  .object({
    modelId: z.string().uuid("Select a valid model."),
    version: z
      .string()
      .trim()
      .min(1, "Version identifier is required.")
      .max(80, "Version identifier must be 80 characters or fewer."),
    status: z.enum(["DRAFT", "APPROVED", "MONITORING", "DEPRECATED"], {
      error: "Select a valid version status.",
    }),
    changeType: z.enum(allowedChangeTypes).optional().or(z.literal("")),
    fieldName: z
      .string()
      .trim()
      .max(120, "Field name must be 120 characters or fewer.")
      .optional(),
    previousValue: z
      .string()
      .trim()
      .max(4000, "Previous value must be 4,000 characters or fewer.")
      .optional(),
    newValue: z
      .string()
      .trim()
      .max(4000, "New value must be 4,000 characters or fewer.")
      .optional(),
    description: z
      .string()
      .trim()
      .max(1000, "Description must be 1,000 characters or fewer.")
      .optional(),
  })
  .superRefine((value, context) => {
    const hasAnyChange = Boolean(
      value.changeType ||
        value.fieldName ||
        value.previousValue ||
        value.newValue ||
        value.description,
    );

    if (!hasAnyChange) {
      return;
    }

    if (!value.changeType) {
      context.addIssue({
        code: "custom",
        path: ["changeType"],
        message: "Change type is required when recording a change.",
      });
    }

    if (!value.description) {
      context.addIssue({
        code: "custom",
        path: ["description"],
        message: "Change description is required when recording a change.",
      });
    }

    if (!value.fieldName) {
      context.addIssue({
        code: "custom",
        path: ["fieldName"],
        message: "Field name is required when recording a change.",
      });
    }
  });

export type AddVersionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  createdVersionId?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof addVersionSchema>, string>>;
};

const modelVersionConfigurationSchema = z.object({
  modelVersionId: z.string().uuid("Select a valid model version."),
  provider: z.string().trim().min(1).max(80),
  modelName: z.string().trim().min(1).max(160),
  baseUrl: z.string().trim().url().optional().or(z.literal("")),
  endpointUrl: z.string().trim().url().optional().or(z.literal("")),
  systemPrompt: z.string().trim().max(12000).optional(),
  temperature: z.coerce.number().min(0).max(2),
  maxTokens: z.coerce.number().int().positive().optional().or(z.literal("")),
  providerSettings: z.string().trim().optional(),
  credentialReference: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Z0-9_]+$/, "Use an environment variable name, not an API key."),
});

export type ModelVersionConfigurationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function addVersionAction(
  _previousState: AddVersionActionState,
  formData: FormData,
): Promise<AddVersionActionState> {
  const parsed = addVersionSchema.safeParse({
    modelId: getStringValue(formData, "modelId"),
    version: getStringValue(formData, "version"),
    status: getStringValue(formData, "status"),
    changeType: getStringValue(formData, "changeType"),
    fieldName: getStringValue(formData, "fieldName"),
    previousValue: getStringValue(formData, "previousValue"),
    newValue: getStringValue(formData, "newValue"),
    description: getStringValue(formData, "description"),
  });

  if (!parsed.success) {
    const fieldErrors: AddVersionActionState["fieldErrors"] = {};

    for (const issue of parsed.error.issues) {
      const fieldName = issue.path[0];

      if (typeof fieldName === "string") {
        fieldErrors[fieldName as keyof typeof fieldErrors] = issue.message;
      }
    }

    return {
      status: "error",
      message: "Fix the highlighted fields before adding the version.",
      fieldErrors,
    };
  }

  try {
    const version = await createModelVersion({
      model_id: parsed.data.modelId,
      version: parsed.data.version,
      status: parsed.data.status,
    });
    const hasChange = Boolean(parsed.data.changeType && parsed.data.description);
    const createdChanges = hasChange
      ? await createVersionChanges([
          {
            model_version_id: version.id,
            change_type: parsed.data.changeType as VersionChangeType,
            field_name: parsed.data.fieldName || null,
            previous_value: parsed.data.previousValue || null,
            new_value: parsed.data.newValue || null,
            description: parsed.data.description ?? "",
          },
        ])
      : [];

    await Promise.all(
      [
        retainVersionApprovalDecision({
          modelId: parsed.data.modelId,
          modelVersionId: version.id,
          version: version.version,
          status: version.status,
          timestamp: version.created_at,
        }),
        ...createdChanges.map((change) =>
          retainVersionChange({
            modelId: parsed.data.modelId,
            version: version.version,
            change,
          }),
        ),
      ],
    );

    await updateModel(parsed.data.modelId, {
      current_model_version_id: version.id,
      updated_at: new Date().toISOString(),
    });

    revalidatePath("/");
    revalidatePath("/models");
    revalidatePath("/versions");
    revalidatePath(`/projects/${parsed.data.modelId}`);
    revalidatePath("/run-evaluation");
    revalidatePath("/memory");

    return {
      status: "success",
      message: "Version added. It will use the default NVIDIA NIM configuration for evaluations.",
      createdVersionId: version.id,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "The version could not be added.",
    };
  }
}

export async function saveModelVersionConfigurationAction(
  _previousState: ModelVersionConfigurationActionState,
  formData: FormData,
): Promise<ModelVersionConfigurationActionState> {
  const parsed = modelVersionConfigurationSchema.safeParse({
    modelVersionId: getStringValue(formData, "modelVersionId"),
    provider: getStringValue(formData, "provider"),
    modelName: getStringValue(formData, "modelName"),
    baseUrl: getStringValue(formData, "baseUrl"),
    endpointUrl: getStringValue(formData, "endpointUrl"),
    systemPrompt: getStringValue(formData, "systemPrompt"),
    temperature: getStringValue(formData, "temperature") || "0",
    maxTokens: getStringValue(formData, "maxTokens"),
    providerSettings: getStringValue(formData, "providerSettings"),
    credentialReference: getStringValue(formData, "credentialReference"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ??
        "Fix the model configuration before saving.",
    };
  }

  let providerSettings = {};

  if (parsed.data.providerSettings) {
    try {
      providerSettings = JSON.parse(parsed.data.providerSettings) as Record<
        string,
        unknown
      >;
    } catch {
      return {
        status: "error",
        message: "Provider settings must be valid JSON.",
      };
    }
  }

  await upsertModelVersionConfiguration({
    model_version_id: parsed.data.modelVersionId,
    provider: parsed.data.provider,
    model_name: parsed.data.modelName,
    base_url: parsed.data.baseUrl || null,
    endpoint_url: parsed.data.endpointUrl || null,
    system_prompt: parsed.data.systemPrompt || null,
    temperature: parsed.data.temperature,
    max_tokens:
      typeof parsed.data.maxTokens === "number" ? parsed.data.maxTokens : null,
    provider_settings: providerSettings,
    credential_reference: parsed.data.credentialReference,
  });

  revalidatePath("/versions");
  revalidatePath(`/versions/${parsed.data.modelVersionId}`);
  revalidatePath("/run-evaluation");
  revalidatePath("/compare");
  revalidatePath("/");

  return {
    status: "success",
    message: "Model configuration saved.",
  };
}
