import { NextResponse } from "next/server";

import { getDocument } from "@/lib/data/documents";
import { shipmentBelongsToTrackingCustomer } from "@/lib/data/tracking";
import { getStorageBasename, readUpload } from "@/lib/storage";
import {
  getTrackingSessionCustomerPartyId,
  isTrackingSessionValid,
} from "@/lib/trackingAuth";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string; documentId: string }> },
) {
  const { token, documentId } = await context.params;
  const authed = await isTrackingSessionValid(token);
  if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const customerPartyId = await getTrackingSessionCustomerPartyId(token);
  if (!customerPartyId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const doc = await getDocument(Number(documentId));
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const canAccessShipment = await shipmentBelongsToTrackingCustomer(
    customerPartyId,
    doc.shipment_id,
  );
  if (!canAccessShipment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!doc.share_with_customer) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const filePath = doc.storage_path;
  const result = await readUpload(filePath);
  if (!result) return NextResponse.json({ error: "file_missing" }, { status: 404 });
  const fileName = doc.file_name || getStorageBasename(filePath);
  const buffer = result.buffer;

  return new NextResponse(buffer, {
    headers: {
      "content-type":
        doc.mime_type ?? result.contentType ?? "application/octet-stream",
      "content-length": String(result.buffer.byteLength),
      "content-disposition": `attachment; filename="${fileName.replaceAll('"', "")}"`,
      "cache-control": "private, max-age=0, must-revalidate",
    },
  });
}
