import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "node:crypto";

type UploadR2ObjectInput = {
  buffer: Buffer;
  contentType: string;
  folder: string;
  extension: string;
  userId: string;
};

const R2_REGION = "auto";

function cleanPart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function isR2Configured() {
  return Boolean(
    process.env.R2_ENDPOINT?.trim() &&
    process.env.R2_ACCESS_KEY_ID?.trim() &&
    process.env.R2_SECRET_ACCESS_KEY?.trim() &&
    process.env.R2_BUCKET?.trim() &&
    process.env.R2_PUBLIC_BASE_URL?.trim(),
  );
}

function r2Client() {
  const endpoint = process.env.R2_ENDPOINT?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 no está configurado.");
  }
  return new S3Client({
    region: R2_REGION,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function uploadR2Object({ buffer, contentType, folder, extension, userId }: UploadR2ObjectInput) {
  const bucket = process.env.R2_BUCKET?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim()?.replace(/\/+$/g, "");
  if (!bucket || !publicBaseUrl) throw new Error("R2 no está configurado.");

  const normalizedFolder = cleanPart(folder).replace(/^\/+|\/+$/g, "");
  const normalizedUser = cleanPart(userId) || "user";
  const normalizedExtension = cleanPart(extension).replace(/^\.*/, "") || "bin";
  const key = `${normalizedFolder}/${normalizedUser}/${Date.now()}-${crypto.randomUUID()}.${normalizedExtension}`;

  await r2Client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return {
    key,
    url: `${publicBaseUrl}/${key}`,
  };
}

export async function deleteR2Object(key: string) {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) throw new Error("R2 no está configurado.");
  await r2Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
