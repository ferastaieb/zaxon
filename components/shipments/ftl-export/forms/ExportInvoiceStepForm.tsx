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
  isAdmin: boolean;
  canFinalizeInvoice: boolean;
  latestDocsByType: Record<string, FtlDocumentMeta>;
};

export function ExportInvoiceStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  isAdmin,
  canFinalizeInvoice,
  latestDocsByType,
}: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState(stringValue(step.values.invoice_number));
  const [invoiceDate, setInvoiceDate] = useState(stringValue(step.values.invoice_date));
  const [invoiceFinalized, setInvoiceFinalized] = useState(
    boolValue(step.values.invoice_finalized),
  );
  const [stampPulse, setStampPulse] = useState(false);
  const [invoiceRemarks, setInvoiceRemarks] = useState(stringValue(step.values.invoice_remarks));
  const [notes, setNotes] = useState(step.notes ?? "");

  const invoiceDocType = stepFieldDocType(step.id, encodeFieldPath(["invoice_upload"]));
  const invoiceDoc = latestDocsByType[invoiceDocType];
  const disableForm = !canEdit || !canFinalizeInvoice;
  const lockInputClass = invoiceFinalized
    ? "bg-zinc-100 text-zinc-700"
    : "bg-white text-zinc-900";

  return (
    <form action={updateAction} encType="multipart/form-data">
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title="Export Invoice"
        description="This section is active only after loading is done and all referenced imports are available."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        disabled={!canFinalizeInvoice}
        disabledMessage={
          !canFinalizeInvoice
            ? "Complete loading and import shipment readiness before creating/finalizing the export invoice."
            : undefined
        }
        saveLabel="Save export invoice"
      >
        <style jsx>{`
          .stamp-pop {
            animation: stamp-pop 0.36s ease-out;
          }
          @keyframes stamp-pop {
            0% {
              transform: scale(0.7) rotate(-8deg);
              opacity: 0;
            }
            100% {
              transform: scale(1) rotate(-8deg);
              opacity: 1;
            }
          }
        `}</style>

        <input
          type="hidden"
          name={fieldName(["invoice_finalized"])}
          value={invoiceFinalized ? "1" : ""}
        />

        <div className="relative rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          {invoiceFinalized ? (
            <div
              className={`pointer-events-none absolute inset-0 flex items-center justify-center ${
                stampPulse ? "stamp-pop" : ""
              }`}
            >
              <div className="rotate-[-8deg] rounded-md border-4 border-red-400/70 px-6 py-2 text-3xl font-bold uppercase tracking-[0.16em] text-red-500/70">
                Finalized
              </div>
            </div>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-[0.16em] text-zinc-600">
              Invoice approval
            </div>
            <div className="flex flex-wrap gap-2">
              {!invoiceFinalized ? (
                <button
                  type="submit"
                  name="finalizeInvoice"
                  value="1"
                  onClick={() => {
                    setInvoiceFinalized(true);
                    setStampPulse(true);
                    setTimeout(() => setStampPulse(false), 400);
                  }}
                  disabled={disableForm}
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-red-700 hover:bg-red-100 disabled:bg-zinc-100 disabled:text-zinc-400"
                >
                  Confirm & Finalize
                </button>
              ) : null}
              {invoiceFinalized && isAdmin ? (
                <button
                  type="button"
                  onClick={() => setInvoiceFinalized(false)}
                  disabled={disableForm}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                >
                  Unlock (Admin)
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">
                Invoice number * {invoiceFinalized ? "🔒 LOCKED" : ""}
              </div>
              <input
                type="text"
                name={fieldName(["invoice_number"])}
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                disabled={disableForm}
                className={`w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100 ${lockInputClass}`}
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">
                Invoice date * {invoiceFinalized ? "🔒 LOCKED" : ""}
              </div>
              <input
                type="date"
                name={fieldName(["invoice_date"])}
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
                disabled={disableForm}
                className={`w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100 ${lockInputClass}`}
              />
            </label>
          </div>

          <label className="mt-3 block">
            <div className="mb-1 text-xs font-medium text-zinc-600">
              Invoice upload * {invoiceFinalized ? "🔒 LOCKED" : ""}
            </div>
            <input
              type="file"
              name={fieldName(["invoice_upload"])}
              disabled={disableForm}
              className={`w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs disabled:bg-zinc-100 ${lockInputClass}`}
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
        </div>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">
            Invoice remarks {invoiceFinalized ? "🔒 LOCKED" : ""}
          </div>
          <textarea
            name={fieldName(["invoice_remarks"])}
            value={invoiceRemarks}
            onChange={(event) => setInvoiceRemarks(event.target.value)}
            disabled={disableForm}
            className={`min-h-20 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100 ${lockInputClass}`}
          />
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">
            Notes {invoiceFinalized ? "🔒 LOCKED" : ""}
          </div>
          <textarea
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={disableForm}
            className={`min-h-20 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100 ${lockInputClass}`}
          />
        </label>
      </SectionFrame>
    </form>
  );
}
