import {
  formatMemoryContextLabel,
  getMemoryBankId,
} from "./formatter";
import type {
  HindsightClientLike,
  HindsightMemoryMetadata,
  HindsightRecallMemory,
  MemoryEventType,
  RecallMemoryResult,
  RetainMemoryInput,
  RetainMemoryResult,
} from "./types";

type Logger = Pick<Console, "info" | "warn">;

const configuredBankIds = new Set<string>();
const configuringBankIds = new Map<string, Promise<void>>();

const validEventTypes = new Set<MemoryEventType>([
  "evaluation_failure",
  "evaluation_outcome",
  "regression",
  "improvement",
  "resolved_issue",
  "version_change",
  "fix_remediation",
  "approval_decision",
  "rejection_decision",
  "evaluator_note",
]);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown Hindsight error";
}

async function configureHindsightBank(
  client: HindsightClientLike,
  bankId: string,
  logger: Logger,
) {
  if (configuredBankIds.has(bankId)) {
    return;
  }

  const inFlight = configuringBankIds.get(bankId);

  if (inFlight) {
    await inFlight;
    return;
  }

  const setup = (async () => {
    if (client.createBank) {
      await client.createBank(bankId, {
        name: `ModelLedger ${bankId}`,
        retainMission:
          "Remember ModelLedger evaluation outcomes, failures, regressions, fixes, version changes, and evaluator notes as factual historical evidence.",
        reflectMission:
          "Use ModelLedger memory as historical evidence for evaluation reports. Be precise, correlation-first, and do not invent causes.",
        enableObservations: true,
      });
    }

    configuredBankIds.add(bankId);
  })();

  configuringBankIds.set(bankId, setup);

  try {
    await setup;
  } catch (error) {
    logger.warn(
      `[hindsight] bank setup failed for ${bankId}: ${getErrorMessage(error)}`,
    );
    throw error;
  } finally {
    configuringBankIds.delete(bankId);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringifyMetadata(metadata: HindsightMemoryMetadata = {}) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, String(value)]),
  );
}

function getStringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getNumberField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function getMetadata(record: Record<string, unknown>) {
  const metadata = record.metadata;
  return isRecord(metadata) ? metadata : {};
}

function normalizeEventType(value: string | null): MemoryEventType | null {
  return value && validEventTypes.has(value as MemoryEventType)
    ? (value as MemoryEventType)
    : null;
}

export async function retainMemoryWithClient(
  client: HindsightClientLike | null,
  input: RetainMemoryInput,
  logger: Logger = console,
): Promise<RetainMemoryResult> {
  const bankId = getMemoryBankId(input.modelId);

  if (!client) {
    logger.warn(
      `[hindsight] retain skipped; Hindsight is not configured for ${input.eventId}`,
    );
    return {
      ok: false,
      skipped: true,
      eventId: input.eventId,
      bankId,
      error: "Hindsight is not configured.",
    };
  }

  try {
    await configureHindsightBank(client, bankId, logger);
    await client.retain(bankId, input.content, {
      context: formatMemoryContextLabel(input.eventType),
      documentId: input.eventId,
      timestamp: input.timestamp ?? input.metadata?.timestamp,
      metadata: stringifyMetadata({
        ...input.metadata,
        event_id: input.eventId,
        event_type: input.eventType,
      }),
    });

    logger.info(`[hindsight] retained ${input.eventId} in ${bankId}`);
    return {
      ok: true,
      skipped: false,
      eventId: input.eventId,
      bankId,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    logger.warn(`[hindsight] retain failed for ${input.eventId}: ${message}`);
    return {
      ok: false,
      skipped: false,
      eventId: input.eventId,
      bankId,
      error: message,
    };
  }
}

export function normalizeRecallResponse(response: unknown): HindsightRecallMemory[] {
  if (!isRecord(response) || !Array.isArray(response.results)) {
    return [];
  }

  return response.results.flatMap((item, index): HindsightRecallMemory[] => {
    if (!isRecord(item)) {
      return [];
    }

    const content = getStringField(item, ["text", "content", "memory"]);

    if (!content) {
      return [];
    }

    const metadata = getMetadata(item);
    const eventType = normalizeEventType(
      getStringField(metadata, ["event_type", "eventType"]),
    );
    const id =
      getStringField(item, ["id", "memory_id", "memoryId"]) ??
      getStringField(metadata, ["event_id", "eventId", "result_id"]) ??
      `hindsight:${index}`;

    return [
      {
        id,
        content,
        relevance: getNumberField(item, ["relevance", "score", "similarity"]),
        eventType,
        modelVersionId: getStringField(metadata, [
          "model_version_id",
          "modelVersionId",
        ]),
        version: getStringField(metadata, ["version"]),
        evaluationId: getStringField(metadata, [
          "evaluation_id",
          "evaluationId",
        ]),
        testKey: getStringField(metadata, ["test_key", "testKey"]),
        timestamp:
          getStringField(metadata, ["timestamp"]) ??
          getStringField(item, ["timestamp", "created_at", "createdAt"]),
      },
    ];
  });
}

export async function recallMemoryWithClient(
  client: HindsightClientLike | null,
  modelId: string,
  query: string,
  options: Record<string, unknown> = {},
  logger: Logger = console,
): Promise<RecallMemoryResult> {
  const bankId = getMemoryBankId(modelId);

  if (!client) {
    logger.warn(`[hindsight] recall skipped; Hindsight is not configured`);
    return {
      ok: false,
      bankId,
      memories: [],
      error: "Hindsight is not configured.",
    };
  }

  try {
    await configureHindsightBank(client, bankId, logger);
    const response = await client.recall(bankId, query, options);
    const memories = normalizeRecallResponse(response);
    logger.info(`[hindsight] recalled ${memories.length} memories from ${bankId}`);

    return {
      ok: true,
      bankId,
      memories,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    logger.warn(`[hindsight] recall failed for ${bankId}: ${message}`);

    return {
      ok: false,
      bankId,
      memories: [],
      error: message,
    };
  }
}
