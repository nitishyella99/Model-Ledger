import type { Tables } from "../../types/database";
import type { EvaluationDataset, EvaluationFact, VersionChangeInput } from "./types";
import { sameTestDefinition } from "./regression";

export type FailureRecurrence = {
  testKey: string;
  testName: string;
  previousFailure: EvaluationFact;
  firstPassing: EvaluationFact;
  lastPassing: EvaluationFact;
  current: EvaluationFact;
  passingChanges: VersionChangeInput[];
  recurrenceChanges: VersionChangeInput[];
  summary: string;
  verification: string;
};

/** Exact test recurrence, not a semantic incident match or proof of a fix. */
export function buildFailureRecurrences(input: {
  dataset: EvaluationDataset;
  evaluationId: string;
  results: readonly Tables<"evaluation_results">[];
  versionChanges: readonly VersionChangeInput[];
}): FailureRecurrence[] {
  const rows = new Map(input.results.map((row) => [row.id, row]));
  const successful = (fact: EvaluationFact) => {
    const row = rows.get(fact.id);
    return row && Boolean(row.test_key?.trim()) && (row.execution_status ?? row.provider_status) === "SUCCESS" &&
      row.evaluator_status === "SUCCESS" && fact.inputSnapshot != null &&
      fact.criteriaSnapshot != null && row.expected_output_snapshot != null;
  };
  return input.dataset.facts.filter((fact) => fact.evaluationId === input.evaluationId &&
    fact.result === "FAIL" && successful(fact)).flatMap((current) => {
    const history = input.dataset.facts.filter((fact) => fact.testKey === current.testKey &&
      fact.modelVersionId !== current.modelVersionId && successful(fact) &&
      sameTestDefinition(fact, current) &&
      Date.parse(fact.versionCreatedAt) < Date.parse(current.versionCreatedAt) &&
      Date.parse(fact.evaluatedAt) <= Date.parse(current.evaluatedAt) &&
      Date.parse(fact.resultCreatedAt) <= Date.parse(current.resultCreatedAt))
      .sort((a, b) => Date.parse(a.evaluatedAt) - Date.parse(b.evaluatedAt) ||
        Date.parse(a.resultCreatedAt) - Date.parse(b.resultCreatedAt) || a.id.localeCompare(b.id));
    const lastPassing = history.findLast((fact) => fact.result === "PASS");
    if (!lastPassing) return [];
    const beforePass = history.slice(0, history.indexOf(lastPassing));
    const previousFailure = beforePass.findLast((fact) => fact.result === "FAIL" &&
      Date.parse(fact.versionCreatedAt) < Date.parse(lastPassing.versionCreatedAt));
    if (!previousFailure) return [];
    const firstPassing = history.slice(history.indexOf(previousFailure) + 1)
      .find((fact) => fact.result === "PASS" &&
        Date.parse(fact.versionCreatedAt) > Date.parse(previousFailure.versionCreatedAt));
    if (!firstPassing) return [];
    const changesFor = (fact: EvaluationFact) => input.versionChanges.filter((change) =>
      change.model_version_id === fact.modelVersionId &&
      Date.parse(change.created_at) <= Date.parse(fact.evaluatedAt))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const passingChanges = changesFor(firstPassing);
    const recurrenceChanges = changesFor(current);
    return [{ testKey: current.testKey, testName: current.testName, previousFailure,
      firstPassing, lastPassing, current, passingChanges, recurrenceChanges,
      summary: `This failure is present again in ${current.version}. The same test failed in ${previousFailure.version}, passed in ${firstPassing.version}, and last passed in ${lastPassing.version}.`,
      verification: `Re-run ${current.testName} on ${current.version} and the last passing version ${lastPassing.version} with the recorded input, expected output, evaluator, and threshold unchanged. ${recurrenceChanges.length ? "On a new candidate version, restore one suspected configuration change at a time and repeat those runs." : "No current configuration change is recorded; inspect the configuration difference before choosing a contributor to isolate."} Compare outputs and evaluator evidence, repeat to check variability, then run the full suite to check for other regressions. A later PASS alone does not confirm a cause.`,
    }];
  });
}
