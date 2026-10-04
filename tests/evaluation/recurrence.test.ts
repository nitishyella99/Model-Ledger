import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEvaluationDataset } from "../../src/lib/evaluation/engine";
import { buildFailureRecurrences } from "../../src/lib/evaluation/recurrence";
import { selectRerunTests } from "../../src/lib/evaluation/rerun-selection";
import { evaluationRow, resultRow } from "../ai/run-report-fixtures";
import type { VersionChangeInput } from "../../src/lib/evaluation/types";

function scenario() {
  const versions = [3, 4, 7].map((n) => ({ id: `v${n}`, version: `v${n}`, created_at: `2026-01-0${n}T00:00:00Z` }));
  const evaluations = versions.map((v) => ({ ...evaluationRow(`run-${v.id}`, v.id), evaluated_at: `2026-01-0${v.id.slice(1)}T01:00:00Z` }));
  const results = versions.flatMap((v) => ["late-refund", "cutoff"].map((key) => resultRow(`${v.id}-${key}`, {
    evaluation_id: `run-${v.id}`, test_key: key, test_name: key, input_snapshot: `Input ${key}`,
    expected_output_snapshot: "Decline", evaluation_criteria_snapshot: {}, evaluator_type: "exact_match", threshold: 1,
    result: v.id === "v4" ? "PASS" : "FAIL", actual_result: v.id === "v4" ? "Decline" : "Approve",
    created_at: `2026-01-0${v.id.slice(1)}T01:01:00Z`,
  })));
  const versionChanges: VersionChangeInput[] = [4, 7].map((n) => ({ id: `change-${n}`, model_version_id: `v${n}`, change_type: "SYSTEM_PROMPT", field_name: "system_prompt", previous_value: n === 4 ? "Approve refunds" : "Decline refunds after day 30", new_value: n === 4 ? "Decline refunds after day 30" : "Prioritize customer satisfaction", description: "Updated refund instructions", created_at: `2026-01-0${n}T00:01:00Z` }));
  const build = () => buildFailureRecurrences({ dataset: buildEvaluationDataset({ versions, evaluations, results }), evaluationId: "run-v7", results, versionChanges });
  return { versions, evaluations, results, versionChanges, build };
}

test("acceptance: v3 failure, v4 pass, v7 recurrence includes evidence, changes and isolated rerun plan", () => {
  const stories = scenario().build();
  assert.equal(stories.length, 2);
  for (const story of stories) {
    assert.equal(story.previousFailure.version, "v3");
    assert.equal(story.firstPassing.version, "v4");
    assert.equal(story.current.version, "v7");
    assert.equal(story.previousFailure.actualResult, "Approve");
    assert.equal(story.firstPassing.actualResult, "Decline");
    assert.equal(story.passingChanges[0].id, "change-4");
    assert.equal(story.recurrenceChanges[0].previous_value, "Decline refunds after day 30");
    assert.match(story.verification, /one suspected configuration change at a time/);
    assert.match(story.verification, /later PASS alone does not confirm a cause/);
  }
});

test("changed input, expected output, evaluator, threshold, or criteria cannot establish recurrence", () => {
  for (const patch of [{ input_snapshot: "Changed" }, { expected_output_snapshot: "Changed" }, { evaluator_type: "llm_judge" }, { threshold: 0.5 }, { evaluation_criteria_snapshot: { new: true } }]) {
    const s = scenario();
    Object.assign(s.results[2], patch);
    assert.equal(s.build().some((story) => story.testKey === "late-refund"), false);
  }
});

test("provider/evaluator errors and legacy snapshots cannot supply historical proof", () => {
  for (const patch of [{ execution_status: "TIMEOUT" }, { evaluator_status: "ERROR" }, { input_snapshot: null }, { evaluation_criteria_snapshot: null }, { test_key: null }]) {
    const s = scenario();
    Object.assign(s.results[0], patch);
    assert.equal(s.build().some((story) => story.testKey === "late-refund"), false);
  }
});

test("future runs and future change records are excluded", () => {
  const s = scenario();
  s.versionChanges.push({ ...s.versionChanges[1], id: "future", created_at: "2026-01-08T00:00:00Z" });
  assert.equal(s.build()[0].recurrenceChanges.length, 1);
  s.evaluations[1].evaluated_at = "2026-01-08T01:00:00Z";
  assert.equal(s.build().length, 0);
});

test("no recorded changes leaves the contributor unknown", () => {
  const s = scenario();
  s.versionChanges.splice(0);
  assert.match(s.build()[0].verification, /No current configuration change is recorded/);
});

test("rerun selects only the requested identity and prefers the target version's case", () => {
  const base = { modelId: "project", modelVersionId: null, stableKey: "late-refund" };
  const tests = [{ ...base, id: "shared" }, { ...base, id: "v7", modelVersionId: "v7" }, { ...base, id: "v4", modelVersionId: "v4" }, { ...base, id: "other-project", modelId: "other" }, { ...base, id: "unrelated", stableKey: "other" }];
  assert.deepEqual(selectRerunTests(tests, "project", "v7", ["late-refund"]), ["v7"]);
  assert.deepEqual(selectRerunTests(tests, "project", "v7", ["missing"]), []);
});
