import { generateTestCasesAction } from "@/app/test-case-generator/actions";
import { TestCaseGenerator } from "@/components/tests/test-case-generator";

// Context analysis, generation, review, and one repair/review: at most five 75s calls.
export const maxDuration = 420;

export default function TestCaseGeneratorPage() {
  return <TestCaseGenerator action={generateTestCasesAction} />;
}
