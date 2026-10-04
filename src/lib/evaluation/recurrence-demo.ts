import type { Tables } from "../../types/database";
import { buildEvaluationDataset } from "./engine";
import { buildFailureRecurrences } from "./recurrence";
import type { VersionChangeInput } from "./types";

/** Synthetic, repeatable acceptance data. Never persisted or represented as live runs. */
export function buildRecurrenceDemo() {
  const versions = [3, 4, 7].map((n) => ({ id: `sample-v${n}`, version: `v${n}`, created_at: `2026-01-0${n}T00:00:00Z` }));
  const evaluations: Tables<"evaluations">[] = versions.map((version) => ({
    id: `sample-run-${version.version}`, model_id: "sample-refund", model_version_id: version.id,
    name: `Refund policy ${version.version}`, evaluated_at: `2026-01-0${version.version.slice(1)}T01:00:00Z`,
    created_at: version.created_at, notes: "Synthetic acceptance demo", status: "COMPLETED",
    started_at: null, ended_at: null, duration_ms: null, total_tests: 3, passed_count: version.version === "v4" ? 3 : 1,
    failed_count: version.version === "v4" ? 0 : 2, error_count: 0, average_score: null,
    total_input_tokens: null, total_output_tokens: null, total_tokens: null, estimated_cost_usd: null,
    run_metadata: { mode: "synthetic-demo" },
  }));
  const cases = [
    { key: "late-refund", name: "Refund after the window", input: "I purchased 31 days ago. Can I get a refund?", expected: "Decline: the refund window is 30 days.", wrong: "Approve the refund." },
    { key: "missing-date", name: "Refund without a purchase date", input: "I want a refund but do not know my purchase date.", expected: "Ask for the purchase date before deciding.", wrong: "Approve the refund." },
    { key: "within-window", name: "Refund within the window", input: "I purchased 10 days ago. Can I get a refund?", expected: "Approve the refund.", wrong: "Approve the refund." },
  ];
  const results: Tables<"evaluation_results">[] = evaluations.flatMap((run) => cases.map((item) => {
    const pass = run.model_version_id === "sample-v4" || item.key === "within-window";
    return {
      id: `${run.id}-${item.key}`, evaluation_id: run.id, test_case_id: null, test_name: item.name,
      test_key: item.key, category: "Refund policy", test_input: item.input, expected_result: item.expected,
      actual_result: pass ? item.expected : item.wrong, result: pass ? "PASS" : "FAIL", severity: "HIGH",
      evaluator_notes: null, input_snapshot: item.input, expected_output_snapshot: item.expected,
      evaluation_criteria_snapshot: {}, evaluator_type: "exact_match", threshold: 1, score: pass ? 1 : 0,
      passed: pass, evaluator_reason: pass ? "Output matches the recorded expected answer." : "Output approves a refund without satisfying the recorded requirement.",
      evaluator_evidence: { expected: item.expected, actual: pass ? item.expected : item.wrong },
      model_latency_ms: null, input_tokens: null, output_tokens: null, total_tokens: null,
      estimated_cost_usd: null, provider_status: "SUCCESS", provider_error: null, provider_metadata: null,
      execution_status: "SUCCESS", evaluator_status: "SUCCESS", created_at: run.evaluated_at,
    };
  }));
  const versionChanges: VersionChangeInput[] = [
    { id: "sample-change-v4", model_version_id: "sample-v4", change_type: "SYSTEM_PROMPT", field_name: "system_prompt", previous_value: "Be helpful with refund requests.", new_value: "Refunds require a purchase date and must be within 30 days. Ask for missing dates; decline requests outside the window.", description: "Added explicit refund eligibility and missing-date instructions.", created_at: "2026-01-04T00:01:00Z" },
    { id: "sample-change-v7", model_version_id: "sample-v7", change_type: "SYSTEM_PROMPT", field_name: "system_prompt", previous_value: "Refunds require a purchase date and must be within 30 days. Ask for missing dates; decline requests outside the window.", new_value: "Prioritize customer satisfaction. Be helpful with refund requests.", description: "Replaced explicit eligibility instructions with a general satisfaction instruction.", created_at: "2026-01-07T00:01:00Z" },
  ];
  const dataset = buildEvaluationDataset({ versions, evaluations, results });
  return { dataset, evaluations, results, versionChanges, recurrences: buildFailureRecurrences({ dataset, evaluationId: "sample-run-v7", results, versionChanges }) };
}
