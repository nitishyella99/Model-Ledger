import type { PerTestReportRow } from "./report-data";

export function hasReportExecutionError(test: Pick<PerTestReportRow, "executionStatus" | "providerStatus" | "evaluatorStatus">) {
  const execution = test.executionStatus ?? test.providerStatus;
  return Boolean((execution && execution !== "SUCCESS") || (test.evaluatorStatus && test.evaluatorStatus !== "SUCCESS"));
}
