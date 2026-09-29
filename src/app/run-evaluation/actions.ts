"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createEvaluation,
  createEvaluationResults,
} from "@/lib/data/evaluations";
import { getEvaluationDatasetByModelId } from "@/lib/data/evaluation-engine";
import { getModelById } from "@/lib/data/models";
import { toTestCaseInsert, upsertTestCases } from "@/lib/data/test-cases";
import { getStableTestKey } from "@/lib/evaluation/engine";
import {
  getVersionById,
  getVersionsByModelId,
  getVersionChangesByVersionIds,
} from "@/lib/data/versions";
import { analyzeTestResult } from "@/lib/evaluation/engine";
import { runConfiguredEvaluationSuite } from "@/lib/evaluation/run-service";
import { retainEvaluationResultMemories } from "@/lib/hindsight/retain";

const evaluationFormSchema = z.object({
  modelId: z.string().uuid("Select a valid model."),
  modelVersionId: z.string().uuid("Select a valid model version."),
  testCaseName: z
    .string()
    .trim()
    .min(1, "Test Case Name is required.")
    .max(200, "Test Case Name must be 200 characters or fewer."),
  category: z
    .string()
    .trim()
    .min(1, "Category is required.")
    .max(120, "Category must be 120 characters or fewer."),
  testInput: z
    .string()
    .trim()
    .min(1, "Test Input / Scenario is required.")
    .max(4000, "Test Input / Scenario must be 4,000 characters or fewer."),
  expectedResult: z
    .string()
    .trim()
    .min(1, "Expected Result is required.")
    .max(4000, "Expected Result must be 4,000 characters or fewer."),
  actualResult: z
    .string()
    .trim()
    .min(1, "Actual Result is required.")
    .max(4000, "Actual Result must be 4,000 characters or fewer."),
  result: z.enum(["PASS", "FAIL"], {
    error: "Result must be PASS or FAIL.",
  }),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"], {
    error: "Severity must be LOW, MEDIUM, HIGH, or CRITICAL.",
  }),
  evaluatorNotes: z
    .string()
    .trim()
    .max(2000, "Evaluator Notes must be 2,000 characters or fewer.")
    .optional(),
});

export type RunEvaluationActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  createdEvaluationId?: string;
  fieldErrors?: Partial<
    Record<keyof z.infer<typeof evaluationFormSchema>, string>
  >;
};

const automaticEvaluationSchema = z.object({
  modelId: z.string().uuid("Select a valid model."),
  modelVersionId: z.string().uuid("Select a valid model version.").optional().or(z.literal("")),
  reportType: z.string().optional(),
  testCaseIds: z.array(z.string().uuid()).optional(),
});

function getStringValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function submitEvaluationAction(
  _previousState: RunEvaluationActionState,
  formData: FormData,
): Promise<RunEvaluationActionState> {
  const parsed = evaluationFormSchema.safeParse({
    modelId: getStringValue(formData, "modelId"),
    modelVersionId: getStringValue(formData, "modelVersionId"),
    testCaseName: getStringValue(formData, "testCaseName"),
    category: getStringValue(formData, "category"),
    testInput: getStringValue(formData, "testInput"),
    expectedResult: getStringValue(formData, "expectedResult"),
    actualResult: getStringValue(formData, "actualResult"),
    result: getStringValue(formData, "result"),
    severity: getStringValue(formData, "severity"),
    evaluatorNotes: getStringValue(formData, "evaluatorNotes"),
  });

  if (!parsed.success) {
    const fieldErrors: RunEvaluationActionState["fieldErrors"] = {};

    for (const issue of parsed.error.issues) {
      const fieldName = issue.path[0];

      if (typeof fieldName === "string") {
        fieldErrors[fieldName as keyof typeof fieldErrors] = issue.message;
      }
    }

    return {
      status: "error",
      message: "Fix the highlighted fields before saving.",
      fieldErrors,
    };
  }

  try {
    const input = parsed.data;
    const [model, version] = await Promise.all([
      getModelById(input.modelId),
      getVersionById(input.modelVersionId),
    ]);

    if (!model || !version || version.model_id !== input.modelId) {
      return {
        status: "error",
        message: "Select a version that belongs to the selected model.",
        fieldErrors: {
          modelVersionId: "Selected version does not belong to the selected model.",
        },
      };
    }

    const now = new Date().toISOString();
    const [testCase] = await upsertTestCases([
      toTestCaseInsert(input.modelId, {
        name: input.testCaseName,
        category: input.category,
        input: input.testInput,
        expectedOutput: input.expectedResult,
        evaluatorType: "exact_match",
        threshold: input.result === "PASS" ? 1 : 0.8,
        severity: input.severity,
        tags: ["manual"],
      }),
    ]);
    const evaluation = await createEvaluation({
      model_id: input.modelId,
      model_version_id: input.modelVersionId,
      name: `${input.testCaseName} evaluation`,
      evaluated_at: now,
      notes: input.evaluatorNotes || null,
      status: "COMPLETED",
      started_at: now,
      ended_at: now,
      duration_ms: 0,
      total_tests: 1,
      passed_count: input.result === "PASS" ? 1 : 0,
      failed_count: input.result === "FAIL" ? 1 : 0,
      error_count: 0,
      average_score: input.result === "PASS" ? 1 : 0,
      run_metadata: {
        mode: "manual",
      },
    });

    const results = await createEvaluationResults([
      {
        evaluation_id: evaluation.id,
        test_case_id: testCase?.id,
        test_name: input.testCaseName,
        test_key:
          testCase?.stable_key ??
          getStableTestKey({
            test_key: null,
            category: input.category,
            test_name: input.testCaseName,
          }),
        category: input.category,
        test_input: input.testInput,
        expected_result: input.expectedResult,
        actual_result: input.actualResult,
        result: input.result,
        severity: input.severity,
        evaluator_notes: input.evaluatorNotes || null,
        input_snapshot: input.testInput,
        expected_output_snapshot: input.expectedResult,
        evaluation_criteria_snapshot: testCase?.evaluation_criteria ?? {},
        evaluator_type: testCase?.evaluator_type ?? "exact_match",
        threshold: testCase?.threshold ?? null,
        score: input.result === "PASS" ? 1 : 0,
        passed: input.result === "PASS",
        evaluator_reason: input.evaluatorNotes || null,
        evaluator_evidence: {
          source: "manual",
        },
        execution_status: "SUCCESS",
        evaluator_status: "SUCCESS",
      },
    ]);
    const evaluationDataset = await getEvaluationDatasetByModelId(input.modelId);
    const versionChanges = await getVersionChangesByVersionIds([
      input.modelVersionId,
    ]);

    await Promise.all(
      results.map(async (result) => {
        const analysis = analyzeTestResult(
          evaluationDataset,
          getStableTestKey(result),
          input.modelVersionId,
        );

        if (!analysis.current) {
          return [];
        }

        return retainEvaluationResultMemories({
          modelId: input.modelId,
          modelName: model.name,
          fact: analysis.current,
          versionChanges,
          regression: analysis.regression,
          resolution: analysis.resolvedIssue,
          evaluatorNote: result.evaluator_notes ?? evaluation.notes,
        });
      }),
    );

    revalidatePath("/");
    revalidatePath("/memory");
    revalidatePath("/models");
    revalidatePath("/versions");
    revalidatePath("/evaluations");
    revalidatePath("/", "layout");
    revalidatePath(`/reports/${evaluation.id}`);
    revalidatePath(`/evaluations/${evaluation.id}`);

    return {
      status: "success",
      message: "Evaluation saved. Opening the evaluation report.",
      createdEvaluationId: evaluation.id,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The evaluation could not be saved.",
    };
  }
}

