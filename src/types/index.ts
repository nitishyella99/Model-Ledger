export type ID = string;

export type ISODateString = string;

export type ModelStatus = "active" | "archived" | "draft";

export type ModelVersionStatus = "approved" | "monitoring" | "deprecated";

export type ChangeType =
  | "system_prompt"
  | "tooling"
  | "policy"
  | "model_config"
  | "evaluation";

export type EvaluationStatus = "completed" | "running" | "failed";

export type EvaluationOutcome = "pass" | "fail";

export type TestCategory =
  | "safety"
  | "accuracy"
  | "tools"
  | "privacy"
  | "policy"
  | "handoff";

export type RegressionSeverity = "low" | "medium" | "high";

export type MemoryRecordKind =
  | "failure"
  | "fix"
  | "regression"
  | "approval"
  | "observation";

export interface Model {
  id: ID;
  name: string;
  provider: string;
  description: string;
  owner: string;
  status: ModelStatus;
  currentVersionId: ID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ModelVersion {
  id: ID;
  modelId: ID;
  version: string;
  status: ModelVersionStatus;
  releasedAt: ISODateString;
  approvedBy: string;
  summary: string;
}

export interface VersionChange {
  id: ID;
  modelVersionId: ID;
  type: ChangeType;
  title: string;
  description: string;
  changedBy: string;
  changedAt: ISODateString;
}

export interface EvaluationTest {
  id: ID;
  name: string;
  category: TestCategory;
  description: string;
  expectedBehavior: string;
  isCritical: boolean;
}

export interface Evaluation {
  id: ID;
  modelId: ID;
  modelVersionId: ID;
  name: string;
  status: EvaluationStatus;
  outcome?: EvaluationOutcome;
  startedAt: ISODateString;
  completedAt?: ISODateString;
  runBy: string;
  notes: string;
}

export interface EvaluationResult {
  id: ID;
  evaluationId: ID;
  testId: ID;
  outcome: EvaluationOutcome;
  score: number;
  summary: string;
  observedBehavior: string;
  failureReason?: string;
}

export interface Regression {
  id: ID;
  modelId: ID;
  modelVersionId: ID;
  evaluationId: ID;
  testId: ID;
  severity: RegressionSeverity;
  previousPassingVersionId: ID;
  previousFailureVersionId?: ID;
  status: "open" | "resolved";
  detectedAt: ISODateString;
  summary: string;
}

export interface MemoryRecord {
  id: ID;
  modelId: ID;
  modelVersionId?: ID;
  evaluationId?: ID;
  testId?: ID;
  regressionId?: ID;
  kind: MemoryRecordKind;
  title: string;
  summary: string;
  recordedAt: ISODateString;
  tags: string[];
}

export interface DashboardMetrics {
  totalModels: number;
  activeModels: number;
  totalEvaluations: number;
  passingEvaluations: number;
  failingEvaluations: number;
  openRegressions: number;
  criticalFailures: number;
}

export interface VersionComparisonConfigItem {
  label: string;
  state: "changed" | "same";
  before: string;
  after: string;
}

export interface VersionComparisonEvaluationItem {
  testId: ID;
  beforeOutcome: EvaluationOutcome;
  afterOutcome: EvaluationOutcome;
  difference: "passed_to_failed" | "failed_to_passed" | "unchanged";
}

export interface VersionComparison {
  id: ID;
  fromVersionId: ID;
  toVersionId: ID;
  title: string;
  configurationChanges: VersionComparisonConfigItem[];
  evaluationDifferences: VersionComparisonEvaluationItem[];
}

export type DatabaseTableName =
  | "models"
  | "model_versions"
  | "version_changes"
  | "evaluations"
  | "evaluation_results";

export type DatabaseEntityMap = {
  models: Model;
  model_versions: ModelVersion;
  version_changes: VersionChange;
  evaluations: Evaluation;
  evaluation_results: EvaluationResult;
};

export type DatabasePrimaryKeyMap = {
  [TableName in DatabaseTableName]: DatabaseEntityMap[TableName]["id"];
};

export type DatabaseForeignKeyMap = {
  models: {
    currentVersionId: ModelVersion["id"];
  };
  model_versions: {
    modelId: Model["id"];
  };
  version_changes: {
    modelVersionId: ModelVersion["id"];
  };
  evaluations: {
    modelId: Model["id"];
    modelVersionId: ModelVersion["id"];
  };
  evaluation_results: {
    evaluationId: Evaluation["id"];
    testId: EvaluationTest["id"];
  };
};
