import type { Onboarding } from "./types";

const activeStages = ["queued", "validating", "preparing", "evaluating"];
type WorkerState = Pick<Onboarding, "stage" | "lease_expires_at" | "reserved_seconds">;

export function modelRemovalBlockReason(operation: WorkerState, dependents: WorkerState[] = [], now = Date.now()): string | null {
  if (activeStages.includes(operation.stage)) return "Stop the current evaluation before deleting or replacing this model.";
  if ((operation.lease_expires_at && new Date(operation.lease_expires_at).getTime() > now) || operation.reserved_seconds > 0) return "The worker is finishing the previous evaluation. Model actions will be available when it finishes.";
  if (dependents.some(job => activeStages.includes(job.stage) || (job.lease_expires_at && new Date(job.lease_expires_at).getTime() > now) || job.reserved_seconds > 0)) return "Another evaluation is using this model as its baseline. Wait for it to finish before deleting or replacing the model.";
  return null;
}

export function savedModelDetails(operation: Onboarding) {
  const files = operation.settings.files;
  return {
    name: operation.settings.displayName || operation.settings.model || operation.settings.repository || "Uploaded model",
    fileCount: files.length,
    bytes: operation.artifact_bytes || files.reduce((sum, file) => sum + file.size, 0),
    complete: operation.settings.source !== "upload" || Boolean(operation.artifact_bytes || operation.artifact_revision || operation.evaluation_id),
  };
}
