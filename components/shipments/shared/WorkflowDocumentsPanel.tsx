"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { SubmitButton } from "@/components/ui/SubmitButton";

type WorkflowDocument = {
  id: number;
  document_type: string;
  file_name: string;
  uploaded_at: string;
  source: "STAFF" | "CUSTOMER";
  is_required: 0 | 1;
  is_received: 0 | 1;
  share_with_customer: 0 | 1;
  review_status?: "PENDING" | "VERIFIED" | "REJECTED";
};

type WorkflowDocumentRequest = {
  id: number;
  document_type: string;
  status: "OPEN" | "FULFILLED";
};

type Props = {
  shipmentId: number;
  docs: WorkflowDocument[];
  docRequests: WorkflowDocumentRequest[];
  documentTypeOptions?: string[];
  canEdit: boolean;
  returnTo: string;
  uploadDocumentAction: (formData: FormData) => void;
  requestDocumentAction: (formData: FormData) => void;
  reviewDocumentAction: (formData: FormData) => void;
  updateDocumentFlagsAction: (formData: FormData) => void;
  deleteDocumentAction?: (formData: FormData) => void;
};

function humanizeToken(value: string) {
  return value
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function decodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function formatDocumentType(type: string) {
  const trimmed = String(type ?? "").trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("STEP_FIELD:")) {
    const rest = trimmed.slice("STEP_FIELD:".length);
    const separatorIndex = rest.indexOf(":");
    if (separatorIndex > 0) {
      const encodedPath = rest.slice(separatorIndex + 1);
      const pathLabel = encodedPath
        .split(".")
        .map((segment) => humanizeToken(decodePathSegment(segment)))
        .join(" / ");
      return pathLabel;
    }
  }

  return humanizeToken(trimmed);
}

function isSelectableDocType(type: string) {
  const trimmed = String(type ?? "").trim();
  if (!trimmed) return false;
  return !trimmed.startsWith("CUSTOM:");
}

function reviewTone(status: WorkflowDocument["review_status"] | undefined): "zinc" | "green" | "yellow" | "red" {
  if (status === "VERIFIED") return "green";
  if (status === "REJECTED") return "red";
  return "yellow";
}

function sourceTone(source: WorkflowDocument["source"]): "zinc" | "blue" {
  return source === "CUSTOMER" ? "blue" : "zinc";
}

type DocTypePickerProps = {
  pickerId: string;
  value: string;
  onChange: (nextValue: string) => void;
  options: string[];
  inputName: string;
  inputPlaceholder: string;
};

function DocumentTypePicker({
  pickerId,
  value,
  onChange,
  options,
  inputName,
  inputPlaceholder,
}: DocTypePickerProps) {
  const selectedPreset = options.includes(value) ? value : "__CUSTOM__";
  const isCustom = selectedPreset === "__CUSTOM__";

  return (
    <div className="space-y-2">
      <input type="hidden" name={inputName} value={value} />
      <select
        id={`${pickerId}-preset`}
        value={selectedPreset}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "__CUSTOM__") {
            if (options.includes(value)) onChange("");
            return;
          }
          if (next !== "__CUSTOM__") {
            onChange(next);
          }
        }}
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-800 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
      >
        <option value="__CUSTOM__">Other (custom document name)</option>
        {options.map((type) => (
          <option key={type} value={type}>
            {formatDocumentType(type)}
          </option>
        ))}
      </select>
      {isCustom ? (
        <div className="space-y-1">
          <label htmlFor={`${pickerId}-input`} className="block text-[11px] font-medium text-zinc-600">
            Document name
          </label>
          <input
            id={`${pickerId}-input`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required
            placeholder={inputPlaceholder}
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
          />
        </div>
      ) : null}
    </div>
  );
}

