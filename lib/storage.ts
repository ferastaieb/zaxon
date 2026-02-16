import "server-only";

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

const DEFAULT_UPLOADS_BUCKET = "logisticzaxon-uploads-250598593974-me-south-1";
const DEFAULT_UPLOADS_REGION = "me-south-1";

export function getUploadsRoot() {
  return process.env.UPLOADS_ROOT ?? path.join(process.cwd(), "data", "uploads");
}

let cachedUploadsBucket: string | null = null;
let cachedUploadsRegion: string | null = null;
let cachedUploadsPrefix: string | null = null;
let uploadsConfigLoaded = false;

function getUploadsBucket() {
  return (
    process.env.UPLOADS_BUCKET?.trim() ||
    cachedUploadsBucket ||
    DEFAULT_UPLOADS_BUCKET
  );
}

function getUploadsRegion() {
  return (
    process.env.UPLOADS_REGION ??
    cachedUploadsRegion ??
    process.env.AWS_REGION ??
    DEFAULT_UPLOADS_REGION
  );
}

function getUploadsPrefix() {
  const prefix = process.env.UPLOADS_PREFIX ?? cachedUploadsPrefix ?? "shipments";
  return prefix.replace(/^\/+|\/+$/g, "");
}

function getUploadsParamPrefix() {
  const prefix = process.env.UPLOADS_PARAM_PREFIX ?? "/logisticZaxon/uploads";
  return prefix.replace(/\/+$/g, "");
}

function shouldUseS3() {
  return Boolean(getUploadsBucket());
}

let cachedS3: S3Client | null = null;
let cachedSsm: SSMClient | null = null;

function getSsmClient() {
  if (!cachedSsm) {
    cachedSsm = new SSMClient({ region: getUploadsRegion() || undefined });
  }
  return cachedSsm;
}

function getS3Client() {
  if (!cachedS3) {
    cachedS3 = new S3Client({ region: getUploadsRegion() || undefined });
  }
  return cachedS3;
}

async function ensureUploadsConfigLoaded() {
  if (uploadsConfigLoaded || getUploadsBucket()) {
    uploadsConfigLoaded = true;
    return;
  }

  uploadsConfigLoaded = true;
  const prefix = getUploadsParamPrefix();
  if (!prefix) return;

  const ssm = getSsmClient();
  const readParam = async (name: string) => {
    try {
      const response = await ssm.send(new GetParameterCommand({ Name: name }));
      return response.Parameter?.Value ?? null;
    } catch {
      return null;
    }
  };

  const [bucket, region, uploadsPrefix] = await Promise.all([
    readParam(`${prefix}/bucket`),
    readParam(`${prefix}/region`),
    readParam(`${prefix}/prefix`),
  ]);

  if (bucket) cachedUploadsBucket = bucket;
  if (region) cachedUploadsRegion = region;
  if (uploadsPrefix) cachedUploadsPrefix = uploadsPrefix;
}

export function sanitizeFileName(original: string) {
  const base = path.basename(original).trim();
  const safe = base.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ");
  return safe.length > 120 ? safe.slice(0, 120) : safe;
}

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function buildS3Key(shipmentId: number, fileName: string) {
  return [getUploadsPrefix(), String(shipmentId), fileName].filter(Boolean).join("/");
}

function buildShipmentPrefix(shipmentId: number) {
  const base = [getUploadsPrefix(), String(shipmentId)].filter(Boolean).join("/");
  return base ? `${base}/` : "";
}

function isNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404;
}

async function streamToBuffer(body: unknown) {
  if (!body) return Buffer.alloc(0);
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body);
  if (Symbol.asyncIterator in Object(body)) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof (body as ReadableStream).getReader === "function") {
    const reader = (body as ReadableStream).getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  }
  throw new Error("Unsupported S3 body type");
}

export function getStorageBasename(storagePath: string) {
  if (!storagePath) return "";
  if (storagePath.includes("/")) return storagePath.split("/").pop() ?? "";
  return path.basename(storagePath);
}

export async function saveUpload(input: {
  shipmentId: number;
  file: File;
  filePrefix?: string;
}) {
  const fileName = sanitizeFileName(input.file.name || "upload");
  const prefixValue = input.filePrefix ? sanitizeFileName(input.filePrefix) : "";
  const prefix = prefixValue ? `${prefixValue}-` : "";
  const fullName = sanitizeFileName(
    `${prefix}${Date.now()}-${randomUUID().slice(0, 8)}-${fileName}`,
  );

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const mimeType = input.file.type || null;

  await ensureUploadsConfigLoaded();

  if (shouldUseS3()) {
    const bucket = getUploadsBucket();
    const key = buildS3Key(input.shipmentId, fullName);
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType ?? undefined,
      }),
    );

    return {
      fileName,
      storagePath: key,
      sizeBytes: buffer.byteLength,
      mimeType,
    };
  }

  const uploadsRoot = getUploadsRoot();
  const folder = path.join(uploadsRoot, String(input.shipmentId));
  ensureDir(folder);
  const storagePath = path.join(folder, fullName);
  fs.writeFileSync(storagePath, buffer);

  return {
    fileName,
    storagePath,
    sizeBytes: buffer.byteLength,
    mimeType,
  };
}

export async function readUpload(storagePath: string) {
  await ensureUploadsConfigLoaded();

  if (shouldUseS3()) {
    try {
      const response = await getS3Client().send(
        new GetObjectCommand({
          Bucket: getUploadsBucket(),
          Key: storagePath,
        }),
      );
      const buffer = await streamToBuffer(response.Body);
      return {
        buffer,
        contentType: response.ContentType ?? null,
      };
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  if (!fs.existsSync(storagePath)) return null;
  return {
    buffer: fs.readFileSync(storagePath),
    contentType: null,
  };
}

export async function removeShipmentUploads(shipmentId: number) {
  await ensureUploadsConfigLoaded();

  if (shouldUseS3()) {
    const bucket = getUploadsBucket();
    const prefix = buildShipmentPrefix(shipmentId);
    let continuationToken: string | undefined;
    do {
      const response = await getS3Client().send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const objects =
        response.Contents?.flatMap((obj) =>
          obj.Key ? [{ Key: obj.Key }] : [],
        ) ?? [];
      if (objects.length) {
        await getS3Client().send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects },
          }),
        );
      }
      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);
    return;
  }

  const uploadsRoot = getUploadsRoot();
  const folder = path.join(uploadsRoot, String(shipmentId));
  if (fs.existsSync(folder)) {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
