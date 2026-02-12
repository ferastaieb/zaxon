"use client";

import { useMemo, useState } from "react";

import type { FtlStepData } from "../types";
import {
  boolValue,
  fieldName,
  fieldRemoveName,
  numberValue,
  stringValue,
  toGroupRows,
} from "../fieldNames";
import { SectionFrame } from "./SectionFrame";

type ImportRow = {
  import_shipment_reference: string;
  client_number: string;
  import_boe_number: string;
  processed_available: boolean;
  non_physical_stock: boolean;
  imported_weight: string;
  imported_quantity: string;
  package_type: string;
  cargo_description: string;
  allocated_weight: string;
  allocated_quantity: string;
  remarks: string;
};

type Props = {
  step: FtlStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
};

function emptyRow(): ImportRow {
  return {
    import_shipment_reference: "",
    client_number: "",
    import_boe_number: "",
    processed_available: false,
    non_physical_stock: false,
    imported_weight: "",
    imported_quantity: "",
    package_type: "",
    cargo_description: "",
    allocated_weight: "",
    allocated_quantity: "",
    remarks: "",
  };
}

function mapRow(source: Record<string, unknown>): ImportRow {
  return {
    import_shipment_reference: stringValue(source.import_shipment_reference),
    client_number: stringValue(source.client_number),
    import_boe_number: stringValue(source.import_boe_number),
    processed_available: boolValue(source.processed_available),
    non_physical_stock: boolValue(source.non_physical_stock),
    imported_weight: stringValue(source.imported_weight),
    imported_quantity: stringValue(source.imported_quantity),
    package_type: stringValue(source.package_type),
    cargo_description: stringValue(source.cargo_description),
    allocated_weight: stringValue(source.allocated_weight),
    allocated_quantity: stringValue(source.allocated_quantity),
    remarks: stringValue(source.remarks),
  };
}

