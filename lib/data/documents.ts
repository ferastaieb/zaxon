import "server-only";

import type { DocumentType } from "@/lib/domain";
import { getDb, nowIso } from "@/lib/db";
import { execute, queryAll, queryOne } from "@/lib/sql";

export type DocumentRow = {
  id: number;
  shipment_id: number;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  document_type: DocumentType | string;
  is_required: 0 | 1;
  is_received: 0 | 1;
  share_with_customer: 0 | 1;
  source: "STAFF" | "CUSTOMER";
  document_request_id: number | null;
  uploaded_by_user_id: number | null;
  uploaded_at: string;
};

export type DocumentRequestRow = {
  id: number;
  shipment_id: number;
  document_type: DocumentType | string;
  message: string | null;
  status: "OPEN" | "FULFILLED";
  requested_by_user_id: number | null;
  requested_at: string;
  fulfilled_at: string | null;
};

export function listDocuments(shipmentId: number) {
  const db = getDb();
  return queryAll<DocumentRow>(
    `
      SELECT *
      FROM documents
      WHERE shipment_id = ?
      ORDER BY uploaded_at DESC
      LIMIT 200
    `,
    [shipmentId],
    db,
  );
}

export function getDocument(documentId: number) {
  const db = getDb();
  return queryOne<DocumentRow>(
    "SELECT * FROM documents WHERE id = ? LIMIT 1",
    [documentId],
    db,
  );
}

export function updateDocumentFlags(input: {
  documentId: number;
  isRequired?: boolean;
  isReceived?: boolean;
  shareWithCustomer?: boolean;
}) {
  const db = getDb();
  const doc = queryOne<{
    is_required: 0 | 1;
    is_received: 0 | 1;
    share_with_customer: 0 | 1;
  }>("SELECT is_required, is_received, share_with_customer FROM documents WHERE id = ? LIMIT 1", [input.documentId], db);
  if (!doc) return;

  execute(
    `
      UPDATE documents
      SET is_required = ?, is_received = ?, share_with_customer = ?
      WHERE id = ?
    `,
    [
      input.isRequired === undefined ? doc.is_required : input.isRequired ? 1 : 0,
      input.isReceived === undefined ? doc.is_received : input.isReceived ? 1 : 0,
      input.shareWithCustomer === undefined
        ? doc.share_with_customer
        : input.shareWithCustomer
          ? 1
          : 0,
      input.documentId,
    ],
    db,
  );
}

export function createDocumentRequest(input: {
  shipmentId: number;
  documentType: DocumentType | string;
  message?: string | null;
  requestedByUserId?: number | null;
}) {
  const db = getDb();
  const ts = nowIso();
  const result = execute(
    `
      INSERT INTO document_requests (
        shipment_id, document_type, message, status, requested_by_user_id, requested_at, fulfilled_at
      )
      VALUES (?, ?, ?, 'OPEN', ?, ?, NULL)
    `,
    [
      input.shipmentId,
      input.documentType,
      input.message ?? null,
      input.requestedByUserId ?? null,
      ts,
    ],
    db,
  );
  return result.lastInsertRowid;
}

export function listDocumentRequests(shipmentId: number) {
  const db = getDb();
  return queryAll<DocumentRequestRow>(
    `
      SELECT *
      FROM document_requests
      WHERE shipment_id = ?
      ORDER BY requested_at DESC
      LIMIT 200
    `,
    [shipmentId],
    db,
  );
}

export function markDocumentRequestFulfilled(requestId: number) {
  const db = getDb();
  execute(
    `
      UPDATE document_requests
      SET status = 'FULFILLED', fulfilled_at = ?
      WHERE id = ?
    `,
    [nowIso(), requestId],
    db,
  );
}

export function addDocument(input: {
  shipmentId: number;
  documentType: DocumentType | string;
  fileName: string;
  storagePath: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  isRequired?: boolean;
  isReceived?: boolean;
  shareWithCustomer?: boolean;
  source: "STAFF" | "CUSTOMER";
  documentRequestId?: number | null;
  uploadedByUserId?: number | null;
}) {
  const db = getDb();
  const result = execute(
    `
      INSERT INTO documents (
        shipment_id,
        file_name,
        storage_path,
        mime_type,
        size_bytes,
        document_type,
        is_required,
        is_received,
        share_with_customer,
        source,
        document_request_id,
        uploaded_by_user_id,
        uploaded_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.shipmentId,
      input.fileName,
      input.storagePath,
      input.mimeType ?? null,
      input.sizeBytes ?? null,
      input.documentType,
      input.isRequired ? 1 : 0,
      input.isReceived === false ? 0 : 1,
      input.shareWithCustomer ? 1 : 0,
      input.source,
      input.documentRequestId ?? null,
      input.uploadedByUserId ?? null,
      nowIso(),
    ],
    db,
  );
  return result.lastInsertRowid;
}