export function WorkflowDocumentsPanel({
  shipmentId,
  docs,
  docRequests,
  documentTypeOptions: providedDocumentTypeOptions,
  canEdit,
  returnTo,
  uploadDocumentAction,
  requestDocumentAction,
  reviewDocumentAction,
  updateDocumentFlagsAction,
  deleteDocumentAction,
}: Props) {
  const [uploadDocumentType, setUploadDocumentType] = useState("");
  const [requestDocumentType, setRequestDocumentType] = useState("");

  const documentTypeOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...(providedDocumentTypeOptions ?? []).map((type) => String(type)),
          ...docs.map((doc) => String(doc.document_type)),
          ...docRequests.map((request) => String(request.document_type)),
        ]),
      )
        .filter(isSelectableDocType)
        .sort((left, right) => left.localeCompare(right)),
    [docRequests, docs, providedDocumentTypeOptions],
  );

  const openRequests = docRequests.filter((request) => request.status === "OPEN");

  return (
    <aside className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-zinc-900">Documents</h3>
        <Badge tone="zinc">{docs.length}</Badge>
      </div>

      {openRequests.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Open requests: {openRequests.map((request) => `#${request.id}`).join(", ")}
        </div>
      ) : null}

      {canEdit ? (
        <form
          action={uploadDocumentAction}
          className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3"
          encType="multipart/form-data"
        >
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Upload
          </div>
          <DocumentTypePicker
            pickerId={`workflow-upload-${shipmentId}`}
            value={uploadDocumentType}
            onChange={setUploadDocumentType}
            options={documentTypeOptions}
            inputName="documentType"
            inputPlaceholder="Document name"
          />
          <input
            type="file"
            name="file"
            required
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-[11px] text-zinc-700">
              <input type="hidden" name="isRequired" value="" />
              <input type="checkbox" name="isRequired" value="1" className="h-3.5 w-3.5" />
              Required
            </label>
            <label className="flex items-center gap-2 text-[11px] text-zinc-700">
              <input type="hidden" name="shareWithCustomer" value="" />
              <input
                type="checkbox"
                name="shareWithCustomer"
                value="1"
                defaultChecked
                className="h-3.5 w-3.5"
              />
              Share
            </label>
          </div>
          <select
            name="documentRequestId"
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
          >
            <option value="">No linked request</option>
            {openRequests.map((request) => (
              <option key={request.id} value={request.id}>
                #{request.id} - {formatDocumentType(String(request.document_type))}
              </option>
            ))}
          </select>
          <SubmitButton
            pendingLabel="Uploading..."
            className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            Upload document
          </SubmitButton>
        </form>
      ) : null}

      {canEdit ? (
        <form action={requestDocumentAction} className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <input type="hidden" name="returnTo" value={returnTo} />
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Request
          </div>
          <DocumentTypePicker
            pickerId={`workflow-request-${shipmentId}`}
            value={requestDocumentType}
            onChange={setRequestDocumentType}
            options={documentTypeOptions}
            inputName="documentType"
            inputPlaceholder="Document name"
          />
          <input
            name="message"
            placeholder="Optional message"
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs shadow-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
          />
          <SubmitButton
            pendingLabel="Requesting..."
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
          >
            Request from customer
          </SubmitButton>
        </form>
      ) : null}

      <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
        {docs.map((doc) => (
          <article
            key={doc.id}
            className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50/70 p-3.5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-xs font-semibold text-zinc-900">
                  {formatDocumentType(String(doc.document_type))}
                </p>
                <p className="truncate text-[11px] text-zinc-700">{doc.file_name}</p>
                <p className="text-[11px] text-zinc-500">{new Date(doc.uploaded_at).toLocaleString()}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge tone={sourceTone(doc.source)}>{doc.source === "CUSTOMER" ? "Customer" : "Staff"}</Badge>
                <Badge tone={reviewTone(doc.review_status)}>{doc.review_status ?? "PENDING"}</Badge>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={`/api/documents/${doc.id}`}
                className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
              >
                Download
              </a>
              {canEdit && deleteDocumentAction ? (
                <form action={deleteDocumentAction}>
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="documentId" value={doc.id} />
                  <SubmitButton
                    pendingLabel="Deleting..."
                    className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700 hover:bg-red-100"
                  >
                    Delete file
                  </SubmitButton>
                </form>
              ) : null}
            </div>

            {canEdit ? (
              <div className="mt-3 space-y-3 rounded-xl border border-zinc-200 bg-white/80 p-2.5">
                <form action={updateDocumentFlagsAction} className="space-y-2">
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input type="hidden" name="documentId" value={doc.id} />
                  <div className="grid grid-cols-3 gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                    <label className="flex items-center gap-1 text-[11px] text-zinc-700">
                      <input type="hidden" name="isRequired" value="" />
                      <input
                        type="checkbox"
                        name="isRequired"
                        value="1"
                        defaultChecked={doc.is_required === 1}
                        className="h-3.5 w-3.5"
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-zinc-700">
                      <input type="hidden" name="shareWithCustomer" value="" />
                      <input
                        type="checkbox"
                        name="shareWithCustomer"
                        value="1"
                        defaultChecked={doc.share_with_customer === 1}
                        className="h-3.5 w-3.5"
                      />
                      Share
                    </label>
                    <label className="flex items-center gap-1 text-[11px] text-zinc-700">
                      <input type="hidden" name="isReceived" value="" />
                      <input
                        type="checkbox"
                        name="isReceived"
                        value="1"
                        defaultChecked={doc.is_received === 1}
                        className="h-3.5 w-3.5"
                      />
                      Received
                    </label>
                  </div>
                  <SubmitButton
                    pendingLabel="Saving..."
                    className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    Save flags
                  </SubmitButton>
                </form>

                <div className="grid grid-cols-2 gap-2">
                  <form action={reviewDocumentAction} className="min-w-0">
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <input type="hidden" name="documentId" value={doc.id} />
                    <input type="hidden" name="status" value="VERIFIED" />
                    <SubmitButton
                      pendingLabel="Saving..."
                      className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      Verify
                    </SubmitButton>
                  </form>
                  <form action={reviewDocumentAction} className="min-w-0">
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <input type="hidden" name="documentId" value={doc.id} />
                    <input type="hidden" name="status" value="REJECTED" />
                    <SubmitButton
                      pendingLabel="Saving..."
                      className="w-full rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700 hover:bg-red-100"
                    >
                      Reject
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ) : null}
          </article>
        ))}

        {docs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-xs text-zinc-600">
            No documents uploaded yet.
          </div>
        ) : null}
      </div>
    </aside>
  );
}
