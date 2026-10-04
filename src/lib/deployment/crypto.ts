import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const key = Buffer.from(process.env.MODEL_CREDENTIAL_KEY_V1 || "", "base64");
  if (key.length !== 32) throw new Error("Private credential storage is not configured. Ask the administrator to configure MODEL_CREDENTIAL_KEY_V1.");
  return key;
}
export function encryptCredential(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}
export function decryptCredential(value: string) {
  const [version, iv, tag, ciphertext] = value.split(":");
  if (version !== "v1") throw new Error("Unknown credential encryption version.");
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  cipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([cipher.update(Buffer.from(ciphertext, "base64")), cipher.final()]).toString("utf8");
}
