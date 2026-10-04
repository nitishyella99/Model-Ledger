import { hasReportExecutionError, type PerTestReportRow, type RunReportData } from "./report-data";

export function prioritizeReportTests(tests: readonly PerTestReportRow[]) {
  const severity: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const rank = (test: PerTestReportRow) => hasReportExecutionError(test) ? 0 : test.classification === "REGRESSION" ? 1 : test.result === "FAIL" ? 2 : test.classification === "RESOLVED" ? 3 : 4;
  return [...tests].sort((a, b) => rank(a) - rank(b) || (severity[a.severity] ?? 4) - (severity[b.severity] ?? 4) || a.id.localeCompare(b.id));
}

export function selectReportExamples(tests: readonly PerTestReportRow[], limit = 10) {
  const ranked = prioritizeReportTests(tests);
  const selected = ranked.slice(0, limit);
  const improvement = ranked.find((test) => test.classification === "RESOLVED" && !hasReportExecutionError(test));
  if (improvement && selected.length && !selected.includes(improvement)) selected[selected.length - 1] = improvement;
  return selected;
}

export function shouldGenerateRunAnalysis(report: RunReportData) {
  return report.errors > 0 || report.regressions > 0 || report.tests.some((test) => test.result === "FAIL" && ["HIGH", "CRITICAL"].includes(test.severity));
}
