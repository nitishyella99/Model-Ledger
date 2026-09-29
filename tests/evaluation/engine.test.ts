import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeTestResult,
  buildEvaluationDataset,
  compareVersions,
  getStableTestKey,
  type EvaluationDataset,
  type EvaluationResultInput,
  type EvaluationRunInput,
  type VersionOrderInput,
} from "../../src/lib/evaluation/engine";
import {
  getAttentionIssues,
  getVersionSummary,
} from "../../src/lib/evaluation/reporting";
import {
  calculateProjectMetrics,
  calculateRunMetrics,
  calculateVersionMetrics,
} from "../../src/lib/evaluation/metrics";
import { parseAndValidateTestCasesCsv } from "../../src/lib/data/test-case-csv";

const baseDate = Date.UTC(2026, 0, 1);

function version(index: number, label = `v1.${index}`): VersionOrderInput {
  return {
    id: `version-${index}`,
    version: label,
    created_at: new Date(baseDate + index * 86_400_000).toISOString(),
  };
}

function evaluation(index: number): EvaluationRunInput {
  return {
    id: `evaluation-${index}`,
    model_version_id: `version-${index}`,
    evaluated_at: new Date(baseDate + index * 86_400_000 + 1000).toISOString(),
    created_at: new Date(baseDate + index * 86_400_000 + 1000).toISOString(),
  };
}

function result(
  index: number,
  outcome: "PASS" | "FAIL",
  overrides: Partial<EvaluationResultInput> = {},
): EvaluationResultInput {
  return {
    id: `result-${index}`,
    evaluation_id: `evaluation-${index}`,
    test_name: "Refund Policy",
    test_key: "refund-policy",
    category: "policy",
    expected_result: "Expected",
    actual_result: "Actual",
    result: outcome,
    severity: outcome === "FAIL" ? "HIGH" : "LOW",
    created_at: new Date(baseDate + index * 86_400_000 + 2000).toISOString(),
    ...overrides,
  };
}

function datasetFor(outcomes: readonly ("PASS" | "FAIL")[]) {
  return buildEvaluationDataset({
    versions: outcomes.map((_, index) => version(index + 1)),
    evaluations: outcomes.map((_, index) => evaluation(index + 1)),
    results: outcomes.map((outcome, index) => result(index + 1, outcome)),
  });
}

function seededRefundPolicyDataset(): EvaluationDataset {
  const labels = ["v1.2", "v1.3", "v1.4", "v1.5", "v1.6"];
  const outcomes: Array<"PASS" | "FAIL"> = [
    "FAIL",
    "PASS",
    "PASS",
    "PASS",
    "FAIL",
  ];

  return buildEvaluationDataset({
    versions: labels.map((label, index) => version(index + 1, label)),
    evaluations: labels.map((_, index) => evaluation(index + 1)),
    results: outcomes.map((outcome, index) =>
      result(index + 1, outcome, {
        test_key: null,
        test_name: "Refund policy",
        category: "policy",
        severity: outcome === "FAIL" ? "CRITICAL" : "LOW",
      }),
    ),
  });
}

