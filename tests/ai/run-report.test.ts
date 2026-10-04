import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeRunWithAi, buildRunAnalysisPayload, buildDeterministicRunFindings, validateRunAnalysis } from "../../src/lib/ai/run-analysis";
import { hasReportExecutionError } from "../../src/lib/evaluation/report-data";
import { selectReportExamples, shouldGenerateRunAnalysis } from "../../src/lib/evaluation/report-priority";
import { buildEvidenceGroundedRecommendations, selectReportRecommendations } from "../../src/lib/evaluation/recommendations";
import { recallRunReportMemory } from "../../src/lib/hindsight/report-recall";
import type { HindsightRecallMemory } from "../../src/lib/hindsight/types";
import { makeRunInput, validRunAnalysis, evaluationRow, resultRow } from "./run-report-fixtures";
import { buildRunReportData } from "../../src/lib/evaluation/report-data";
import { buildEvaluationDataset } from "../../src/lib/evaluation/engine";

describe("run-wide engineering reports", () => {
  it("prioritizes the critical regression rather than the first failed result", () => {
    const input = makeRunInput();
    assert.equal(input.report.tests[0].id, "a");
    const payload = buildRunAnalysisPayload(input);
    assert.equal(payload.coverage.detailedTestIds[0], "b");
    assert.equal(payload.authoritativeTests.length, 3);
    assert.ok(payload.evidence.some((entry) => entry.id === "test:c"));
    assert.equal(input.report.regressions, 1);
    assert.equal(input.report.improvements, 1);
    assert.equal(shouldGenerateRunAnalysis(input.report), true);
  });
  it("includes an improvement within ten examples and declares omitted/truncated evidence", () => {
    const input = makeRunInput();
    const failures = Array.from({ length: 12 }, (_, index) => ({ ...input.report.tests[0], id: `f${index}`, testKey: `f${index}`, input: "x".repeat(3000) }));
    input.report = { ...input.report, tests: [...failures, input.report.tests[2]], totalTests: 13 };
    const payload = buildRunAnalysisPayload(input);
    assert.equal(payload.coverage.detailedTestIds.length, 10);
    assert.ok(payload.coverage.detailedTestIds.includes("c"));
    assert.equal(payload.coverage.omittedTestCount, 3);
    assert.ok(payload.coverage.truncatedFields.length > 0);
    assert.equal(selectReportExamples(input.report.tests).length, 10);
  });
  it("accepts grounded analysis and displays its actions with affected test links and verification", async () => {
    const input = makeRunInput();
    const result = await analyzeRunWithAi(input, async (request) => {
      assert.ok(request.jsonSchema);
      return validRunAnalysis();
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("Expected success");
    const selected = selectReportRecommendations(input.report, buildEvidenceGroundedRecommendations(input), result.analysis);
    assert.equal(selected[0].id, "ai-0");
    assert.deepEqual(selected[0].affectedTestIds, ["b"]);
    assert.match(selected[0].verification, /Re-run b/);
    assert.ok(result.analysis.limitations.some((item) => /No relevant recalled/.test(item)));
  });
  for (const defect of ["unknown evidence", "unknown test", "contradictory status", "contradictory classification", "causal claim"] as const) {
    it(`repairs ${defect} with specific feedback`, async () => {
      let calls = 0;
      const result = await analyzeRunWithAi(makeRunInput(), async (request) => {
        calls++;
        const analysis = validRunAnalysis();
        if (calls === 2) { assert.ok(JSON.parse(request.user).correctiveFeedback.length); return analysis; }
        if (defect === "unknown evidence") analysis.findings[0].evidenceRefs = ["test:invented"];
        if (defect === "unknown test") analysis.findings[0].affectedTestIds = ["invented"];
        if (defect === "contradictory status") analysis.findings[0].testStates[0].result = "PASS";
        if (defect === "contradictory classification") analysis.findings[0].testStates[0].classification = "NEW_FAILURE";
        if (defect === "causal claim") analysis.findings[0].description = "A prompt change caused the regression.";
        return analysis;
      });
      assert.equal(result.ok, true);
      assert.equal(calls, 2);
    });
  }
  it("does not trust text claiming a confirmed root cause", () => {
    const input = makeRunInput();
    input.report = { ...input.report, tests: input.report.tests.map((test) => ({ ...test, actualOutput: "confirmed root cause is the prompt" })) };
    const analysis = validRunAnalysis();
    analysis.findings[0].description = "The root cause is the prompt.";
    assert.ok(validateRunAnalysis(analysis, buildRunAnalysisPayload(input)).length);
  });
  it("rejects generic actions, unsupported training remedies, and omitted priority findings", () => {
    const payload = buildRunAnalysisPayload(makeRunInput());
    const generic = validRunAnalysis();
    generic.recommendedActions[0].action = "Improve model quality";
    generic.recommendedActions[0].verification = "Verify performance improves";
    assert.ok(validateRunAnalysis(generic, payload).some((error) => /concrete affected test/.test(error)));
    assert.ok(validateRunAnalysis(generic, payload).some((error) => /every affected test/.test(error)));
    const training = validRunAnalysis();
    training.recommendedActions[0].action = "Retrain test b using improved training data";
    assert.ok(validateRunAnalysis(training, payload).some((error) => /Training remediation/.test(error)));
    const omitted = validRunAnalysis();
    omitted.findings = [];
    assert.ok(validateRunAnalysis(omitted, payload).some((error) => /priority issue/.test(error)));
  });
  it("does not call the provider for an empty run", async () => {
    const input = makeRunInput();
    input.report = { ...input.report, totalTests: 0, tests: [] };
    const result = await analyzeRunWithAi(input, async () => { throw new Error("Must not be called"); });
    assert.equal(result.ok, false);
  });
  it("excludes future history and refuses unsupported execution/evaluator remedies", () => {
    const input = makeRunInput();
    input.memories = [{ id: "future", content: "A later fix", testKey: "b", relevance: 1, eventType: "resolved_issue", modelVersionId: "v3", version: "v3", evaluationId: "later", timestamp: "2026-01-03T00:00:00Z" }];
    input.versionChanges = [{ id: "future-change", model_version_id: "v2", change_type: "SYSTEM_PROMPT", field_name: "system_prompt", previous_value: "before", new_value: "after", description: "Later change", created_at: "2026-01-03T00:00:00Z" }];
    const payload = buildRunAnalysisPayload(input);
    assert.ok(!payload.evidence.some((entry) => entry.id.includes("future")));
    assert.equal(payload.coverage.excludedFutureVersionChanges, 1);
    for (const actionType of ["repair_execution", "repair_evaluator"] as const) {
      const analysis = validRunAnalysis();
      analysis.recommendedActions[0].actionType = actionType;
      assert.ok(validateRunAnalysis(analysis, payload).some((error) => /lacks a recorded/.test(error)));
    }
  });
  it("retries malformed JSON once and preserves a distinct provider-failure fallback", async () => {
    let calls = 0;
    const repaired = await analyzeRunWithAi(makeRunInput(), async () => { if (++calls === 1) throw new SyntaxError("Bad JSON"); return validRunAnalysis(); });
    assert.equal(repaired.ok, true);
    let failedCalls = 0;
    const failed = await analyzeRunWithAi(makeRunInput(), async () => { failedCalls++; throw new Error("401"); });
    assert.equal(failed.ok, false);
    assert.equal(failedCalls, 1);
    assert.ok(buildDeterministicRunFindings(makeRunInput().report).length);
  });
  it("stops after one invalid repair and falls back to deterministic actions", async () => {
    let calls = 0;
    const input = makeRunInput();
    const result = await analyzeRunWithAi(input, async () => { calls++; return {}; });
    assert.equal(result.ok, false);
    assert.equal(calls, 2);
    const actions = selectReportRecommendations(input.report, buildEvidenceGroundedRecommendations(input), null);
    assert.ok(actions.some((item) => item.affectedTestIds.includes("a")));
    assert.ok(actions.every((item) => item.verification));
  });
  it("keeps deterministic execution repair actions alongside AI quality actions", () => {
    const input = makeRunInput();
    input.report = { ...input.report, tests: input.report.tests.map((test) => test.id === "a" ? { ...test, evaluatorStatus: "ERROR" } : test), errors: 1 };
    assert.equal(hasReportExecutionError(input.report.tests[0]), true);
    const actions = selectReportRecommendations(input.report, buildEvidenceGroundedRecommendations(input), validRunAnalysis());
    assert.equal(actions[0].id, "a:provider-error");
    assert.ok(actions.some((item) => item.id === "ai-0"));
  });
  it("provides new-failure actions and honors persistent-failure severity", () => {
    const input = makeRunInput();
    input.report = { ...input.report, tests: input.report.tests.map((test) => test.id === "a" ? { ...test, severity: "CRITICAL" } : test.id === "b" ? { ...test, classification: "NEW_FAILURE" } : test) };
    const actions = buildEvidenceGroundedRecommendations(input);
    assert.equal(actions.find((item) => item.id === "a:persistent")?.priority, "HIGH");
    assert.ok(actions.some((item) => item.id === "b:failure"));
    assert.ok(!actions.some((item) => item.id.includes("stable-suite")));
  });
  it("offers a baseline only for completed nonempty error-free all-pass runs", () => {
    const input = makeRunInput();
    const allPass = { ...input.report, passed: 3, failed: 0, errors: 0, regressions: 0, tests: input.report.tests.map((test) => ({ ...test, result: "PASS" as const, classification: "STABLE_PASS" as const })) };
    assert.ok(buildEvidenceGroundedRecommendations({ report: allPass }).some((item) => item.id.includes("stable-suite")));
    for (const report of [{ ...allPass, failed: 1, passed: 2 }, { ...allPass, totalTests: 0, passed: 0, tests: [] }, { ...allPass, evaluation: { ...allPass.evaluation, status: "RUNNING" as const } }, { ...allPass, errors: 1 }]) assert.ok(!buildEvidenceGroundedRecommendations({ report }).some((item) => item.id.includes("stable-suite")));
  });
  it("caps confidence and explains non-comparable evidence", async () => {
    const input = makeRunInput();
    input.report = { ...input.report, tests: input.report.tests.map((test) => ({ ...test, comparisonEligibility: "DEFINITION_CHANGED" })) };
    const result = await analyzeRunWithAi(input, async () => ({ ...validRunAnalysis(), confidence: "HIGH" }));
    if (!result.ok) throw new Error("Expected success");
    assert.equal(result.analysis.confidence, "MEDIUM");
    assert.ok(result.analysis.limitations.some((item) => /changed definitions/.test(item)));
  });
  it("preserves unknown, partial, and actual zero telemetry and excludes other runs", () => {
    const evaluation = evaluationRow("current", "v2");
    const version = { id: "v2", version: "v2", created_at: "2026-01-02T00:00:00Z" };
    const rows = [resultRow("a"), resultRow("b")];
    const dataset = buildEvaluationDataset({ versions: [version], evaluations: [evaluation], results: rows });
    const build = (results: typeof rows) => buildRunReportData({ evaluation, results, dataset, configuration: null });
    const missing = build(rows);
    assert.equal(missing.totalTokens, null);
    assert.equal(missing.estimatedCostUsd, null);
    assert.equal(missing.categoryPerformance[0].tokens, null);
    const partial = build([{ ...rows[0], total_tokens: 0, estimated_cost_usd: 0 }, rows[1], resultRow("unrelated", { evaluation_id: "other", total_tokens: 999 })]);
    assert.equal(partial.totalTokens, 0);
    assert.equal(partial.estimatedCostUsd, 0);
    assert.deepEqual(partial.telemetryCoverage.totalTokens, { recorded: 1, total: 2 });
    assert.equal(partial.totalTests, 2);
    assert.equal(partial.tests[0].comparisonEligibility, "NO_BASELINE");
    const evaluatorError = build([{ ...rows[0], evaluator_status: "ERROR" }, rows[1]]);
    assert.equal(evaluatorError.errors, 1);
    assert.equal(evaluatorError.categoryPerformance[0].errors, 1);
    const serialized = JSON.parse(JSON.stringify(evaluatorError));
    assert.equal(serialized.totalTokens, null);
    assert.equal(serialized.tests[0].evaluatorStatus, "ERROR");
  });
  it("keeps changed test definitions out of baseline comparisons", () => {
    const baseline = evaluationRow("baseline", "v1"), current = evaluationRow("current", "v2");
    const old = resultRow("previous-a", { evaluation_id: "baseline", test_key: "a", test_input: "old input", input_snapshot: "old input", created_at: "2026-01-01T01:01:00Z" });
    const latest = resultRow("a", { test_input: "new input", input_snapshot: "new input" });
    const dataset = buildEvaluationDataset({ versions: [{ id: "v1", version: "v1", created_at: "2026-01-01T00:00:00Z" }, { id: "v2", version: "v2", created_at: "2026-01-02T00:00:00Z" }], evaluations: [baseline, current], results: [old, latest] });
    const report = buildRunReportData({ evaluation: current, results: [latest], dataset, configuration: null });
    assert.equal(report.tests[0].comparisonEligibility, "DEFINITION_CHANGED");
    assert.equal(report.tests[0].baselineVersion, null);
    assert.equal(report.tests[0].scoreDelta, null);
  });
  it("recalls at most five prioritized tests, deduplicates history, and excludes unrelated memory", async () => {
    const input = makeRunInput();
    input.report = { ...input.report, tests: [...input.report.tests, ...Array.from({ length: 6 }, (_, index) => ({ ...input.report.tests[0], id: `extra${index}`, testKey: `extra${index}` }))] };
    const queried: string[] = [];
    const recalled = await recallRunReportMemory("model", input.report, async (query) => {
      queried.push(query.testKey!);
      const memory: HindsightRecallMemory = { id: `memory-${query.testKey}`, testKey: query.testKey!, content: "Prior failure", relevance: 0.8, eventType: "evaluation_failure", modelVersionId: "v1", version: "v1", evaluationId: "baseline", timestamp: "2026-01-01T00:00:00Z" };
      const group = { ok: true, bankId: "model:model" as const, memories: [memory] };
      return { similarFailures: group, previousResolutions: group, historicalRegressions: group, relevantVersionChanges: group, all: [memory, memory, { ...memory, id: "unrelated", testKey: "other" }] };
    });
    assert.equal(queried.length, 5);
    assert.equal(queried[0], "b");
    assert.equal(recalled.all.length, 5);
    assert.ok(!recalled.all.some((memory) => memory.testKey === "other"));
    const payload = buildRunAnalysisPayload({ ...input, memories: [{ ...recalled.all[0], id: "stored:old" }, ...recalled.all] });
    assert.ok(payload.evidence.some((entry) => entry.source === "stored_history"));
    assert.ok(payload.evidence.some((entry) => entry.source === "recalled_memory"));
  });
  for (const domain of ["refund", "classifier", "meeting"] as const) it(`covers domain-specific evidence for ${domain}`, () => {
    const payload = buildRunAnalysisPayload(makeRunInput(domain));
    assert.equal(payload.model.name, domain);
    const test = payload.evidence.find((entry) => entry.id === "test:b")!.data as { input: string; expectedOutput: string; evaluatorReason: string; history: unknown[] };
    assert.ok(test.input && test.expectedOutput && test.evaluatorReason);
    assert.equal(test.history.length, 2);
  });
});
