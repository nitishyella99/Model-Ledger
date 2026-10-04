import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { ArtifactFile } from "./types";
import { manifestSignature, validateArtifactPath } from "./validation";

export const PART_SIZE = 64 * 1024 * 1024;
export function artifactKey(owner: string, operation: string, path: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(owner) || !/^[a-f0-9-]{36}$/i.test(operation) || !validateArtifactPath(path)) throw new Error("Invalid model file path.");
  return `${owner}/${operation}/${path}`;
}
export function partLength(size: number, part: number) {
  if (!Number.isSafeInteger(size) || size <= 0 || !Number.isInteger(part) || part < 1 || part > Math.ceil(size / PART_SIZE)) throw new Error("Invalid upload part.");
  return Math.min(PART_SIZE, size - (part - 1) * PART_SIZE);
}
type Session = { key: string; uploadId: string; manifest: string; expires: number };
function manifestHash(files: ArtifactFile[]) { return createHash("sha256").update(manifestSignature(files)).digest("hex"); }
export function signUploadSession(key: string, uploadId: string, files: ArtifactFile[], secret: string) {
  const payload = Buffer.from(JSON.stringify({ key, uploadId, manifest: manifestHash(files), expires: Date.now() + 7 * 86400000 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function verifyUploadSession(token: string, key: string, files: ArtifactFile[], secret: string): Session {
  const [payload, signature, extra] = token.split(".");
  const expected = createHmac("sha256", secret).update(payload || "").digest();
  const supplied = Buffer.from(signature || "", "base64url");
  if (extra || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error("Invalid upload session. Select the folder again.");
  const session: Session = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (session.key !== key || session.manifest !== manifestHash(files) || !Number.isFinite(session.expires) || session.expires < Date.now() || !session.uploadId) throw new Error("Upload session expired or the model folder changed. Select the original folder again.");
  return session;
}
