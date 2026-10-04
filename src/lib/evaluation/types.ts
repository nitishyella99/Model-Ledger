import type {
  EvaluationResultValue,
  EvaluationSeverity,
  VersionChangeType,
} from "../../types/database";

export type EvaluationResultStatus = EvaluationResultValue;
export type EvaluationResultSeverity = EvaluationSeverity;

export type VersionOrderInput = Readonly<{
  id: string;
  version: string;
  created_at: string;
}>;

export type EvaluationRunInput = Readonly<{
  id: string;
  model_version_id: string;
  evaluated_at: string;
  created_at: string;
}>;

export type EvaluationResultInput = Readonly<{
  id: string;
  evaluation_id: string;
  test_name: string;
  test_key?: string | null;
  input_snapshot?: string | null;
  expected_output_snapshot?: string | null;
  evaluation_criteria_snapshot?: unknown;
  evaluator_type?: string | null;
  threshold?: number | null;
  category: string | null;
  expected_result?: string | null;
  actual_result?: string | null;
  result: EvaluationResultStatus;
  severity: EvaluationResultSeverity | null;
  score?: number | null;
  created_at: string;
}>;

export type VersionChangeInput = Readonly<{
  id: string;
  model_version_id: string;
  change_type: VersionChangeType;
  field_name: string | null;
  previous_value: string | null;
  new_value: string | null;
  description: string;
  created_at: string;
}>;

export type EvaluationFact = Readonly<{
  inputSnapshot?: string | null;
  criteriaSnapshot?: string | null;
  id: string;
  evaluationId: string;
  modelVersionId: string;
  version: string;
  versionCreatedAt: string;
  evaluatedAt: string;
  resultCreatedAt: string;
  testName: string;
  testKey: string;
  category: string;
  expectedResult: string | null;
  actualResult: string | null;
  result: EvaluationResultStatus;
  severity: EvaluationResultSeverity | null;
  score?: number | null;
}>;

export type EvaluationDiagnostic = Readonly<{
  code:
    | "MISSING_EVALUATION"
    | "MISSING_VERSION"
    | "DUPLICATE_TEST_RESULT"
    | "LEGACY_TEST_IDENTITY";
  message: string;
  testKey?: string;
  modelVersionId?: string;
  version?: string;
  resultIds?: string[];
}>;

export type EvaluationDataset = Readonly<{
  versions: VersionOrderInput[];
  facts: EvaluationFact[];
  diagnostics: EvaluationDiagnostic[];
}>;

export type EvaluationMetrics = Readonly<{
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  pass_rate: number;
  failure_rate: number;
  failures_by_severity: Record<EvaluationResultSeverity, number>;
}>;

export type TestHistoryEntry = EvaluationFact;

export type RepeatedFailureAnalysis = Readonly<{
  is_repeated_failure: boolean;
  previous_failure_versions: string[];
  most_recent_previous_failure: string | null;
}>;

export type ResolvedIssueAnalysis = Readonly<{
  was_previously_failed: boolean;
  resolved_in_version: string | null;
  stable_versions_after_resolution: string[];
}>;

export type RegressionAnalysis = Readonly<{
  isRegression: boolean;
  type: "RETURNED_FAILURE" | "NEW_FAILURE" | "REPEATED_FAILURE" | "NONE";
  currentVersion: string | null;
  previousPassingVersion: string | null;
  originalFailureVersion: string | null;
  resolvedVersion: string | null;
}>;

export type ResultTransition =
  | "PASS_TO_PASS"
  | "PASS_TO_FAIL"
  | "FAIL_TO_PASS"
  | "FAIL_TO_FAIL"
  | "NEW_TEST"
  | "REMOVED_TEST";

export type IssueClassification =
  | "NEW_FAILURE"
  | "REPEATED_FAILURE"
  | "REGRESSION"
  | "RESOLVED"
  | "STABLE_PASS"
  | "STABLE_FAIL";

export type TestTransition = Readonly<{
  testKey: string;
  testName: string;
  category: string;
  transition: ResultTransition;
  fromResult: EvaluationFact | null;
  toResult: EvaluationFact | null;
  scoreDelta: number | null;
}>;

export type VersionComparisonSummary = Readonly<{
  fromVersion: VersionOrderInput;
  toVersion: VersionOrderInput;
  total_matching_tests: number;
  unchanged_passes: number;
  unchanged_failures: number;
  newly_failed_tests: number;
  newly_fixed_tests: number;
  new_tests: number;
  removed_tests: number;
  transitions: TestTransition[];
  version_changes: VersionChangeInput[];
}>;