describe("evaluation engine", () => {
  it("classifies FAIL -> PASS -> PASS -> FAIL as a regression", () => {
    const dataset = datasetFor(["FAIL", "PASS", "PASS", "FAIL"]);
    const analysis = analyzeTestResult(dataset, "refund-policy", "version-4");

    assert.equal(analysis.regression.isRegression, true);
    assert.equal(analysis.regression.type, "RETURNED_FAILURE");
    assert.equal(analysis.regression.previousPassingVersion, "v1.3");
    assert.equal(analysis.regression.originalFailureVersion, "v1.1");
    assert.equal(analysis.regression.resolvedVersion, "v1.2");
    assert.equal(analysis.classification, "REGRESSION");
  });

  it("classifies PASS -> PASS -> FAIL as a regression", () => {
    const dataset = datasetFor(["PASS", "PASS", "FAIL"]);
    const analysis = analyzeTestResult(dataset, "refund-policy", "version-3");

    assert.equal(analysis.regression.isRegression, true);
    assert.equal(analysis.regression.previousPassingVersion, "v1.2");
    assert.equal(analysis.classification, "REGRESSION");
  });

  it("classifies FAIL -> FAIL as repeated failure, not regression", () => {
    const dataset = datasetFor(["FAIL", "FAIL"]);
    const analysis = analyzeTestResult(dataset, "refund-policy", "version-2");

    assert.equal(analysis.regression.isRegression, false);
    assert.equal(analysis.regression.type, "REPEATED_FAILURE");
    assert.equal(analysis.repeatedFailure.is_repeated_failure, true);
    assert.deepEqual(analysis.repeatedFailure.previous_failure_versions, [
      "v1.1",
    ]);
    assert.equal(analysis.classification, "REPEATED_FAILURE");
  });

  it("classifies a first FAIL as a new failure", () => {
    const dataset = datasetFor(["FAIL"]);
    const analysis = analyzeTestResult(dataset, "refund-policy", "version-1");

    assert.equal(analysis.regression.isRegression, false);
    assert.equal(analysis.regression.type, "NEW_FAILURE");
    assert.equal(analysis.classification, "NEW_FAILURE");
  });

  it("classifies FAIL -> PASS as resolved", () => {
    const dataset = datasetFor(["FAIL", "PASS"]);
    const analysis = analyzeTestResult(dataset, "refund-policy", "version-2");

    assert.equal(analysis.resolvedIssue.was_previously_failed, true);
    assert.equal(analysis.resolvedIssue.resolved_in_version, "v1.2");
    assert.equal(analysis.classification, "RESOLVED");
  });

  it("classifies PASS -> PASS as stable pass", () => {
    const dataset = datasetFor(["PASS", "PASS"]);
    const analysis = analyzeTestResult(dataset, "refund-policy", "version-2");

    assert.equal(analysis.regression.isRegression, false);
    assert.equal(analysis.classification, "STABLE_PASS");
  });

  it("classifies FAIL -> PASS -> FAIL as a regression", () => {
    const dataset = datasetFor(["FAIL", "PASS", "FAIL"]);
    const analysis = analyzeTestResult(dataset, "refund-policy", "version-3");

    assert.equal(analysis.regression.isRegression, true);
    assert.equal(analysis.regression.previousPassingVersion, "v1.2");
    assert.equal(analysis.regression.originalFailureVersion, "v1.1");
    assert.equal(analysis.regression.resolvedVersion, "v1.2");
    assert.equal(analysis.classification, "REGRESSION");
  });

  it("does not mark a test that appears only in a new version as a regression", () => {
    const dataset = buildEvaluationDataset({
      versions: [version(1), version(2)],
      evaluations: [evaluation(1), evaluation(2)],
      results: [
        result(1, "PASS", {
          test_name: "Refund Policy",
          test_key: "refund-policy",
        }),
        result(2, "FAIL", {
          test_name: "New Policy",
          test_key: "new-policy",
        }),
      ],
    });
    const analysis = analyzeTestResult(dataset, "new-policy", "version-2");
    const comparison = compareVersions(dataset, "version-1", "version-2");

    assert.equal(analysis.regression.isRegression, false);
    assert.equal(analysis.classification, "NEW_FAILURE");
    assert.equal(
      comparison?.transitions.find(
        (transition) => transition.testKey === "new-policy",
      )?.transition,
      "NEW_TEST",
    );
  });

  it("compares versions with pass-to-fail and fail-to-pass transitions", () => {
    const versions = [version(1), version(2)];
    const evaluations = [evaluation(1), evaluation(2)];
    const dataset = buildEvaluationDataset({
      versions,
      evaluations,
      results: [
        result(1, "PASS", {
          id: "refund-v1",
          test_key: "refund-policy",
        }),
        result(2, "FAIL", {
          id: "refund-v2",
          test_key: "refund-policy",
        }),
        result(1, "FAIL", {
          id: "privacy-v1",
          test_name: "Privacy",
          test_key: "privacy",
        }),
        result(2, "PASS", {
          id: "privacy-v2",
          test_name: "Privacy",
          test_key: "privacy",
        }),
      ],
    });
    const comparison = compareVersions(dataset, "version-1", "version-2");

    assert.equal(comparison?.total_matching_tests, 2);
    assert.equal(comparison?.newly_failed_tests, 1);
    assert.equal(comparison?.newly_fixed_tests, 1);
    assert.deepEqual(
      comparison?.transitions.map((transition) => transition.transition).sort(),
      ["FAIL_TO_PASS", "PASS_TO_FAIL"],
    );
  });

  it("handles empty history", () => {
    const dataset = buildEvaluationDataset({
      versions: [],
      evaluations: [],
      results: [],
    });
    const analysis = analyzeTestResult(dataset, "missing-test");

    assert.equal(analysis.current, null);
    assert.deepEqual(analysis.history, []);
    assert.equal(analysis.metrics.total_tests, 0);
    assert.equal(analysis.regression.isRegression, false);
  });

  it("handles missing evaluation data without fabricating history", () => {
    const dataset = buildEvaluationDataset({
      versions: [version(1)],
      evaluations: [],
      results: [result(1, "FAIL")],
    });
    const analysis = analyzeTestResult(dataset, "refund-policy", "version-1");

    assert.equal(dataset.facts.length, 0);
    assert.equal(analysis.current, null);
    assert.equal(analysis.regression.isRegression, false);
    assert.equal(
      dataset.diagnostics.some(
        (diagnostic) => diagnostic.code === "MISSING_EVALUATION",
      ),
      true,
    );
  });

  it("uses the latest duplicate result for a version and records diagnostics", () => {
    const dataset = buildEvaluationDataset({
      versions: [version(1)],
      evaluations: [
        evaluation(1),
        {
          ...evaluation(2),
          id: "evaluation-later",
          model_version_id: "version-1",
          evaluated_at: new Date(baseDate + 86_400_000 + 999_000).toISOString(),
        },
      ],
      results: [
        result(1, "FAIL", {
          id: "older-result",
          evaluation_id: "evaluation-1",
          created_at: new Date(baseDate + 1000).toISOString(),
        }),
        result(1, "PASS", {
          id: "newer-result",
          evaluation_id: "evaluation-later",
          created_at: new Date(baseDate + 999_000).toISOString(),
        }),
      ],
    });
    const analysis = analyzeTestResult(dataset, "refund-policy", "version-1");

    assert.equal(analysis.current?.id, "newer-result");
    assert.equal(analysis.current?.result, "PASS");
    assert.equal(
      dataset.diagnostics.some(
        (diagnostic) => diagnostic.code === "DUPLICATE_TEST_RESULT",
      ),
      true,
    );
  });

  it("prefers latest evaluated duplicate result over later-created stale result", () => {
    const dataset = buildEvaluationDataset({
      versions: [version(1)],
      evaluations: [
        {
          ...evaluation(1),
          id: "evaluation-earlier",
          evaluated_at: new Date(baseDate + 1000).toISOString(),
        },
        {
          ...evaluation(1),
          id: "evaluation-later",
          evaluated_at: new Date(baseDate + 2000).toISOString(),
        },
      ],
      results: [
        result(1, "FAIL", {
          id: "created-later-but-evaluated-earlier",
          evaluation_id: "evaluation-earlier",
          created_at: new Date(baseDate + 5000).toISOString(),
        }),
        result(1, "PASS", {
          id: "evaluated-later",
          evaluation_id: "evaluation-later",
          created_at: new Date(baseDate + 3000).toISOString(),
        }),
      ],
    });
    const analysis = analyzeTestResult(dataset, "refund-policy", "version-1");

    assert.equal(analysis.current?.id, "evaluated-later");
    assert.equal(analysis.current?.result, "PASS");
  });

  it("validates seeded v1.2 to v1.6 Refund policy regression", () => {
    const dataset = seededRefundPolicyDataset();
    const testKey = getStableTestKey({
      test_key: null,
      category: "policy",
      test_name: "Refund policy",
    });
    const analysis = analyzeTestResult(dataset, testKey, "version-5");
    const currentVersionSummary = getVersionSummary(dataset, "version-5");
    const comparison = compareVersions(dataset, "version-4", "version-5");
    const attentionIssues = getAttentionIssues(dataset, "version-5");

    assert.equal(analysis.current?.version, "v1.6");
    assert.equal(analysis.current?.result, "FAIL");
    assert.equal(analysis.classification, "REGRESSION");
    assert.equal(analysis.regression.isRegression, true);
    assert.equal(analysis.regression.previousPassingVersion, "v1.5");
    assert.equal(analysis.regression.originalFailureVersion, "v1.2");
    assert.equal(analysis.regression.resolvedVersion, "v1.3");
    assert.deepEqual(
      analysis.history.map((fact) => `${fact.version}:${fact.result}`),
      ["v1.2:FAIL", "v1.3:PASS", "v1.4:PASS", "v1.5:PASS", "v1.6:FAIL"],
    );
    assert.equal(currentVersionSummary.regressionCount, 1);
    assert.equal(comparison?.newly_failed_tests, 1);
    assert.equal(comparison?.transitions[0]?.transition, "PASS_TO_FAIL");
    assert.equal(attentionIssues[0]?.priority, "HIGH_REGRESSION");
  });

  it("calculates same-version run metrics from only the selected run results", () => {
    const dataset = buildEvaluationDataset({
      versions: [version(1)],
      evaluations: [
        evaluation(1),
        {
          ...evaluation(1),
          id: "evaluation-2",
          evaluated_at: new Date(baseDate + 2000).toISOString(),
          created_at: new Date(baseDate + 2000).toISOString(),
        },
      ],
      results: [
        result(1, "PASS", {
          id: "result-run-1",
          evaluation_id: "evaluation-1",
          test_key: "invoice-total",
          test_name: "Invoice Total",
          category: "finance",
          score: 1,
        }),
        result(1, "FAIL", {
          id: "result-run-2",
          evaluation_id: "evaluation-2",
          test_key: "invoice-total",
          test_name: "Invoice Total",
          category: "finance",
          score: 0.2,
        }),
      ],
    });

    const runOne = calculateRunMetrics(
      "evaluation-1",
      [
        {
          id: "result-run-1",
          evaluation_id: "evaluation-1",
          result: "PASS",
          severity: "LOW",
          score: 1,
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
          estimated_cost_usd: 0.00003,
        },
        {
          id: "result-run-2",
          evaluation_id: "evaluation-2",
          result: "FAIL",
          severity: "HIGH",
          score: 0.2,
          input_tokens: 20,
          output_tokens: 8,
          total_tokens: 28,
          estimated_cost_usd: 0.00005,
        },
      ],
      dataset,
    );

    assert.equal(runOne.total_tests, 1);
    assert.equal(runOne.passed_tests, 1);
    assert.equal(runOne.failed_tests, 0);
    assert.equal(runOne.pass_rate, 1);
    assert.equal(runOne.average_score, 1);
    assert.equal(runOne.telemetry.total_tokens, 15);
    assert.equal(runOne.telemetry.estimated_cost_usd, 0.00003);
  });

  it("keeps project and latest-version aggregation scoped to latest stored facts", () => {
    const dataset = buildEvaluationDataset({
      versions: [version(1), version(2)],
      evaluations: [
        evaluation(1),
        {
          ...evaluation(1),
          id: "evaluation-1b",
          evaluated_at: new Date(baseDate + 86_400_000 + 3_000).toISOString(),
          created_at: new Date(baseDate + 86_400_000 + 3_000).toISOString(),
        },
        evaluation(2),
      ],
      results: [
        result(1, "FAIL", {
          id: "stale-v1-fail",
          evaluation_id: "evaluation-1",
          test_key: "privacy",
          test_name: "Privacy",
        }),
        result(1, "PASS", {
          id: "latest-v1-pass",
          evaluation_id: "evaluation-1b",
          test_key: "privacy",
          test_name: "Privacy",
          created_at: new Date(baseDate + 86_400_000 + 4_000).toISOString(),
        }),
        result(2, "FAIL", {
          id: "latest-v2-fail",
          evaluation_id: "evaluation-2",
          test_key: "refund",
          test_name: "Refund",
        }),
      ],
    });

    const versionOne = calculateVersionMetrics(dataset, "version-1");
    const project = calculateProjectMetrics(dataset);

    assert.equal(versionOne.total_tests, 1);
    assert.equal(versionOne.passed_tests, 1);
    assert.equal(versionOne.failed_tests, 0);
    assert.equal(project.total_tests, 2);
    assert.equal(project.passed_tests, 1);
    assert.equal(project.failed_tests, 1);
  });

  it("calculates comparison counts and score deltas for non-consecutive versions", () => {
    const dataset = buildEvaluationDataset({
      versions: [version(1), version(2), version(3)],
      evaluations: [evaluation(1), evaluation(2), evaluation(3)],
      results: [
        result(1, "PASS", {
          id: "refund-v1",
          test_key: "refund",
          score: 0.9,
        }),
        result(3, "FAIL", {
          id: "refund-v3",
          evaluation_id: "evaluation-3",
          test_key: "refund",
          score: 0.4,
        }),
        result(1, "FAIL", {
          id: "billing-v1",
          test_key: "billing",
          test_name: "Billing",
          score: 0.2,
        }),
        result(3, "PASS", {
          id: "billing-v3",
          evaluation_id: "evaluation-3",
          test_key: "billing",
          test_name: "Billing",
          score: 0.8,
        }),
      ],
    });
    const comparison = compareVersions(dataset, "version-1", "version-3");

    assert.equal(comparison?.newly_failed_tests, 1);
    assert.equal(comparison?.newly_fixed_tests, 1);
    assert.equal(
      comparison?.transitions.find((entry) => entry.testKey === "refund")
        ?.scoreDelta,
      -0.5,
    );
    assert.equal(
      comparison?.transitions.find((entry) => entry.testKey === "billing")
        ?.scoreDelta,
      0.6,
    );
  });

  it("reports missing telemetry as unavailable instead of fabricated zeroes", () => {
    const dataset = datasetFor(["PASS"]);
    const metrics = calculateRunMetrics(
      "evaluation-1",
      [
        {
          id: "result-1",
          evaluation_id: "evaluation-1",
          result: "PASS",
          severity: "LOW",
          score: 1,
          model_latency_ms: null,
          input_tokens: null,
          output_tokens: null,
          total_tokens: null,
          estimated_cost_usd: null,
        },
      ],
      dataset,
    );

    assert.equal(metrics.telemetry.average_latency_ms, null);
    assert.equal(metrics.telemetry.total_tokens, null);
    assert.equal(metrics.telemetry.estimated_cost_usd, null);
  });

  it("validates CSV test imports with row and field errors", () => {
    const parsed = parseAndValidateTestCasesCsv(
      [
        "stable_key,name,category,input,expected_output,evaluator_type,threshold,severity,tags",
        'acct-login,Account Login,auth,"Can the user log in?","Allow login",contains,0.75,HIGH,auth;login',
        'bad-row,,auth,"Missing a name","Expected",nonsense,1.5,URGENT,bad',
      ].join("\n"),
    );

    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.errors.some((error) => error.row === 3 && error.field === "name"), true);
    assert.equal(
      parsed.errors.some(
        (error) => error.row === 3 && error.field === "evaluator_type",
      ),
      true,
    );
    assert.equal(
      parsed.errors.some((error) => error.row === 3 && error.field === "threshold"),
      true,
    );
    assert.equal(
      parsed.errors.some((error) => error.row === 3 && error.field === "severity"),
      true,
    );
  });

  it("rejects empty and unsupported CSV schemas", () => {
    const empty = parseAndValidateTestCasesCsv("");
    const unsupported = parseAndValidateTestCasesCsv(
      "name,category,input,expected_output,magic_score\nA,B,C,D,99",
    );

    assert.equal(empty.errors[0]?.field, "header");
    assert.equal(
      unsupported.errors.some((error) => error.field === "magic_score"),
      true,
    );
  });
});
