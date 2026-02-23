"use client";

import { useState } from "react";

import { AppIllustration } from "@/components/ui/AppIllustration";
import { SubmitButton } from "@/components/ui/SubmitButton";
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
  prerequisiteMessage?: string;
  latestDocsByType: Record<string, FtlDocumentMeta>;
};

export function ExportInvoiceStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  isAdmin,
  canFinalizeInvoice,
  prerequisiteMessage,
  latestDocsByType,
}: Props) {
  const [invoiceNumber, setInvoiceNumber] = useState(stringValue(step.values.invoice_number));
  const [invoiceDate, setInvoiceDate] = useState(stringValue(step.values.invoice_date));
  const [invoiceFinalized, setInvoiceFinalized] = useState(
    boolValue(step.values.invoice_finalized),
  );

  const invoiceDocType = stepFieldDocType(step.id, encodeFieldPath(["invoice_upload"]));
  const invoiceDoc = latestDocsByType[invoiceDocType];
  const disableForm = !canEdit || !canFinalizeInvoice;
  const lockInputClass = invoiceFinalized
    ? "bg-zinc-100 text-zinc-700"
    : "bg-white text-zinc-900";

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input
        type="hidden"
        name={fieldName(["invoice_number"])}
        value={invoiceNumber}
      />
      <input
        type="hidden"
        name={fieldName(["invoice_date"])}
        value={invoiceDate}
      />
      <SectionFrame
        title="Export Invoice"
        description="This section is active only after loading is done, linked imports are available, and truck details are complete."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        disabled={!canFinalizeInvoice}
        disabledMessage={
          !canFinalizeInvoice
            ? prerequisiteMessage ??
              "Complete loading and import shipment readiness before creating/finalizing the export invoice."
            : undefined
        }
        saveLabel="Save export invoice"
      >
        <input
          type="hidden"
          name={fieldName(["invoice_finalized"])}
          value={invoiceFinalized ? "1" : ""}
        />
        <input type="hidden" name="notes" value="" />

        <div className="relative rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          {invoiceFinalized ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rotate-[-8deg] rounded-md border-4 border-red-400/70 px-6 py-2 text-3xl font-bold uppercase tracking-[0.16em] text-red-500/70">
                Finalized
              </div>
            </div>
          ) : null}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-[0.16em] text-zinc-600">
              Invoice approval
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!invoiceFinalized ? (
                <span className="text-[11px] text-zinc-500">
                  Confirm &amp; Finalize saves automatically.
                </span>
              ) : null}
              {!invoiceFinalized ? (
                <SubmitButton
                  type="submit"
                  name="finalizeInvoice"
                  value="1"
                  pendingLabel="Finalizing..."
                  disabled={disableForm}
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-red-700 hover:bg-red-100 disabled:bg-zinc-100 disabled:text-zinc-400"
                >
                  Confirm & Finalize
                </SubmitButton>
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
                <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-2 text-center">
                  <AppIllustration
                    name="empty-no-documents"
                    alt="No documents uploaded"
                    width={300}
                    height={140}
                    className="mx-auto h-20 w-full max-w-xs"
                  />
                  <div className="mt-1">No invoice file uploaded yet.</div>
                </div>
              )}
            </div>
          </label>
        </div>

      </SectionFrame>
    </form>
  );
}
