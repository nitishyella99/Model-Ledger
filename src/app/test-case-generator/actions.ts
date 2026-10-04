"use server";

import { requireUserId } from "@/lib/auth";

import { z } from "zod";
import { runTestCaseGeneratorPipeline } from "@/lib/test-case-generator/pipeline";
import type { TestCaseGeneratorResult } from "@/lib/test-case-generator/types";
import { testCaseCountOptions } from "@/lib/test-case-generator/processor";
import { completeTestCaseGeneration } from "@/lib/ai/client";

const generatorActionSchema = z.object({
  modelContext: z.string().trim().max(20_000).default(""),
  message: z
    .string()
    .trim()
    .min(1, "Describe your model before generating test cases.")
    .max(8_000, "Keep the model description under 8,000 characters."),
  testCaseCount: z.number().refine(
    (count) => testCaseCountOptions.includes(count as (typeof testCaseCountOptions)[number]),
    "Choose a supported test case count.",
  ),
  allowMissingContext: z.boolean().optional(),
  clarificationQuestions: z.array(z.string().trim().min(1).max(6000)).max(3).optional(),
});

export type GenerateTestCasesActionResult =
  | TestCaseGeneratorResult
  | Readonly<{
      status: "error";
      message: string;
    }>;

export async function generateTestCasesAction(
  input: unknown,
): Promise<GenerateTestCasesActionResult> {
  await requireUserId();
  const parsed = generatorActionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Invalid generator request.",
    };
  }

  try {
    return await runTestCaseGeneratorPipeline(parsed.data, completeTestCaseGeneration);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error && error.name === "AbortError"
          ? "The AI model took too long to respond. Please try again."
          : error instanceof SyntaxError
          ? "The AI model returned malformed JSON during analysis or review. Please try again."
          : error instanceof Error
          ? error.message
          : "Test cases could not be generated.",
    };
  }
}
