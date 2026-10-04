import { prioritizeReportTests } from "../evaluation/report-priority";
import type { RunReportData } from "../evaluation/report-data";
import type { HindsightRecallMemory, RecallMemoryResult, RecallForEvaluationInput } from "./types";

type RecallGroups = { similarFailures: RecallMemoryResult; previousResolutions: RecallMemoryResult; historicalRegressions: RecallMemoryResult; relevantVersionChanges: RecallMemoryResult; all: HindsightRecallMemory[] };
export async function recallRunReportMemory(modelId: string, report: RunReportData, recall: (input: Omit<RecallForEvaluationInput, "eventTypes">) => Promise<RecallGroups>) {
  const tests = prioritizeReportTests(report.tests).filter((test) => test.result === "FAIL" || ["REGRESSION", "RESOLVED"].includes(test.classification)).slice(0, 5);
  const responses = await Promise.all(tests.map(async (test) => {
    try { return { test, groups: await recall({ modelId, testKey: test.testKey, category: test.category, currentFailureDescription: test.result === "FAIL" ? `${test.testName}: expected ${test.expectedOutput.slice(0, 1200)}; actual ${test.actualOutput.slice(0, 1200)}` : null, limit: 4 }) }; }
    catch { return { test, groups: null }; }
  }));
  const seen = new Set<string>();
  const all = responses.flatMap(({ test, groups }) => (groups?.all ?? []).filter((memory) => (!memory.testKey || memory.testKey === test.testKey) && (!memory.timestamp || Date.parse(memory.timestamp) <= Date.parse(report.evaluation.evaluated_at))).map((memory) => ({ ...memory, testKey: memory.testKey ?? test.testKey }))).filter((memory) => {
    if (seen.has(memory.id)) return false; seen.add(memory.id); return true;
  });
  const first = responses.find((response) => response.groups)?.groups;
  if (!first) return { groups: null, all, unavailable: tests.length > 0 };
  const keys = ["similarFailures", "previousResolutions", "historicalRegressions", "relevantVersionChanges"] as const;
  const merged = { ...first, all };
  for (const key of keys) merged[key] = { ...first[key], ok: responses.every(({ groups }) => groups?.[key].ok), memories: responses.flatMap(({ groups }) => groups?.[key].memories ?? []) };
  return { groups: merged, all, unavailable: responses.some(({ groups }) => !groups || keys.some((key) => !groups[key].ok)) };
}
