import type { Tables } from "../../src/types/database";
import { buildEvaluationDataset } from "../../src/lib/evaluation/engine";
import { buildRunReportData } from "../../src/lib/evaluation/report-data";
import type { RunAnalysisInput, RunAiAnalysis } from "../../src/lib/ai/run-analysis";

export function evaluationRow(id: string, versionId: string): Tables<"evaluations"> {
  return { id, model_id: "model", model_version_id: versionId, name: id, evaluated_at: versionId === "v1" ? "2026-01-01T01:00:00Z" : "2026-01-02T01:00:00Z", created_at: "2026-01-01T00:00:00Z", notes: null, status: "COMPLETED", started_at: null, ended_at: null, duration_ms: null, total_tests: null, passed_count: null, failed_count: null, error_count: null, average_score: null, total_input_tokens: null, total_output_tokens: null, total_tokens: null, estimated_cost_usd: null, run_metadata: {} };
}
export function resultRow(id: string, overrides: Partial<Tables<"evaluation_results">> = {}): Tables<"evaluation_results"> {
  return { id, evaluation_id: "current", test_case_id: null, test_name: id, test_key: id, category: "policy", test_input: "Concrete input", expected_result: "Follow supplied policy", actual_result: "Does not follow supplied policy", result: "FAIL", severity: "MEDIUM", evaluator_notes: null, input_snapshot: null, expected_output_snapshot: null, evaluation_criteria_snapshot: null, evaluator_type: "llm_judge", threshold: 0.75, score: 0.2, passed: false, evaluator_reason: "Output violates the supplied rule", evaluator_evidence: { violation: "policy" }, model_latency_ms: 100, input_tokens: null, output_tokens: null, total_tokens: null, estimated_cost_usd: null, provider_status: "SUCCESS", provider_error: null, provider_metadata: null, execution_status: "SUCCESS", evaluator_status: "SUCCESS", created_at: "2026-01-02T01:01:00Z", ...overrides };
}
export function makeRunInput(domain: "refund" | "classifier" | "meeting" = "refund"): RunAnalysisInput {
  const examples = {
    refund: [
      ["Late refund", "I purchased 31 days ago. May I refund?", "Decline: later than 30 days", "Approve the refund"],
      ["Inclusive cutoff", "I purchased exactly 30 days ago. May I refund?", "Accept: day 30 is included", "Decline the refund"],
      ["Missing date", "I want a refund but lost my purchase date", "Ask for purchase date", "Ask for purchase date"],
    ],
    classifier: [
      ["Unsupported code", "fn main() {}", '{"language":"unknown"}', '{"language":"javascript"}'],
      ["Language name in prose", "I heard Python is useful for science", '{"language":"unknown"}', '{"language":"python"}'],
      ["SQL snippet", "SELECT id FROM books;", '{"language":"sql"}', '{"language":"sql"}'],
    ],
    meeting: [
      ["Superseded decision", "Decision: use plan A. Later final decision: replace A with B.", '{"decisions":["Use plan B"]}', '{"decisions":["Use plan A"]}'],
      ["Tentative proposal", "Maybe ship Friday? No decision was made.", '{"decisions":[]}', '{"decisions":["Ship Friday"]}'],
      ["Explicit decision", "Final decision: ship Friday", '{"decisions":["Ship Friday"]}', '{"decisions":["Ship Friday"]}'],
    ],
  }[domain];
  const results = examples.map(([name, prompt, expected, actual], index) => resultRow(["a", "b", "c"][index], { test_name: name, test_input: prompt, expected_result: expected, actual_result: actual, result: index === 2 ? "PASS" : "FAIL", severity: index === 1 ? "CRITICAL" : "MEDIUM", score: index === 2 ? 1 : 0, passed: index === 2, evaluator_reason: index === 2 ? "Matches required output" : `Expected ${expected}; received ${actual}` }));
  const baseline = results.map((row, index) => ({ ...row, id: `previous-${row.id}`, evaluation_id: "baseline", created_at: "2026-01-01T01:01:00Z", result: index === 1 ? "PASS" as const : "FAIL" as const, actual_result: index === 1 ? row.expected_result : "Wrong output", score: index === 1 ? 1 : 0 }));
  const version = { id: "v2", model_id: "model", version: "v2", status: "MONITORING" as const, created_at: "2026-01-02T00:00:00Z" };
  const run = evaluationRow("current", "v2");
  const dataset = buildEvaluationDataset({ versions: [{ ...version, id: "v1", version: "v1", created_at: "2026-01-01T00:00:00Z" }, version], evaluations: [evaluationRow("baseline", "v1"), run], results: [...baseline, ...results] });
  return { model: { name: domain, provider: "Configured provider", purpose: `Correct ${domain} behavior` }, version, report: buildRunReportData({ evaluation: run, results, dataset, configuration: null }), versionChanges: [], memories: [] };
}
export function validRunAnalysis(): RunAiAnalysis {
  return {
    executiveSummary: "The run contains one regression, one persistent failure, and one resolved test. Investigate the critical regression first.",
    findings: [{ title: "Critical behavior regressed", description: "The current output does not match the expected behavior; the comparable baseline passed.", kind: "observation", priority: "HIGH", affectedTestIds: ["b"], evidenceRefs: ["test:b"], testStates: [{ testId: "b", result: "FAIL", classification: "REGRESSION" }] }],
    recommendedActions: [{ title: "Investigate critical regression", action: "Compare the input, expected behavior, actual output, and evaluator evidence of test b against its last passing baseline before editing the prompt.", reason: "Test b failed after a comparable pass.", verification: "Re-run b with the same criteria; verify its expected output and that test a is not worsened.", actionType: "inspect_output", priority: "HIGH", affectedTestIds: ["b"], evidenceRefs: ["test:b"] }],
    confidence: "MEDIUM", limitations: ["No evidence establishes a cause."],
  };
}