export async function submitAutomaticEvaluationAction(
  _previousState: RunEvaluationActionState,
  formData: FormData,
): Promise<RunEvaluationActionState> {
  const reportType = getStringValue(formData, "reportType");
  const parsed = automaticEvaluationSchema.safeParse({
    modelId: getStringValue(formData, "modelId"),
    modelVersionId: getStringValue(formData, "modelVersionId"),
    reportType,
    testCaseIds: formData
      .getAll("testCaseIds")
      .filter((value): value is string => typeof value === "string"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Select a model, version, and reusable tests before running.",
    };
  }

  try {
    if (parsed.data.reportType === "all_project_reports") {
      const versions = await getVersionsByModelId(parsed.data.modelId);
      if (versions.length === 0) {
        return {
          status: "error",
          message: "No versions found for this project.",
        };
      }

      const sortedVersions = [...versions].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );

      const successfulRuns: Array<{ version: string; evaluationId: string; totalTests: number }> = [];
      const failedVersions: Array<{ version: string; reason: string }> = [];

      for (const ver of sortedVersions) {
        try {
          const run = await runConfiguredEvaluationSuite({
            modelId: parsed.data.modelId,
            modelVersionId: ver.id,
          });
          successfulRuns.push({
            version: ver.version,
            evaluationId: run.evaluationId,
            totalTests: run.counters.totalTests,
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : "Evaluation suite failure";
          console.error(`Failed to run evaluation for version ${ver.version}:`, err);
          failedVersions.push({ version: ver.version, reason });
        }
      }

      if (successfulRuns.length === 0) {
        const failureDetails = failedVersions
          .map((item) => `${item.version}: ${item.reason}`)
          .join("; ");
        return {
          status: "error",
          message: `Batch generation failed for all ${sortedVersions.length} versions. Details: ${failureDetails}`,
        };
      }

      revalidatePath("/");
      revalidatePath("/memory");
      revalidatePath("/models");
      revalidatePath("/versions");
      revalidatePath("/evaluations");
      revalidatePath("/runs");
      revalidatePath("/tests");
      revalidatePath("/reports");
      revalidatePath("/compare");
      revalidatePath(`/projects/${parsed.data.modelId}`);
      revalidatePath("/", "layout");

      const lastRun = successfulRuns[successfulRuns.length - 1];
      const totalTestsRan = successfulRuns.reduce((sum, item) => sum + item.totalTests, 0);

      const statusNote =
        failedVersions.length > 0
          ? ` (${failedVersions.length} version(s) skipped due to errors: ${failedVersions.map((f) => `${f.version} - ${f.reason}`).join(", ")})`
          : "";

      return {
        status: "success",
        message: `Batch report generation complete! Successfully generated reports across ${successfulRuns.length} of ${sortedVersions.length} version(s) (${totalTestsRan} total tests evaluated). Version Reports, Comparison Reports, and Overall Project Summary are updated!${statusNote}`,
        createdEvaluationId: lastRun?.evaluationId,
      };
    }

    if (!parsed.data.modelVersionId) {
      return {
        status: "error",
        message: "Select a model version before running.",
      };
    }

    const run = await runConfiguredEvaluationSuite({
      modelId: parsed.data.modelId,
      modelVersionId: parsed.data.modelVersionId,
      testCaseIds: parsed.data.testCaseIds,
    });

    revalidatePath("/");
    revalidatePath("/memory");
    revalidatePath("/models");
    revalidatePath("/versions");
    revalidatePath("/evaluations");
    revalidatePath("/runs");
    revalidatePath("/tests");
    revalidatePath("/reports");
    revalidatePath("/compare");
    revalidatePath(`/projects/${parsed.data.modelId}`);
    revalidatePath("/", "layout");
    revalidatePath(`/reports/${run.evaluationId}`);
    revalidatePath(`/evaluations/${run.evaluationId}`);

    return {
      status: "success",
      message: `Evaluation ${run.status.toLowerCase()} with ${run.counters.totalTests} tests. Opening the evaluation report.`,
      createdEvaluationId: run.evaluationId,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The automatic evaluation could not run.",
    };
  }
}
