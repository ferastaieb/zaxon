"use client";

import { useMemo, useState } from "react";

import { encodeFieldPath, stepFieldDocType } from "@/lib/stepFields";
import { IMPORT_TRANSFER_BOE_PREPARED_BY } from "@/lib/importTransferOwnership/constants";
import type {
  ImportTransferDocumentMeta,
  ImportTransferStepData,
} from "../types";
import { boolValue, fieldName, stringValue, toRecord } from "../fieldNames";
import { SectionFrame } from "@/components/shipments/ftl-export/forms/SectionFrame";
import { DatePickerInput } from "@/components/ui/DatePickerInput";

type Props = {
  step: ImportTransferStepData;
  latestDocsByType: Record<string, ImportTransferDocumentMeta>;
  updateAction: (formData: FormData) => void;
  deleteDocumentAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  isAdmin: boolean;
};

function docKey(stepId: number, path: string[]) {
  return stepFieldDocType(stepId, encodeFieldPath(path));
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export function DocumentsBoeStepForm({
  step,
  latestDocsByType,
  updateAction,
  deleteDocumentAction,
  returnTo,
  canEdit,
  isAdmin,
}: Props) {
  const values = toRecord(step.values);
  const [tab, setTab] = useState<"documents" | "boe">("documents");
  const [singleBundle, setSingleBundle] = useState(
    boolValue(values.single_documents_bundle),
  );

  const docs = useMemo(
    () => ({
      transferOwnershipLetter: latestDocsByType[docKey(step.id, ["transfer_ownership_letter"])],
      deliveryAdvice: latestDocsByType[docKey(step.id, ["delivery_advice"])],
      commercialInvoice: latestDocsByType[docKey(step.id, ["commercial_invoice"])],
      packingList: latestDocsByType[docKey(step.id, ["packing_list"])],
      singleBundleUpload: latestDocsByType[docKey(step.id, ["single_documents_bundle_upload"])],
      boeUpload: latestDocsByType[docKey(step.id, ["boe_upload"])],
    }),
    [latestDocsByType, step.id],
  );

  const mandatoryDocumentsDone =
    (singleBundle && !!docs.singleBundleUpload) ||
    (!!docs.transferOwnershipLetter && !!docs.deliveryAdvice && !!docs.commercialInvoice);

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title="Documents and BOE"
        description="Upload mandatory ownership documents and complete customs BOE declaration."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        lockOnDone={false}
        saveLabel="Save documents and BOE"
        before={
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            Document status:{" "}
            <span
              className={`font-semibold ${
                mandatoryDocumentsDone ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {mandatoryDocumentsDone ? "Done" : "Pending"}
            </span>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("documents")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === "documents"
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Documents
          </button>
          <button
            type="button"
            onClick={() => setTab("boe")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === "boe"
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            BOE
          </button>
        </div>

        {tab === "documents" ? (
          <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-sm text-blue-900 md:col-span-2">
              <input type="hidden" name={fieldName(["single_documents_bundle"])} value="" />
              <input
                type="checkbox"
                name={fieldName(["single_documents_bundle"])}
                value="1"
                checked={singleBundle}
                onChange={(event) => setSingleBundle(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900"
              />
              <span>
                Use one supplier file for all required documents. When selected, the separate
                supplier document fields are no longer mandatory.
              </span>
            </label>
            {singleBundle ? (
              <div className="space-y-1 rounded-lg border border-zinc-200 bg-white p-3 md:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                  Combined supplier documents file *
                </div>
                <input type="file" name={fieldName(["single_documents_bundle_upload"])} />
                <FileMeta
                  meta={docs.singleBundleUpload}
                  canEdit={canEdit}
                  deleteDocumentAction={deleteDocumentAction}
                />
              </div>
            ) : null}
            <div className="space-y-1 rounded-lg border border-zinc-200 bg-white p-3 md:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Transfer of ownership letter {singleBundle ? "(optional)" : "*"}
              </div>
              <input type="file" name={fieldName(["transfer_ownership_letter"])} />
              <FileMeta
                meta={docs.transferOwnershipLetter}
                canEdit={canEdit}
                deleteDocumentAction={deleteDocumentAction}
              />
            </div>
            <div className="space-y-1 rounded-lg border border-zinc-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Delivery advice {singleBundle ? "(optional)" : "*"}
              </div>
              <input type="file" name={fieldName(["delivery_advice"])} />
              <FileMeta
                meta={docs.deliveryAdvice}
                canEdit={canEdit}
                deleteDocumentAction={deleteDocumentAction}
              />
            </div>
            <div className="space-y-1 rounded-lg border border-zinc-200 bg-white p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Commercial invoice {singleBundle ? "(optional)" : "*"}
              </div>
              <input type="file" name={fieldName(["commercial_invoice"])} />
              <FileMeta
                meta={docs.commercialInvoice}
                canEdit={canEdit}
                deleteDocumentAction={deleteDocumentAction}
              />
            </div>
            <div className="space-y-1 rounded-lg border border-zinc-200 bg-white p-3 md:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                Packing list (optional)
              </div>
              <input type="file" name={fieldName(["packing_list"])} />
              <FileMeta
                meta={docs.packingList}
                canEdit={canEdit}
                deleteDocumentAction={deleteDocumentAction}
              />
            </div>
          </div>
        ) : null}

        {tab === "boe" ? (
          <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                BOE prepared by *
              </div>
              <select
                name={fieldName(["boe_prepared_by"])}
                defaultValue={stringValue(values.boe_prepared_by) || "ZAXON"}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              >
                {IMPORT_TRANSFER_BOE_PREPARED_BY.map((option) => (
                  <option key={option} value={option}>
                    {option === "ZAXON" ? "Zaxon" : "Supplier"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                BOE number *
              </div>
              <input
                name={fieldName(["boe_number"])}
                defaultValue={stringValue(values.boe_number)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                placeholder="Enter BOE number"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                BOE date *
              </div>
              <DatePickerInput
                
                name={fieldName(["boe_date"])}
                defaultValue={stringValue(values.boe_date)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
               />
            </label>
            <div className="space-y-1 rounded-lg border border-zinc-200 bg-white p-3 md:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                BOE upload *
              </div>
              <input type="file" name={fieldName(["boe_upload"])} />
              <FileMeta
                meta={docs.boeUpload}
                canEdit={canEdit}
                deleteDocumentAction={deleteDocumentAction}
              />
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 md:col-span-2">
              BOE can be completed before, during, or after collection. Shipment completion still requires BOE done.
            </div>
          </div>
        ) : null}
      </SectionFrame>
    </form>
  );
}

function FileMeta({
  meta,
  canEdit,
  deleteDocumentAction,
}: {
  meta?: ImportTransferDocumentMeta;
  canEdit: boolean;
  deleteDocumentAction: (formData: FormData) => void;
}) {
  if (!meta) {
    return <div className="text-xs text-zinc-500">No upload yet.</div>;
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
      <span>
        Latest:{" "}
        <a
          href={`/api/documents/${meta.id}`}
          className="font-medium text-zinc-700 underline-offset-2 hover:underline"
        >
          {meta.file_name}
        </a>{" "}
        ({formatDate(meta.uploaded_at)})
      </span>
      {canEdit ? (
        <button
          type="submit"
          formAction={deleteDocumentAction}
          name="documentId"
          value={String(meta.id)}
          className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Delete file
        </button>
      ) : null}
    </div>
  );
}

