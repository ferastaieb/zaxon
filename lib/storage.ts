import "server-only";

import fs from "node:fs";
import path from "node:path";

export function getUploadsRoot() {
  return process.env.UPLOADS_ROOT ?? path.join(process.cwd(), "data", "uploads");
}

export function sanitizeFileName(original: string) {
  const base = path.basename(original).trim();
  const safe = base.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ");
  return safe.length > 120 ? safe.slice(0, 120) : safe;
}

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export async function saveUpload(input: {
  shipmentId: number;
  file: File;
  filePrefix?: string;
}) {
  const uploadsRoot = getUploadsRoot();
  const folder = path.join(uploadsRoot, String(input.shipmentId));
  ensureDir(folder);

  const fileName = sanitizeFileName(input.file.name || "upload");
  const prefixValue = input.filePrefix ? sanitizeFileName(input.filePrefix) : "";
  const prefix = prefixValue ? `${prefixValue}-` : "";
  const fullName = sanitizeFileName(`${prefix}${Date.now()}-${fileName}`);
  const storagePath = path.join(folder, fullName);

  const buffer = Buffer.from(await input.file.arrayBuffer());
  fs.writeFileSync(storagePath, buffer);

  return {
    fileName,
    storagePath,
    sizeBytes: buffer.byteLength,
    mimeType: input.file.type || null,
  };
}

export function removeShipmentUploads(shipmentId: number) {
  const uploadsRoot = getUploadsRoot();
  const folder = path.join(uploadsRoot, String(shipmentId));
  if (fs.existsSync(folder)) {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
