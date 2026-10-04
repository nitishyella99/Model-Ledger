import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectsCommand, HeadObjectCommand, ListMultipartUploadsCommand, ListPartsCommand, S3Client, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PART_SIZE, partLength, signUploadSession, verifyUploadSession } from "./r2-upload-policy";
import type { Onboarding } from "./types";

export function r2Configured() {
  return ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"].every(name => Boolean(process.env[name]));
}
export function r2Storage() {
  if (!r2Configured()) throw new Error("Model uploads need Cloudflare R2. Ask the administrator to configure R2 storage.");
  const account = process.env.R2_ACCOUNT_ID!;
  if (!/^[a-f0-9]{32}$/i.test(account)) throw new Error("Invalid R2 account ID.");
  return { Bucket: process.env.R2_BUCKET_NAME!, client: new S3Client({ region: "auto", endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! }, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" }) };
}
export async function r2ObjectSize(Key: string) {
  const { client, Bucket } = r2Storage();
  try { return (await client.send(new HeadObjectCommand({ Bucket, Key }))).ContentLength; }
  catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null; throw error; }
}
export async function removeR2Artifacts(prefix: string, keys: string[]) {
  const { client, Bucket } = r2Storage();
  // Abort pending multipart sessions as well as removing completed objects.
  let KeyMarker: string | undefined, UploadIdMarker: string | undefined;
  do {
    const page = await client.send(new ListMultipartUploadsCommand({ Bucket, Prefix: prefix, KeyMarker, UploadIdMarker }));
    for (const upload of page.Uploads || []) await client.send(new AbortMultipartUploadCommand({ Bucket, Key: upload.Key, UploadId: upload.UploadId }));
    KeyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
    UploadIdMarker = page.NextUploadIdMarker;
  } while (KeyMarker);
  for (let offset = 0; offset < keys.length; offset += 1000) {
    const result = await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys.slice(offset, offset + 1000).map(Key => ({ Key })) } }));
    if (result.Errors?.length) throw new Error("Some model files could not be deleted. Retry cleanup.");
  }
}
export async function multipartUpload(op: Onboarding, Key: string, size: number, input: { action: string; token?: string; part?: number }) {
  if (op.stage !== "uploading" || op.cancel_requested || op.settings.deleting || op.settings.source !== "upload" || op.settings.artifactStorage !== "r2") throw new Error("This model is not accepting uploads.");
  const { client, Bucket } = r2Storage();
  const secret = process.env.MODEL_CREDENTIAL_KEY_V1;
  if (!secret) throw new Error("Upload session signing is not configured.");
  if (input.action === "begin") {
    const result = await client.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType: "application/octet-stream" }));
    if (!result.UploadId) throw new Error("R2 could not start the upload.");
    return { token: signUploadSession(Key, result.UploadId, op.settings.files, secret), partSize: PART_SIZE };
  }
  const { uploadId: UploadId } = verifyUploadSession(input.token || "", Key, op.settings.files, secret);
  if (input.action === "part") {
    const length = partLength(size, input.part!);
    return { url: await getSignedUrl(client, new UploadPartCommand({ Bucket, Key, UploadId, PartNumber: input.part, ContentLength: length }), { expiresIn: 900, signableHeaders: new Set(["content-length"]) }) };
  }
  const parts = [];
  let PartNumberMarker: string | undefined;
  do {
    const page = await client.send(new ListPartsCommand({ Bucket, Key, UploadId, PartNumberMarker }));
    parts.push(...(page.Parts || []));
    PartNumberMarker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
  } while (PartNumberMarker);
  const valid = parts.filter(part => part.PartNumber && part.PartNumber <= Math.ceil(size / PART_SIZE) && part.Size === partLength(size, part.PartNumber) && part.ETag).sort((a, b) => a.PartNumber! - b.PartNumber!);
  if (input.action === "resume") return { parts: valid.map(part => ({ number: part.PartNumber, size: part.Size })), partSize: PART_SIZE };
  if (input.action !== "finish" || valid.length !== Math.ceil(size / PART_SIZE) || valid.length !== parts.length) throw new Error("Model file upload is incomplete.");
  await client.send(new CompleteMultipartUploadCommand({ Bucket, Key, UploadId, MultipartUpload: { Parts: valid.map(part => ({ PartNumber: part.PartNumber, ETag: part.ETag })) } }));
  if (await r2ObjectSize(Key) !== size) throw new Error("Model file size did not match the selected folder.");
  return { completed: true };
}
