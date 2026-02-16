"use client";

import { useState } from "react";

import type { ImportTransferStepData } from "../types";
import { fieldName, stringValue, numberValue, toRecord } from "../fieldNames";
import { SectionFrame } from "@/components/shipments/ftl-export/forms/SectionFrame";

type Props = {
  step: ImportTransferStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  isAdmin: boolean;
};

const PACKAGE_TYPE_OPTIONS = [
  "Pallets",
  "Cartons",
  "Packages",
  "Vehicles",
  "Machinery",
  "Other",
];

export function PartiesCargoStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  isAdmin,
}: Props) {
  const values = toRecord(step.values);
  const [tab, setTab] = useState<"supplier" | "cargo">("supplier");

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title="Parties and Cargo"
        description="Capture supplier party details and baseline cargo quantities."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        saveLabel="Save parties and cargo"
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("supplier")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === "supplier"
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Supplier information
          </button>
          <button
            type="button"
            onClick={() => setTab("cargo")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === "cargo"
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Cargo summary
          </button>
        </div>

        {tab === "supplier" ? (
          <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                Supplier company name *
              </div>
              <input
                name={fieldName(["supplier_company_name"])}
                defaultValue={stringValue(values.supplier_company_name)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                placeholder="Enter supplier company name"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                Supplier location / address *
              </div>
              <input
                name={fieldName(["supplier_location"])}
                defaultValue={stringValue(values.supplier_location)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                placeholder="Enter supplier location"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                Supplier contact person *
              </div>
              <input
                name={fieldName(["supplier_contact_person"])}
                defaultValue={stringValue(values.supplier_contact_person)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                placeholder="Enter contact person"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                Supplier contact number/email
              </div>
              <input
                name={fieldName(["supplier_contact_details"])}
                defaultValue={stringValue(values.supplier_contact_details)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                placeholder="Optional contact details"
              />
            </label>
          </div>
        ) : null}

        {tab === "cargo" ? (
          <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                Cargo description
              </div>
              <input
                name={fieldName(["cargo_description"])}
                defaultValue={stringValue(values.cargo_description)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                placeholder="Optional cargo description"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                Package type *
              </div>
              <input
                name={fieldName(["package_type"])}
                defaultValue={stringValue(values.package_type)}
                list={`package-type-options-${step.id}`}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                placeholder="Select or type package type"
              />
              <datalist id={`package-type-options-${step.id}`}>
                {PACKAGE_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                Quantity *
              </div>
              <input
                type="number"
                min={0}
                step="0.01"
                name={fieldName(["quantity"])}
                defaultValue={numberValue(values.quantity, 0) || ""}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                placeholder="Enter quantity"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                Total weight *
              </div>
              <input
                type="number"
                min={0}
                step="0.01"
                name={fieldName(["total_weight"])}
                defaultValue={numberValue(values.total_weight, 0) || ""}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                placeholder="Enter total weight"
              />
            </label>
            <label className="block md:col-span-2">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                Remarks
              </div>
              <textarea
                name={fieldName(["remarks"])}
                defaultValue={stringValue(values.remarks)}
                className="min-h-24 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                placeholder="Optional notes"
              />
            </label>
          </div>
        ) : null}
      </SectionFrame>
    </form>
  );
}
