import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const compiled = (path) => require(resolve(root, ".evaluation-test-dist", path));
function loadTs(path, aliases = {}) {
  const absolute = resolve(root, path);
  const localRequire = createRequire(absolute);
  const compiledModule = { exports: {} };
  const js = ts.transpileModule(readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", js)((id) => aliases[id] ?? localRequire(id), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
const { makeRunInput, validRunAnalysis } = compiled("tests/ai/run-report-fixtures.js");
const reportData = compiled("src/lib/evaluation/report-data.js");
const status = compiled("src/lib/evaluation/report-status.js");
const client = loadTs("src/components/reports/report-test-results.tsx", {
  "@/components/evaluations/fact-grid": loadTs("src/components/evaluations/fact-grid.tsx"),
  "@/lib/evaluation/report-status": status,
});
const detailSection = loadTs("src/components/evaluations/detail-section.tsx");
const link = ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children);
const recurrenceComponent = loadTs("src/components/reports/failure-recurrences.tsx", {
  "next/link": link, "@/components/evaluations/detail-section": detailSection,
});
async function renderReport(failProvider, sample = false) {
  const demo = sample ? compiled("src/lib/evaluation/recurrence-demo.js").buildRecurrenceDemo() : null;
  const input = makeRunInput();
  if (demo) {
    input.report = reportData.buildRunReportData({ evaluation: demo.evaluations[2], results: demo.results, dataset: demo.dataset, configuration: null });
    input.version = { ...input.version, ...demo.dataset.versions[2] };
  }
  const Page = loadTs("src/app/reports/[id]/page.tsx", {
    "next/navigation": { notFound: () => { throw new Error("Unexpected 404"); } },
    "next/link": ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children),
    "@/lib/deployment/service": { latestOperation: async () => null },
    "@/components/projects/next-step": { NextStep: () => null },
    "@/components/evaluations/detail-section": loadTs("src/components/evaluations/detail-section.tsx"),
    "@/components/reports/report-test-results": client,
    "@/components/reports/failure-recurrences": recurrenceComponent,
    "@/lib/evaluation/recurrence": compiled("src/lib/evaluation/recurrence.js"),
    "@/lib/ai/run-analysis": compiled("src/lib/ai/run-analysis.js"),
    "@/lib/ai/client": { isEvaluationAiConfigured: () => true, completeRunAnalysis: async () => { if (failProvider) throw new Error("Provider unavailable"); return validRunAnalysis(); } },
    "@/lib/data/evaluation-engine": { getEvaluationDatasetByModelId: async () => demo?.dataset ?? ({ facts: [], versions: [], diagnostics: [] }) },
    "@/lib/data/evaluations": { getEvaluationById: async () => input.report.evaluation, getEvaluationResultsByEvaluationIds: async () => demo?.results ?? input.report.tests },
    "@/lib/data/model-configurations": { getEffectiveModelVersionConfiguration: async () => null },
    "@/lib/data/models": { getModelById: async () => ({ ...input.model, id: "model" }) },
    "@/lib/data/versions": { getVersionById: async () => input.version, getVersionChangesByVersionIds: async () => demo?.versionChanges ?? [] },
    "@/lib/evaluation/report-data": { ...reportData, buildRunReportData: () => input.report },
    "@/lib/evaluation/report-priority": compiled("src/lib/evaluation/report-priority.js"),
    "@/lib/evaluation/recommendations": compiled("src/lib/evaluation/recommendations.js"),
    "@/lib/hindsight/client": { isHindsightConfigured: () => false },
    "@/lib/hindsight/recall": { recallEvaluationDetailMemory: async () => { throw new Error("Unexpected recall"); } },
    "@/lib/hindsight/report-recall": compiled("src/lib/hindsight/report-recall.js"),
    "@/lib/hindsight/report-memory": { buildStoredReportMemories: () => [], backfillReportMemories: async () => [] },
  }).default;
  return renderToStaticMarkup(await Page({ params: Promise.resolve({ id: input.report.evaluation.id }), searchParams: Promise.resolve({ ai: demo ? "off" : "on", memory: "off" }) }));
}
it("report page renders validated AI actions, verification, and matching evidence/test anchors", async () => {
  const html = await renderReport(false);
  assert.ok(html.includes(validRunAnalysis().recommendedActions[0].action));
  assert.ok(html.includes(validRunAnalysis().recommendedActions[0].verification));
  assert.ok(html.includes('href="#report-test-b"'));
  assert.ok(html.includes('id="report-test-b"'));
  assert.ok(html.includes('href="#report-evidence-test%3Ab"'));
  assert.ok(html.includes('id="report-evidence-test:b"'));
  assert.ok(html.includes("Execution/evaluator errors"));
  assert.ok(html.includes("Performance by category"));
  assert.ok(html.includes("Not recorded"));
});
it("report page remains usable with deterministic findings/actions when the provider fails", async () => {
  const html = await renderReport(true);
  assert.ok(html.includes("The AI provider is unavailable"));
  assert.ok(html.includes("Investigate regression in Inclusive cutoff"));
  assert.ok(html.includes("Re-run Inclusive cutoff"));
  assert.ok(html.includes('href="#report-test-b"'));
  assert.ok(html.includes('id="report-test-b"'));
});
it("acceptance report connects v3/v4/v7 evidence, prompt differences and affected-case reruns without AI", async () => {
  const html = await renderReport(false, true);
  assert.ok(html.includes("Failures that returned"));
  assert.ok(html.includes("The same test failed in v3, passed in v4"));
  assert.ok(html.includes("Replaced explicit eligibility instructions"));
  assert.ok(html.includes("one suspected configuration change at a time"));
  assert.ok(html.includes('href="/reports/sample-run-v3#report-test-sample-run-v3-late-refund"'));
  assert.ok(html.includes('href="/run-evaluation?project=model&amp;version=sample-v7&amp;testKey=late-refund"'));
  assert.ok(html.includes('href="/run-evaluation?project=model&amp;version=sample-v4&amp;testKey=late-refund"'));
});
it("sample demo renders real evidence anchors with no synthetic runnable project links", () => {
  const demo = compiled("src/lib/evaluation/recurrence-demo.js").buildRecurrenceDemo();
  const Page = loadTs("src/app/demo/recurrence/page.tsx", {
    "next/link": link,
    "@/components/reports/failure-recurrences": recurrenceComponent,
    "@/lib/evaluation/recurrence-demo": { buildRecurrenceDemo: () => demo },
  }).default;
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.ok(html.includes("Synthetic sample data"));
  assert.ok(html.includes('href="#report-test-sample-run-v3-late-refund"'));
  assert.ok(html.includes('id="report-test-sample-run-v3-late-refund"'));
  assert.ok(html.includes("within the window"));
  assert.ok(!html.includes("/run-evaluation?"));
});
