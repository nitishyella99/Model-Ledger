// Exercise the application's R2 multipart flow without touching projects or GPUs.
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { build } from "esbuild";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

process.loadEnvFile(".env.local");
mkdirSync(".evaluation-test-dist", { recursive: true });
await build({ entryPoints: ["src/lib/deployment/r2.ts"], outfile: ".evaluation-test-dist/r2-live.cjs", bundle: true, platform: "node", format: "cjs", packages: "external" });
const { r2Storage, multipartUpload, removeR2Artifacts } = createRequire(import.meta.url)("../.evaluation-test-dist/r2-live.cjs");
const partSize = 64 * 1024 * 1024;
const id = randomUUID(), owner = "__r2_verification__";
const prefix = `${owner}/${id}/`, key = `${prefix}weights.safetensors`;
const size = partSize + 33;
const op = { id, owner_user_id: owner, stage: "uploading", cancel_requested: false, settings: { source: "upload", artifactStorage: "r2", files: [{ path: "weights.safetensors", size, modified: 1 }] } };
const origins = ["http://localhost:3000", "https://model-ledger-sigma.vercel.app"];
const results = [];
function check(ok, name) { results.push({ check: name, passed: Boolean(ok) }); console.log(`${ok ? "PASS" : "FAIL"}: ${name}`); }
function safeError(error) { return { name: error?.name, status: error?.$metadata?.httpStatusCode }; }
const { client, Bucket } = r2Storage();
let cleanupRequired = false;
try {
  const started = await multipartUpload(op, key, size, { action: "begin" });
  cleanupRequired = true;
  const first = await multipartUpload(op, key, size, { action: "part", token: started.token, part: 1 });
  for (const origin of origins) {
    const response = await fetch(first.url, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type" }, signal: AbortSignal.timeout(30000) });
    const corsOk = response.ok && response.headers.get("access-control-allow-origin") === origin && /PUT/i.test(response.headers.get("access-control-allow-methods") || "");
    check(corsOk, `Browser CORS preflight permits ${origin}`);
    if (!corsOk) console.log("CORS response:", JSON.stringify({ status: response.status, allowOrigin: response.headers.get("access-control-allow-origin"), allowMethods: response.headers.get("access-control-allow-methods") }));
  }
  const data = Buffer.alloc(partSize, 90), tail = Buffer.alloc(33, 49);
  for (const [number, bytes, signed] of [[1, data, first], [2, tail, null]]) {
    const authorization = signed || await multipartUpload(op, key, size, { action: "part", token: started.token, part: number });
    const response = await fetch(authorization.url, { method: "PUT", headers: { "Content-Length": String(bytes.length), Origin: origins[0] }, body: bytes, signal: AbortSignal.timeout(120000) });
    check(response.ok, `Signed multipart PUT succeeds for part ${number}`);
    if (!response.ok) throw new Error("VerificationUploadFailed");
    if (number === 1) {
      const resumed = await multipartUpload(op, key, size, { action: "resume", token: started.token });
      check(resumed.parts.length === 1 && resumed.parts[0].number === 1 && resumed.parts[0].size === partSize, "Resume lists the completed 64 MiB part");
      let rejected = false;
      try { await multipartUpload(op, key, size, { action: "finish", token: started.token }); } catch { rejected = true; }
      check(rejected, "Incomplete multipart completion is rejected");
    }
  }
  await multipartUpload(op, key, size, { action: "finish", token: started.token });
  check((await client.send(new HeadObjectCommand({ Bucket, Key: key }))).ContentLength === size, "Completed object has the exact declared size");
  const readUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: 60 });
  const read = await fetch(readUrl, { signal: AbortSignal.timeout(120000) });
  const actual = createHash("sha256");
  if (read.ok && read.body) for await (const chunk of read.body) actual.update(chunk);
  check(read.ok && actual.digest("hex") === createHash("sha256").update(data).update(tail).digest("hex"), "Private signed download preserves all uploaded bytes");
  const unsigned = new URL(readUrl); unsigned.search = "";
  const anonymous = await fetch(unsigned, { signal: AbortSignal.timeout(30000) });
  check(anonymous.status >= 400, "S3 object endpoint rejects anonymous reads");
  // Start another session so cleanup also verifies pending-upload aborts.
  await multipartUpload(op, key, size, { action: "begin" });
  await removeR2Artifacts(prefix, [key]);
  cleanupRequired = false;
  let missing = false;
  try { await client.send(new HeadObjectCommand({ Bucket, Key: key })); } catch (error) { missing = error?.$metadata?.httpStatusCode === 404; }
  check(missing, "Verification object and pending upload cleaned up");
} catch (error) {
  console.log("Verification error:", JSON.stringify(safeError(error)));
  process.exitCode = 1;
} finally {
  if (cleanupRequired) {
    try { await removeR2Artifacts(prefix, [key]); console.log("PASS: Temporary verification storage cleaned up"); }
    catch (error) { console.log("FAIL: Temporary verification cleanup", JSON.stringify(safeError(error))); process.exitCode = 1; }
  }
  if (results.some(result => !result.passed)) process.exitCode = 1;
}
