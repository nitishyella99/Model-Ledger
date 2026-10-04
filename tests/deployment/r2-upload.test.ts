import test from "node:test";
import assert from "node:assert/strict";
import { artifactKey, PART_SIZE, partLength, signUploadSession, verifyUploadSession } from "../../src/lib/deployment/r2-upload-policy";
import { multipartUpload, removeR2Artifacts } from "../../src/lib/deployment/r2";
import { S3Client, CreateMultipartUploadCommand, ListPartsCommand, CompleteMultipartUploadCommand, HeadObjectCommand, ListMultipartUploadsCommand, AbortMultipartUploadCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import type { Onboarding } from "../../src/lib/deployment/types";

const id = "11111111-1111-4111-a111-111111111111";
const files = [{ path: "weights.safetensors", size: PART_SIZE + 123, modified: 1234 }];
const key = artifactKey("user_a", id, files[0].path);
test("multipart boundaries reject extra parts and preserve the final size", () => {
  assert.equal(partLength(files[0].size, 1), PART_SIZE);
  assert.equal(partLength(files[0].size, 2), 123);
  for (const part of [0, -1, 3, 1.5, NaN]) assert.throws(() => partLength(files[0].size, part));
});
test("upload sessions bind owner, operation, file, manifest, expiry, and secret", () => {
  const token = signUploadSession(key, "r2-upload", files, "secret");
  assert.equal(verifyUploadSession(token, key, files, "secret").uploadId, "r2-upload");
  assert.throws(() => verifyUploadSession(token, key.replace("user_a", "user_b"), files, "secret"));
  assert.throws(() => verifyUploadSession(token, key.replace(id, "22222222-2222-4222-a222-222222222222"), files, "secret"));
  assert.throws(() => verifyUploadSession(token, key + ".other", files, "secret"));
  assert.throws(() => verifyUploadSession(token, key, [{ ...files[0], size: 1 }], "secret"));
  assert.throws(() => verifyUploadSession(token, key, [{ ...files[0], modified: 5678 }], "secret"));
  assert.throws(() => verifyUploadSession(token, key, files, "different-secret"));
  assert.throws(() => verifyUploadSession(token + "x", key, files, "secret"));
  const original = Date.now;
  try { Date.now = () => original() + 8 * 86400000; assert.throws(() => verifyUploadSession(token, key, files, "secret")); }
  finally { Date.now = original; }
});
test("artifact paths cannot escape the owner and operation prefix", () => {
  for (const path of ["../weights", "/weights", "sub/../weights", "a\\b", "a//b"]) assert.throws(() => artifactKey("user_a", id, path));
  assert.throws(() => artifactKey("user_a/other", id, "weights"));
});
test("R2 resumes server-listed parts, signs exact lengths, and rejects incomplete completion", async t => {
  const configuration = { R2_ACCOUNT_ID: "a".repeat(32), R2_ACCESS_KEY_ID: "test-access", R2_SECRET_ACCESS_KEY: "test-secret", R2_BUCKET_NAME: "test-models", MODEL_CREDENTIAL_KEY_V1: "test-session-secret" };
  const previous = Object.fromEntries(Object.keys(configuration).map(name => [name, process.env[name]]));
  Object.assign(process.env, configuration);
  t.after(() => { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  const op = { id, owner_user_id: "user_a", stage: "uploading", cancel_requested: false, settings: { source: "upload", artifactStorage: "r2", files } } as Onboarding;
  let complete = false, completedCalls = 0;
  t.mock.method(S3Client.prototype, "send", async (command: unknown) => {
    if (command instanceof CreateMultipartUploadCommand) return { UploadId: "test-multipart-id" };
    if (command instanceof ListPartsCommand) return { Parts: [{ PartNumber: 1, Size: PART_SIZE, ETag: '"part1"' }, ...(complete ? [{ PartNumber: 2, Size: 123, ETag: '"part2"' }] : [])] };
    if (command instanceof CompleteMultipartUploadCommand) { completedCalls++; assert.equal(command.input.MultipartUpload?.Parts?.length, 2); return {}; }
    if (command instanceof HeadObjectCommand) return { ContentLength: files[0].size };
    throw new Error("Unexpected R2 request");
  });
  const started = await multipartUpload(op, key, files[0].size, { action: "begin" }) as { token: string };
  const resumed = await multipartUpload(op, key, files[0].size, { action: "resume", token: started.token }) as { parts: { number: number; size: number }[] };
  assert.deepEqual(resumed.parts, [{ number: 1, size: PART_SIZE }]);
  const signed = await multipartUpload(op, key, files[0].size, { action: "part", token: started.token, part: 2 }) as { url: string };
  const signedUrl = new URL(signed.url);
  assert.equal(signedUrl.searchParams.get("partNumber"), "2");
  assert.match(signedUrl.searchParams.get("X-Amz-SignedHeaders") || "", /content-length/);
  assert.equal(signedUrl.searchParams.get("X-Amz-Expires"), "900");
  await assert.rejects(multipartUpload(op, key, files[0].size, { action: "finish", token: started.token }), /incomplete/);
  assert.equal(completedCalls, 0);
  complete = true;
  assert.deepEqual(await multipartUpload(op, key, files[0].size, { action: "finish", token: started.token }), { completed: true });
  assert.equal(completedCalls, 1);
  await assert.rejects(multipartUpload({ ...op, cancel_requested: true }, key, files[0].size, { action: "finish", token: started.token }), /not accepting/);
  await assert.rejects(multipartUpload({ ...op, settings: { ...op.settings, deleting: true } }, key, files[0].size, { action: "part", token: started.token, part: 1 }), /not accepting/);
});
test("R2 deletion aborts pending uploads and reports object-level deletion failures", async t => {
  const configuration = { R2_ACCOUNT_ID: "a".repeat(32), R2_ACCESS_KEY_ID: "test-access", R2_SECRET_ACCESS_KEY: "test-secret", R2_BUCKET_NAME: "test-models" };
  const previous = Object.fromEntries(Object.keys(configuration).map(name => [name, process.env[name]]));
  Object.assign(process.env, configuration);
  t.after(() => { for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  let aborted = false;
  t.mock.method(S3Client.prototype, "send", async (command: unknown) => {
    if (command instanceof ListMultipartUploadsCommand) { assert.equal(command.input.Prefix, `user_a/${id}/`); return { Uploads: [{ Key: key, UploadId: "pending" }] }; }
    if (command instanceof AbortMultipartUploadCommand) { assert.equal(command.input.Key, key); aborted = true; return {}; }
    if (command instanceof DeleteObjectsCommand) { assert.ok(aborted); return { Errors: [{ Key: key, Code: "AccessDenied" }] }; }
    throw new Error("Unexpected R2 request");
  });
  await assert.rejects(removeR2Artifacts(`user_a/${id}/`, [key]), /could not be deleted/);
});
