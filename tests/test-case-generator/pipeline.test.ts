import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runTestCaseGeneratorPipeline } from "../../src/lib/test-case-generator/pipeline";
import { parseAndValidateTestCasesCsv } from "../../src/lib/data/test-case-csv";
import { evaluateWithLlmJudge } from "../../src/lib/evaluation/evaluators";
import type { AiCompletionProvider } from "../../src/lib/ai/types";
import type { TestCaseGeneratorRequest } from "../../src/lib/test-case-generator/types";

const request: TestCaseGeneratorRequest = {
  modelContext: "Support assistant: accept refunds within 30 days inclusive; decline later requests; ask for purchase date if missing. Output a short policy explanation.",
  message: "Focus on refund cutoff errors and missing dates.", testCaseCount: 5,
};
const analysis = {
  purpose: "Refund support", tasks: ["Explain refund eligibility"], rules: ["30 days inclusive", "Ask for missing purchase date"],
  inputOutputFormat: "User question -> short policy explanation", requestedFocus: ["Cutoff", "Missing dates"], questions: [],
  scenarioPlan: [
    { objectiveId: "cutoff", testingObjective: "Apply inclusive 30-day cutoff", grounding: "accept refunds within 30 days inclusive", count: 4 },
    { objectiveId: "missing", testingObjective: "Ask for missing purchase date", grounding: "ask for purchase date if missing", count: 1 },
  ],
};
const modelCases = [1, 29, 30, 31].map((day) => ({
  name: `Refund requested on day ${day}`, objectiveId: "cutoff", testingObjective: `Verify ${day <= 30 ? "eligibility" : "rejection"} at day ${day}`,
  prompt: `My order arrived ${day} days ago. Can I get a refund?`, expectedBehavior: day <= 30 ? "Accept under the inclusive 30-day policy." : "Decline because 31 days exceeds the policy window.",
  passCriteria: [day <= 30 ? "States eligibility under the supplied policy" : "States the request exceeds 30 days"],
  failCriteria: [day <= 30 ? "Declines an eligible request" : "Approves outside the policy window"],
  category: "refund_cutoff", difficulty: "medium" as const, tags: ["cutoff"],
}));
const validCases = [...modelCases, {
  ...modelCases[0], name: "Missing purchase date", objectiveId: "missing", testingObjective: "Verify clarification instead of invented eligibility",
  prompt: 'I want to return my "blue coat", but cannot find the receipt date. Can I get a refund?',
  expectedBehavior: "Ask for the purchase date before deciding eligibility.", passCriteria: ["Requests the purchase date"], failCriteria: ["Invents a date or promises a refund"],
}];
function accepted(cases: { testId: string }[]) {
  return { reviews: cases.map((item) => ({ testId: item.testId, accepted: true, reasons: [] })) };
}
const validProvider: AiCompletionProvider = async (completion) => {
  if (completion.schemaName === "modelledger_test_context") return analysis;
  if (completion.schemaName === "modelledger_test_cases") return { cases: validCases };
  return accepted(JSON.parse(completion.user).cases);
};

