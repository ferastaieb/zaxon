import "server-only";

import type { DocumentType } from "@/lib/domain";
import { getItem, nowIso, nextId, putItem, scanAll, tableName, updateItem } from "@/lib/db";

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

const DOCUMENTS_TABLE = tableName("documents");
const DOCUMENT_REQUESTS_TABLE = tableName("document_requests");

export async function listDocuments(shipmentId: number): Promise<DocumentRow[]> {
  const docs = await scanAll<DocumentRow>(DOCUMENTS_TABLE);
  return docs
    .filter((doc) => doc.shipment_id === shipmentId)
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    .slice(0, 200);
}

export async function getDocument(documentId: number): Promise<DocumentRow | null> {
  return await getItem<DocumentRow>(DOCUMENTS_TABLE, { id: documentId });
}

export async function updateDocumentFlags(input: {
  documentId: number;
  isRequired?: boolean;
  isReceived?: boolean;
  shareWithCustomer?: boolean;
}) {
  const doc = await getDocument(input.documentId);
  if (!doc) return;

  const nextRequired =
    input.isRequired === undefined ? doc.is_required : input.isRequired ? 1 : 0;
  const nextReceived =
    input.isReceived === undefined ? doc.is_received : input.isReceived ? 1 : 0;
  const nextShare =
    input.shareWithCustomer === undefined
      ? doc.share_with_customer
      : input.shareWithCustomer
        ? 1
        : 0;

  await updateItem<DocumentRow>(
    DOCUMENTS_TABLE,
    { id: input.documentId },
    "SET is_required = :is_required, is_received = :is_received, share_with_customer = :share",
    {
      ":is_required": nextRequired,
      ":is_received": nextReceived,
      ":share": nextShare,
    },
  );
}

export async function createDocumentRequest(input: {
  shipmentId: number;
  documentType: DocumentType | string;
  message?: string | null;
  requestedByUserId?: number | null;
}) {
  const ts = nowIso();
  const id = await nextId("document_requests");
  await putItem(DOCUMENT_REQUESTS_TABLE, {
    id,
    shipment_id: input.shipmentId,
    document_type: input.documentType,
    message: input.message ?? null,
    status: "OPEN",
    requested_by_user_id: input.requestedByUserId ?? null,
    requested_at: ts,
    fulfilled_at: null,
  });
  return id;
}

export async function listDocumentRequests(shipmentId: number): Promise<DocumentRequestRow[]> {
  const requests = await scanAll<DocumentRequestRow>(DOCUMENT_REQUESTS_TABLE);
  return requests
    .filter((request) => request.shipment_id === shipmentId)
    .sort((a, b) => b.requested_at.localeCompare(a.requested_at))
    .slice(0, 200);
}

export async function markDocumentRequestFulfilled(requestId: number) {
  await updateItem<DocumentRequestRow>(
    DOCUMENT_REQUESTS_TABLE,
    { id: requestId },
    "SET #status = :status, fulfilled_at = :fulfilled_at",
    {
      ":status": "FULFILLED",
      ":fulfilled_at": nowIso(),
    },
    { "#status": "status" },
  );
}

export async function addDocument(input: {
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
  const id = await nextId("documents");
  await putItem(DOCUMENTS_TABLE, {
    id,
    shipment_id: input.shipmentId,
    file_name: input.fileName,
    storage_path: input.storagePath,
    mime_type: input.mimeType ?? null,
    size_bytes: input.sizeBytes ?? null,
    document_type: input.documentType,
    is_required: input.isRequired ? 1 : 0,
    is_received: input.isReceived === false ? 0 : 1,
    share_with_customer: input.shareWithCustomer ? 1 : 0,
    source: input.source,
    document_request_id: input.documentRequestId ?? null,
    uploaded_by_user_id: input.uploadedByUserId ?? null,
    uploaded_at: nowIso(),
  });
  return id;
}
