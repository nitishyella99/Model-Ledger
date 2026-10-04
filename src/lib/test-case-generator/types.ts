export type GeneratedTestCase = Readonly<{
  testId: string;
  name: string;
  objectiveId: string;
  testingObjective: string;
  expectedBehavior: string;
  passCriteria: string[];
  failCriteria: string[];
  prompt: string;
  category: string;
  difficulty: "basic" | "medium" | "hard";
  tags: string[];
}>;

export type TestCaseGeneratorRequest = Readonly<{
  modelContext: string;
  message: string;
  testCaseCount: number;
  clarificationQuestions?: string[];
  /** Deprecated: context readiness is always checked. */
  allowMissingContext?: boolean;
}>;

export type TestCaseGeneratorResult =
  | Readonly<{
      status: "needs_context";
      message: string;
      questions: string[];
      modelContext: string;
    }>
  | Readonly<{
      status: "success";
      message: string;
      cases: GeneratedTestCase[];
      csv: string;
      modelContext: string;
    }>;
