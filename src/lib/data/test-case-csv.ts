import { getStableTestKey } from "../evaluation/engine";
import type { Tables } from "../../types/database";

type TestCaseRow = Tables<"test_cases">;

export type CsvTestCaseInput = Readonly<{
  stableKey?: string | null;
  modelVersionId?: string | null;
  name: string;
  category: string;
  input: string;
  expectedOutput: string;
  evaluationCriteria?: Record<string, unknown>;
  evaluatorType?: TestCaseRow["evaluator_type"];
  threshold?: number;
  severity?: TestCaseRow["severity"];
  tags?: string[];
}>;

export type CsvValidationError = Readonly<{
  row: number;
  field: string;
  message: string;
}>;

export type ParsedTestCasesCsv = Readonly<{
  rows: CsvTestCaseInput[];
  errors: CsvValidationError[];
}>;

const documentedCsvColumns = new Set([
  "stable_key",
  "name",
  "category",
  "input",
  "expected_output",
  "evaluator_type",
  "threshold",
  "severity",
  "tags",
]);
const evaluatorTypes = new Set(["exact_match", "contains", "llm_judge"]);
const severities = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export function stableKeyForCsvTest(input: Pick<CsvTestCaseInput, "category" | "name" | "stableKey">) {
  return (
    input.stableKey?.trim() ||
    getStableTestKey({
      test_key: null,
      category: input.category,
      test_name: input.name,
    })
  );
}

function splitCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }

  values.push(value.trim());

  return values;
}

export function parseAndValidateTestCasesCsv(csv: string): ParsedTestCasesCsv {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const [headerLine, ...rows] = lines;

  if (!headerLine) {
    return {
      rows: [],
      errors: [{ row: 1, field: "header", message: "CSV header is required." }],
    };
  }

  const headers = splitCsvLine(headerLine).map((header) =>
    header.trim().toLowerCase(),
  );
  const errors: CsvValidationError[] = [];

  for (const header of headers) {
    if (!documentedCsvColumns.has(header)) {
      errors.push({
        row: 1,
        field: header || "header",
        message: `Unsupported column "${header}".`,
      });
    }
  }

  const indexFor = (names: string[]) =>
    names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ??
    -1;
  const indexes = {
    stableKey: indexFor(["stable_key", "key", "test_key"]),
    name: indexFor(["name", "test_name"]),
    category: indexFor(["category", "suite"]),
    input: indexFor(["input", "test_input", "prompt"]),
    expectedOutput: indexFor(["expected_output", "expected", "expected_result"]),
    evaluatorType: indexFor(["evaluator_type", "evaluator"]),
    threshold: indexFor(["threshold"]),
    severity: indexFor(["severity"]),
    tags: indexFor(["tags"]),
  };
  const requiredColumns = [
    ["name", indexes.name],
    ["category", indexes.category],
    ["input", indexes.input],
    ["expected_output", indexes.expectedOutput],
  ] as const;

  for (const [field, index] of requiredColumns) {
    if (index < 0) {
      errors.push({
        row: 1,
        field,
        message: `Required column "${field}" is missing.`,
      });
    }
  }

  const parsedRows = rows.map((row, rowIndex) => {
    const values = splitCsvLine(row);
    const sourceRow = rowIndex + 2;
    const get = (index: number) => (index >= 0 ? values[index]?.trim() : "");
    const tags = get(indexes.tags)
      .split(/[|;]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    const threshold = Number(get(indexes.threshold));
    const evaluatorType = get(indexes.evaluatorType);
    const severity = get(indexes.severity);

    for (const [field, index] of requiredColumns) {
      if (!get(index)) {
        errors.push({
          row: sourceRow,
          field,
          message: `${field} is required.`,
        });
      }
    }

    if (evaluatorType && !evaluatorTypes.has(evaluatorType)) {
      errors.push({
        row: sourceRow,
        field: "evaluator_type",
        message: "Evaluator type must be exact_match, contains, or llm_judge.",
      });
    }

    if (
      get(indexes.threshold) &&
      (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    ) {
      errors.push({
        row: sourceRow,
        field: "threshold",
        message: "Threshold must be a number between 0 and 1.",
      });
    }

    if (severity && !severities.has(severity)) {
      errors.push({
        row: sourceRow,
        field: "severity",
        message: "Severity must be LOW, MEDIUM, HIGH, or CRITICAL.",
      });
    }

    return {
      stableKey: get(indexes.stableKey) || null,
      name: get(indexes.name),
      category: get(indexes.category),
      input: get(indexes.input),
      expectedOutput: get(indexes.expectedOutput),
      evaluatorType:
        (evaluatorType as CsvTestCaseInput["evaluatorType"]) ||
        undefined,
      threshold: Number.isFinite(threshold) ? threshold : undefined,
      severity:
        (severity as CsvTestCaseInput["severity"]) || undefined,
      tags,
    };
  });

  return {
    rows: parsedRows,
    errors,
  };
}

export function parseTestCasesCsv(csv: string): CsvTestCaseInput[] {
  return parseAndValidateTestCasesCsv(csv).rows;
}
