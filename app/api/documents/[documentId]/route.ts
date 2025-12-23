import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getDocument } from "@/lib/data/documents";
import { canUserAccessShipment } from "@/lib/permissions";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { documentId } = await context.params;
  const doc = getDocument(Number(documentId));
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!canUserAccessShipment(user, doc.shipment_id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const filePath = doc.storage_path;
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "file_missing" }, { status: 404 });
  }

  const fileName = doc.file_name || path.basename(filePath);
  const buffer = fs.readFileSync(filePath);

  return new NextResponse(buffer, {
    headers: {
      "content-type": doc.mime_type ?? "application/octet-stream",
      "content-length": String(buffer.byteLength),
      "content-disposition": `attachment; filename="${fileName.replaceAll('"', "")}"`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
