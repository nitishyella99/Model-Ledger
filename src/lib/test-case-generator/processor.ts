import type { GeneratedTestCase } from "./types";

export const testCaseCountOptions = [5, 8, 10, 12, 15] as const;
export function clampTestCaseCount(value: number) {
  return testCaseCountOptions.includes(value as (typeof testCaseCountOptions)[number]) ? value : 8;
}
export function mergeModelContext(existingContext: string, message: string) {
  return [existingContext.trim(), message.trim()].filter(Boolean).join("\n");
}
export function singleLine(value: string) {
  return value.replace(/\s+/g, " ").trim();
}
export function normalizePrompt(value: string) {
  // Preserve case and operators: code and structured input may depend on them.
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}
function csvCell(value: string) {
  const text = singleLine(value);
  return /[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export function buildTestCasesCsv(rows: readonly GeneratedTestCase[]) {
  const header = "stable_key,name,category,input,expected_output,evaluator_type,threshold,severity,tags";
  const body = rows.map((row) => [
    row.testId, row.name, row.category, row.prompt,
    `Expected behavior: ${row.expectedBehavior} Pass criteria: ${row.passCriteria.join("; ")} Fail criteria: ${row.failCriteria.join("; ")}`,
    "llm_judge", "0.75", "MEDIUM", row.tags.join(";"),
  ].map(csvCell).join(","));
  return [header, ...body].join("\n");
}
