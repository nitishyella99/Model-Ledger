import type { PostgrestError } from "@supabase/supabase-js";

const migrationHintsByTable = new Map([
  [
    "test_cases",
    "Apply Supabase migration 20260928073000_add_automatic_evaluation_pipeline.sql and refresh the PostgREST schema cache.",
  ],
  [
    "model_version_configurations",
    "Apply Supabase migration 20260928073000_add_automatic_evaluation_pipeline.sql and refresh the PostgREST schema cache.",
  ],
  [
    "evaluation_recommendations",
    "Apply Supabase migration 20260928090000_add_evaluation_recommendations.sql and refresh the PostgREST schema cache.",
  ],
]);

function getMissingTableName(error: PostgrestError) {
  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ");
  const match = text.match(/table 'public\.([^']+)'/i);

  return match?.[1] ?? null;
}

function getSchemaCacheHint(error: PostgrestError) {
  const tableName = getMissingTableName(error);

  if (!tableName) {
    return null;
  }

  return migrationHintsByTable.get(tableName) ?? null;
}

export class DataAccessError extends Error {
  readonly operation: string;
  readonly details?: string;

  constructor(operation: string, error: PostgrestError) {
    const detailParts = [
      error.message,
      error.details,
      error.hint,
      getSchemaCacheHint(error),
    ].filter(Boolean);

    super(
      detailParts.length > 0
        ? `Database operation failed: ${operation}. ${detailParts.join(" ")}`
        : `Database operation failed: ${operation}.`,
    );
    this.name = "DataAccessError";
    this.operation = operation;
    this.details = detailParts.join(" ");
    this.cause = error;
  }
}

export function throwDataAccessError(
  operation: string,
  error: PostgrestError,
): never {
  throw new DataAccessError(operation, error);
}