export function ImportShipmentSelectionStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
}: Props) {
  const initialRows = toGroupRows(step.values, "import_shipments").map(mapRow);
  const [rows, setRows] = useState<ImportRow[]>(initialRows.length ? initialRows : [emptyRow()]);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState(step.notes ?? "");
  const disableEdit = !canEdit;

  const updateRow = (index: number, patch: Partial<ImportRow>) => {
    setRows((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const visibleIndexes = useMemo(
    () => rows.map((_, index) => index).filter((index) => !removed.has(index)),
    [rows, removed],
  );

  const filteredIndexes = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return visibleIndexes;
    return visibleIndexes.filter((index) => {
      const row = rows[index];
      return (
        row.import_shipment_reference.toLowerCase().includes(needle) ||
        row.client_number.toLowerCase().includes(needle) ||
        row.import_boe_number.toLowerCase().includes(needle)
      );
    });
  }, [rows, search, visibleIndexes]);

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title="Import Shipment Selection"
        description="Link one or more import shipments, allocate export quantity/weight, and monitor remaining balances."
        status={step.status}
        canEdit={canEdit}
        saveLabel="Save import references"
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by shipment number, client number, or BOE number"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
            disabled={disableEdit}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
          >
            Add import shipment
          </button>
        </div>

        {filteredIndexes.map((index) => {
          const row = rows[index];
          const importedWeight = numberValue(row.imported_weight, 0);
          const importedQuantity = numberValue(row.imported_quantity, 0);
          const allocatedWeight = numberValue(row.allocated_weight, 0);
          const allocatedQuantity = numberValue(row.allocated_quantity, 0);
          const remainingWeight = importedWeight - allocatedWeight;
          const remainingQuantity = importedQuantity - allocatedQuantity;
          const overallocated = remainingWeight < 0 || remainingQuantity < 0;

          return (
            <div key={`import-${index}`} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-zinc-900">
                  Import reference #{index + 1}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setRemoved((prev) => {
                      const next = new Set(prev);
                      next.add(index);
                      return next;
                    })
                  }
                  disabled={disableEdit}
                  className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                >
                  Remove
                </button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <input
                  name={fieldName(["import_shipments", String(index), "import_shipment_reference"])}
                  value={row.import_shipment_reference}
                  onChange={(event) =>
                    updateRow(index, { import_shipment_reference: event.target.value })
                  }
                  placeholder="Import shipment number"
                  disabled={disableEdit}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                />
                <input
                  name={fieldName(["import_shipments", String(index), "client_number"])}
                  value={row.client_number}
                  onChange={(event) => updateRow(index, { client_number: event.target.value })}
                  placeholder="Client number"
                  disabled={disableEdit}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                />
                <input
                  name={fieldName(["import_shipments", String(index), "import_boe_number"])}
                  value={row.import_boe_number}
                  onChange={(event) => updateRow(index, { import_boe_number: event.target.value })}
                  placeholder="Import BOE number"
                  disabled={disableEdit}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                  <input
                    type="hidden"
                    name={fieldName(["import_shipments", String(index), "processed_available"])}
                    value=""
                  />
                  <input
                    type="checkbox"
                    name={fieldName(["import_shipments", String(index), "processed_available"])}
                    value="1"
                    checked={row.processed_available}
                    onChange={(event) =>
                      updateRow(index, { processed_available: event.target.checked })
                    }
                    disabled={disableEdit}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  <span>Processed / available</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                  <input
                    type="hidden"
                    name={fieldName(["import_shipments", String(index), "non_physical_stock"])}
                    value=""
                  />
                  <input
                    type="checkbox"
                    name={fieldName(["import_shipments", String(index), "non_physical_stock"])}
                    value="1"
                    checked={row.non_physical_stock}
                    onChange={(event) =>
                      updateRow(index, { non_physical_stock: event.target.checked })
                    }
                    disabled={disableEdit}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  <span>Non-physical stock</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  name={fieldName(["import_shipments", String(index), "imported_weight"])}
                  value={row.imported_weight}
                  onChange={(event) => updateRow(index, { imported_weight: event.target.value })}
                  placeholder="Imported weight"
                  disabled={disableEdit}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                />
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  name={fieldName(["import_shipments", String(index), "imported_quantity"])}
                  value={row.imported_quantity}
                  onChange={(event) => updateRow(index, { imported_quantity: event.target.value })}
                  placeholder="Imported quantity"
                  disabled={disableEdit}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input
                  name={fieldName(["import_shipments", String(index), "package_type"])}
                  value={row.package_type}
                  onChange={(event) => updateRow(index, { package_type: event.target.value })}
                  placeholder="Cargo package type"
                  disabled={disableEdit}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                />
                <input
                  name={fieldName(["import_shipments", String(index), "cargo_description"])}
                  value={row.cargo_description}
                  onChange={(event) => updateRow(index, { cargo_description: event.target.value })}
                  placeholder="Cargo description"
                  disabled={disableEdit}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100 sm:col-span-2"
                />
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  name={fieldName(["import_shipments", String(index), "allocated_weight"])}
                  value={row.allocated_weight}
                  onChange={(event) => updateRow(index, { allocated_weight: event.target.value })}
                  placeholder="Allocated weight"
                  disabled={disableEdit}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                />
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  name={fieldName(["import_shipments", String(index), "allocated_quantity"])}
                  value={row.allocated_quantity}
                  onChange={(event) =>
                    updateRow(index, { allocated_quantity: event.target.value })
                  }
                  placeholder="Allocated quantity"
                  disabled={disableEdit}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                />
              </div>

              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                Remaining stock: {remainingWeight} weight / {remainingQuantity} quantity
                {overallocated ? (
                  <span className="ml-2 font-semibold text-amber-700">
                    Warning: allocation exceeds remaining balance.
                  </span>
                ) : null}
                {!row.processed_available ? (
                  <span className="ml-2 font-semibold text-amber-700">
                    Warning: shipment not marked processed/available.
                  </span>
                ) : null}
              </div>

              <textarea
                name={fieldName(["import_shipments", String(index), "remarks"])}
                value={row.remarks}
                onChange={(event) => updateRow(index, { remarks: event.target.value })}
                placeholder="Optional remarks"
                disabled={disableEdit}
                className="mt-3 min-h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
              />
            </div>
          );
        })}

        {Array.from(removed.values()).map((index) => (
          <input
            key={`remove-${index}`}
            type="hidden"
            name={fieldRemoveName(["import_shipments", String(index)])}
            value="1"
          />
        ))}

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Notes</div>
          <textarea
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={disableEdit}
            className="min-h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
        </label>
      </SectionFrame>
    </form>
  );
}

