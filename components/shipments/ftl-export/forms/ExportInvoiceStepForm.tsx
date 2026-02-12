"use client";

import { useState } from "react";

import { encodeFieldPath, stepFieldDocType } from "@/lib/stepFields";
import type { FtlDocumentMeta, FtlStepData } from "../types";
import { boolValue, fieldName, stringValue } from "../fieldNames";
import { SectionFrame } from "./SectionFrame";

type Props = {
  step: FtlStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  canFinalizeInvoice: boolean;
  latestDocsByType: Record<string, FtlDocumentMeta>;
};

export function ExportInvoiceStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  canFinalizeInvoice,
  latestDocsByType,
}: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState(stringValue(step.values.invoice_number));
  const [invoiceDate, setInvoiceDate] = useState(stringValue(step.values.invoice_date));
  const [invoiceFinalized, setInvoiceFinalized] = useState(boolValue(step.values.invoice_finalized));
  const [invoiceRemarks, setInvoiceRemarks] = useState(stringValue(step.values.invoice_remarks));
  const [notes, setNotes] = useState(step.notes ?? "");

  const invoiceDocType = stepFieldDocType(step.id, encodeFieldPath(["invoice_upload"]));
  const invoiceDoc = latestDocsByType[invoiceDocType];
  const disableForm = !canEdit || !canFinalizeInvoice;

  return (
    <form action={updateAction} encType="multipart/form-data">
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title="Export Invoice"
        description="This section is active only after loading is done and all referenced imports are available."
        status={step.status}
        canEdit={canEdit}
        disabled={!canFinalizeInvoice}
        disabledMessage={
          !canFinalizeInvoice
            ? "Complete loading and import shipment readiness before creating/finalizing the export invoice."
            : undefined
        }
        saveLabel="Save export invoice"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Invoice number *</div>
            <input
              type="text"
              name={fieldName(["invoice_number"])}
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              required={canFinalizeInvoice}
              disabled={disableForm}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Invoice date *</div>
            <input
              type="date"
              name={fieldName(["invoice_date"])}
              value={invoiceDate}
              onChange={(event) => setInvoiceDate(event.target.value)}
              required={canFinalizeInvoice}
              disabled={disableForm}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>
        </div>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Invoice upload *</div>
          <input
            type="file"
            name={fieldName(["invoice_upload"])}
            required={canFinalizeInvoice && !invoiceDoc}
            disabled={disableForm}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs disabled:bg-zinc-100"
          />
          <div className="mt-1 text-xs text-zinc-500">
            {invoiceDoc ? (
              <a href={`/api/documents/${invoiceDoc.id}`} className="hover:underline">
                Download latest invoice file
              </a>
            ) : (
              "No invoice file uploaded yet."
            )}
          </div>
        </label>

        <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
          <input type="hidden" name={fieldName(["invoice_finalized"])} value="" />
          <input
            type="checkbox"
            name={fieldName(["invoice_finalized"])}
            value="1"
            checked={invoiceFinalized}
            onChange={(event) => setInvoiceFinalized(event.target.checked)}
            disabled={disableForm}
            className="h-4 w-4 rounded border-zinc-300"
          />
          <span>Finalized</span>
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Invoice remarks</div>
          <textarea
            name={fieldName(["invoice_remarks"])}
            value={invoiceRemarks}
            onChange={(event) => setInvoiceRemarks(event.target.value)}
            disabled={disableForm}
            className="min-h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Notes</div>
          <textarea
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={disableForm}
            className="min-h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
        </label>
      </SectionFrame>
    </form>
  );
}