describe("grounded test case generator", () => {
  it("passes prior clarification questions alongside short user answers", async () => {
    const result = await runTestCaseGeneratorPipeline({ ...request, message: "30 days inclusive", clarificationQuestions: ["What is the refund cutoff?"] }, async (completion) => {
      if (completion.schemaName === "modelledger_test_context") {
        const payload = JSON.parse(completion.user);
        assert.equal(payload.latestMessage, "30 days inclusive");
        assert.deepEqual(payload.clarificationQuestions, ["What is the refund cutoff?"]);
        return analysis;
      }
      return validProvider(completion);
    });
    assert.equal(result.status, "success");
  });
  it("asks targeted questions again after partial clarification even with the legacy bypass flag", async () => {
    let calls = 0;
    const provider: AiCompletionProvider = async (completion) => {
      calls++;
      assert.equal(completion.schemaName, "modelledger_test_context");
      return { ...analysis, questions: ["What is the refund cutoff?", "What output format is required?"], scenarioPlan: [] };
    };
    const first = await runTestCaseGeneratorPipeline({ ...request, modelContext: "", message: "It answers refund questions.", allowMissingContext: false }, provider);
    assert.equal(first.status, "needs_context");
    const second = await runTestCaseGeneratorPipeline({ ...request, modelContext: first.modelContext, message: "Our users are support agents.", allowMissingContext: false }, provider);
    assert.equal(second.status, "needs_context");
    assert.match(second.modelContext, /refund questions/);
    assert.match(second.modelContext, /support agents/);
    assert.equal(calls, 2);
  });
  it("clarifies conflicting supplied rules before generating", async () => {
    const result = await runTestCaseGeneratorPipeline({ ...request, message: "Decline refunds on day 30." }, async (completion) => {
      assert.match(completion.user, /30 days inclusive/);
      assert.match(completion.user, /Decline refunds on day 30/);
      assert.match(completion.system, /unresolved contradictions/);
      return { ...analysis, questions: ["Should day 30 be eligible or declined?"], scenarioPlan: [] };
    });
    assert.equal(result.status, "needs_context");
  });
  it("exports grounded expectations and passes them through to evaluation", async () => {
    const result = await runTestCaseGeneratorPipeline(request, validProvider);
    if (result.status !== "success") throw new Error("Expected success");
    assert.equal(result.cases.length, 5);
    const imported = parseAndValidateTestCasesCsv(result.csv);
    assert.deepEqual(imported.errors, []);
    assert.equal(imported.rows[4].input, validCases[4].prompt);
    assert.equal(imported.rows[0].name, validCases[0].name);
    assert.match(imported.rows[0].expectedOutput, /Expected behavior:.*Pass criteria:.*Fail criteria:/);
    const row = imported.rows[0];
    const evaluated = await evaluateWithLlmJudge({
      ...row, id: "test", stableKey: row.stableKey!, modelId: "model", evaluationCriteria: {},
      evaluatorType: "llm_judge", threshold: 0.75, severity: "MEDIUM", tags: row.tags ?? [],
    }, "Eligible for a refund.", { complete: async (completion) => {
      assert.equal(JSON.parse(completion.user).expectedOutput, row.expectedOutput);
      return { score: 1, reason: "Matches supplied criteria", evidence: {} };
    } });
    assert.equal(evaluated.passed, true);
  });
  for (const reason of ["Invents a 60-day policy", "Paraphrases TC-001 without testing a distinct behavior", "Unrelated to refund focus", "Generic input does not exercise the cutoff", "Missing requested coverage"]) {
    it(`repairs quality issue: ${reason}`, async () => {
      let generations = 0;
      let reviews = 0;
      const result = await runTestCaseGeneratorPipeline(request, async (completion) => {
        if (completion.schemaName === "modelledger_test_context") return analysis;
        const payload = JSON.parse(completion.user);
        if (completion.schemaName === "modelledger_test_cases") {
          generations++;
          if (generations === 1) return { cases: validCases };
          assert.deepEqual(payload.slots, ["TC-002"]);
          assert.equal(payload.retainedCases.length, 4);
          assert.deepEqual(payload.replacementPlan.map((item: { objectiveId: string; count: number }) => [item.objectiveId, item.count]), [["cutoff", 1]]);
          assert.deepEqual(payload.retainedCases[0], { ...validCases[0], testId: "TC-001" });
          assert.match(payload.rejected[0].reasons[0], new RegExp(reason));
          return { cases: [{ ...validCases[1], name: "Reviewed cutoff case" }] };
        }
        reviews++;
        return { reviews: payload.cases.map((item: { testId: string }) => ({
          testId: item.testId, accepted: reviews > 1 || item.testId !== "TC-002", reasons: reviews === 1 && item.testId === "TC-002" ? [reason] : [],
        })) };
      });
      assert.equal(result.status, "success");
      if (result.status !== "success") throw new Error("Expected success");
      assert.equal(result.cases[0].prompt, validCases[0].prompt);
      assert.equal(result.cases[1].name, "Reviewed cutoff case");
      assert.equal(generations, 2);
      assert.equal(reviews, 2);
    });
  }
  it("repairs missing objective coverage even if the reviewer approves", async () => {
    let generations = 0;
    const result = await runTestCaseGeneratorPipeline(request, async (completion) => {
      if (completion.schemaName === "modelledger_test_context") return analysis;
      const payload = JSON.parse(completion.user);
      if (completion.schemaName === "modelledger_test_review") return accepted(payload.cases);
      if (++generations === 1) return { cases: validCases.map((item) => ({ ...item, objectiveId: "cutoff" })) };
      assert.deepEqual(payload.slots, ["TC-005"]);
      return { cases: [validCases[4]] };
    });
    assert.equal(result.status, "success");
  });
  it("rejects weak replacements after exactly one repair", async () => {
    let generations = 0;
    await assert.rejects(runTestCaseGeneratorPipeline(request, async (completion) => {
      if (completion.schemaName === "modelledger_test_context") return analysis;
      if (completion.schemaName === "modelledger_test_cases") { generations++; return { cases: validCases }; }
      return { reviews: JSON.parse(completion.user).cases.map((item: { testId: string }) => ({ testId: item.testId, accepted: false, reasons: ["Invented rules"] })) };
    }), /after one repair.*Invented rules/);
    assert.equal(generations, 2);
  });
  for (const invalid of ["count", "schema", "json"] as const) {
    it(`repairs malformed generation: ${invalid}`, async () => {
      let generations = 0;
      const result = await runTestCaseGeneratorPipeline(request, async (completion) => {
        if (completion.schemaName === "modelledger_test_context") return analysis;
        if (completion.schemaName === "modelledger_test_review") return accepted(JSON.parse(completion.user).cases);
        if (++generations === 1) {
          if (invalid === "json") throw new SyntaxError("Invalid JSON");
          return invalid === "count" ? { cases: validCases.slice(0, 2) } : { cases: [{ prompt: "Incomplete" }] };
        }
        assert.ok(JSON.parse(completion.user).formatFeedback);
        return { cases: validCases };
      });
      assert.equal(result.status, "success");
      assert.equal(generations, 2);
    });
  }
  it("rejects exact duplicates even when the reviewer approves", async () => {
    await assert.rejects(runTestCaseGeneratorPipeline(request, async (completion) => {
      if (completion.schemaName === "modelledger_test_context") return analysis;
      const payload = JSON.parse(completion.user);
      if (completion.schemaName === "modelledger_test_review") return accepted(payload.cases);
      return { cases: payload.slots.map(() => validCases[0]) };
    }), /after one repair/);
  });
  it("does not return a suite after an incomplete quality review", async () => {
    await assert.rejects(runTestCaseGeneratorPipeline(request, async (completion) => {
      if (completion.schemaName === "modelledger_test_review") return { reviews: [{ testId: "TC-001", accepted: true, reasons: [] }] };
      return validProvider(completion);
    }), /review was incomplete/);
  });
  it("rejects invalid coverage analysis", async () => {
    await assert.rejects(runTestCaseGeneratorPipeline(request, async () => ({ ...analysis, scenarioPlan: analysis.scenarioPlan.slice(0, 1) })), /valid coverage plan/);
  });
  it("propagates provider failures without fallback or retries", async () => {
    let calls = 0;
    await assert.rejects(runTestCaseGeneratorPipeline(request, async () => { calls++; throw new Error("Provider status 401"); }), /401/);
    assert.equal(calls, 1);
  });
  it("normalizes multiline CSV fields without losing quoted content", async () => {
    const result = await runTestCaseGeneratorPipeline(request, async (completion) => {
      if (completion.schemaName !== "modelledger_test_cases") return validProvider(completion);
      return { cases: validCases.map((item) => ({ ...item, expectedBehavior: `${item.expectedBehavior}\nUse the "30-day" rule.`, prompt: `${item.prompt}\nPlease explain.` })) };
    });
    if (result.status !== "success") throw new Error("Expected success");
    assert.equal(result.csv.split("\n").length, 6);
    assert.deepEqual(parseAndValidateTestCasesCsv(result.csv).errors, []);
    assert.match(parseAndValidateTestCasesCsv(result.csv).rows[0].expectedOutput, /"30-day"/);
  });
  for (const domain of [
    { name: "Code classifier", rule: "Return JSON with language; unknown for unsupported snippets", inputs: ["print('hello')", "const n = 2;", "SELECT id FROM books;", "fn main() {}", "This is prose"], expectations: ["python", "javascript", "sql", "rust", "unknown"] },
    { name: "Meeting summarizer", rule: "Extract only explicit decisions; return none when absent", inputs: ["Decision: ship Friday.", "Maybe ship Friday? No decision.", "Decision: delay launch until Monday.", "We discussed costs but agreed nothing.", "Decision: retain plan A. Later decision: replace A with B."], expectations: ["Ship Friday", "none", "Delay until Monday", "none", "Replace A with B"] },
  ]) {
    it(`uses supplied ${domain.name} requirements without ecommerce assumptions`, async () => {
      const custom = { ...analysis, purpose: domain.name, rules: [domain.rule], tasks: [domain.name], requestedFocus: ["Accuracy"], scenarioPlan: [{ objectiveId: "accuracy", testingObjective: "Follow supplied output rules", grounding: domain.rule, count: 5 }] };
      const samples = domain.inputs.map((prompt, index) => ({ ...validCases[0], name: `${domain.name} example ${index + 1}`, objectiveId: "accuracy", testingObjective: "Correct extraction under the supplied rule", prompt, expectedBehavior: domain.expectations[index], passCriteria: [`Reports ${domain.expectations[index]}`], failCriteria: ["Invents unsupported output"], category: "accuracy", tags: ["accuracy"] }));
      const result = await runTestCaseGeneratorPipeline({ ...request, modelContext: `${domain.name}. ${domain.rule}.`, message: "Test accuracy." }, async (completion) => {
        assert.doesNotMatch(completion.system, /refund|ecommerce|subscription/i);
        assert.doesNotMatch(completion.user, /refund|ecommerce|subscription/i);
        if (completion.schemaName === "modelledger_test_context") return custom;
        if (completion.schemaName === "modelledger_test_cases") return { cases: samples };
        return accepted(JSON.parse(completion.user).cases);
      });
      assert.equal(result.status, "success");
    });
  }
});
