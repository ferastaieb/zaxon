"use client";

import { useMemo, useState } from "react";

import type { FtlImportCandidate, FtlStepData } from "../types";
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
  source_shipment_id: string;
  import_shipment_reference: string;
  client_number: string;
  import_boe_number: string;
  processed_available: boolean;
  non_physical_stock: boolean;
  imported_weight: string;
  imported_quantity: string;
  already_allocated_weight: string;
  already_allocated_quantity: string;
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
  isAdmin: boolean;
  candidates: FtlImportCandidate[];
};

function emptyRow(): ImportRow {
  return {
    source_shipment_id: "",
    import_shipment_reference: "",
    client_number: "",
    import_boe_number: "",
    processed_available: false,
    non_physical_stock: false,
    imported_weight: "",
    imported_quantity: "",
    already_allocated_weight: "",
    already_allocated_quantity: "",
    package_type: "",
    cargo_description: "",
    allocated_weight: "",
    allocated_quantity: "",
    remarks: "",
  };
}

function mapRow(source: Record<string, unknown>): ImportRow {
  return {
    source_shipment_id: stringValue(source.source_shipment_id),
    import_shipment_reference: stringValue(source.import_shipment_reference),
    client_number: stringValue(source.client_number),
    import_boe_number: stringValue(source.import_boe_number),
    processed_available: boolValue(source.processed_available),
    non_physical_stock: boolValue(source.non_physical_stock),
    imported_weight: stringValue(source.imported_weight),
    imported_quantity: stringValue(source.imported_quantity),
    already_allocated_weight: stringValue(source.already_allocated_weight),
    already_allocated_quantity: stringValue(source.already_allocated_quantity),
    package_type: stringValue(source.package_type),
    cargo_description: stringValue(source.cargo_description),
    allocated_weight: stringValue(source.allocated_weight),
    allocated_quantity: stringValue(source.allocated_quantity),
    remarks: stringValue(source.remarks),
  };
}

function toPercent(value: number, total: number) {
  if (total <= 0) return 0;
  const pct = (value / total) * 100;
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
}

function SegmentBar({
  total,
  already,
  current,
  label,
}: {
  total: number;
  already: number;
  current: number;
  label: string;
}) {
  const safeTotal = Math.max(0, total);
  const safeAlready = Math.max(0, already);
  const available = Math.max(0, safeTotal - safeAlready);
  const safeCurrent = Math.max(0, current);
  const over = safeCurrent > available;
  const within = over ? available : safeCurrent;
  const stillAvailable = Math.max(0, available - within);
  const overflow = over ? safeCurrent - available : 0;

  return (
    <div className={`space-y-1 ${over ? "ftl-shake" : ""}`}>
      <div className="flex items-center justify-between text-[11px] text-zinc-600">
        <span>{label}</span>
        <span>
          total {safeTotal} | used {safeAlready} | this {safeCurrent}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
        <div className="flex h-full w-full">
          <div style={{ width: `${toPercent(safeAlready, safeTotal)}%` }} className="bg-zinc-500" />
          <div style={{ width: `${toPercent(stillAvailable, safeTotal)}%` }} className="bg-emerald-500" />
          <div style={{ width: `${toPercent(within, safeTotal)}%` }} className="bg-blue-500" />
          <div style={{ width: `${toPercent(overflow, safeTotal)}%` }} className="bg-red-500" />
        </div>
      </div>
      {over ? (
        <div className="text-[11px] font-semibold text-red-700">
          Allocation exceeds available balance.
        </div>
      ) : null}
    </div>
  );
}

function rowFromCandidate(candidate: FtlImportCandidate, previous?: ImportRow): ImportRow {
  return {
    source_shipment_id: String(candidate.shipmentId),
    import_shipment_reference: candidate.shipmentCode,
    client_number: candidate.clientNumber,
    import_boe_number: candidate.importBoeNumber,
    processed_available: candidate.processedAvailable,
    non_physical_stock: candidate.nonPhysicalStock,
    imported_weight: String(candidate.importedWeight),
    imported_quantity: String(candidate.importedQuantity),
    already_allocated_weight: String(candidate.alreadyAllocatedWeight),
    already_allocated_quantity: String(candidate.alreadyAllocatedQuantity),
    package_type: candidate.packageType,
    cargo_description: candidate.cargoDescription,
    allocated_weight: previous?.allocated_weight ?? "",
    allocated_quantity: previous?.allocated_quantity ?? "",
    remarks: previous?.remarks ?? "",
  };
}

export function ImportShipmentSelectionStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  isAdmin,
  candidates,
}: Props) {
  const initialRows = toGroupRows(step.values, "import_shipments").map(mapRow);
  const [rows, setRows] = useState<ImportRow[]>(initialRows);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [candidatePicker, setCandidatePicker] = useState("");
  const [notes, setNotes] = useState(step.notes ?? "");
  const disableEdit = !canEdit;
  const candidateById = useMemo(
    () => new Map(candidates.map((candidate) => [String(candidate.shipmentId), candidate])),
    [candidates],
  );

  const normalizedSearch = search.trim().toLowerCase();
  const filteredCandidates = useMemo(() => {
    if (!normalizedSearch) return candidates;
    return candidates.filter((candidate) => {
      return (
        candidate.shipmentCode.toLowerCase().includes(normalizedSearch) ||
        candidate.clientNumber.toLowerCase().includes(normalizedSearch) ||
        candidate.importBoeNumber.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [candidates, normalizedSearch]);

  const updateRow = (index: number, patch: Partial<ImportRow>) => {
    setRows((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addCandidateRow = (candidateId: string) => {
    const candidate = candidateById.get(candidateId);
    if (!candidate) return;

    const activeIndexes = rows
      .map((_, index) => index)
      .filter((index) => !removed.has(index));
    const existingIndex = activeIndexes.find(
      (index) => rows[index]?.source_shipment_id === candidateId,
    );
    if (existingIndex !== undefined) return;

    setRows((prev) => [...prev, rowFromCandidate(candidate, emptyRow())]);
    setCandidatePicker("");
  };

  const visibleIndexes = rows
    .map((_, index) => index)
    .filter((index) => !removed.has(index));

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title="Import Shipment Selection"
        description="Select existing import shipments (FCL/import workflows), then allocate export quantity and weight."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        saveLabel="Save import references"
      >
        <style jsx>{`
          .ftl-shake {
            animation: ftl-shake 0.28s linear;
          }
          @keyframes ftl-shake {
            0% {
              transform: translateX(0);
            }
            25% {
              transform: translateX(-2px);
            }
            50% {
              transform: translateX(2px);
            }
            75% {
              transform: translateX(-2px);
            }
            100% {
              transform: translateX(0);
            }
          }
        `}</style>

        <div className="grid gap-3 lg:grid-cols-[1fr_320px_auto]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search imports by shipment number, client, or BOE"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
          <select
            value={candidatePicker}
            onChange={(event) => setCandidatePicker(event.target.value)}
            disabled={disableEdit}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          >
            <option value="">Select import shipment to link</option>
            {filteredCandidates.map((candidate) => (
              <option key={candidate.shipmentId} value={String(candidate.shipmentId)}>
                {candidate.shipmentCode} | {candidate.clientNumber || "-"} |{" "}
                {candidate.importBoeNumber || "No BOE"}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => addCandidateRow(candidatePicker)}
            disabled={disableEdit || !candidatePicker}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
          >
            Link shipment
          </button>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
          Link only from existing import workflows (FCL or other import templates). Manual references are blocked.
        </div>

        {!visibleIndexes.length ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-600">
            No import shipment linked yet. Search and link at least one import shipment.
          </div>
        ) : null}

        {visibleIndexes.map((index) => {
          const row = rows[index];
          const selectedCandidate = candidateById.get(row.source_shipment_id);
          const importedWeight =
            selectedCandidate?.importedWeight ?? numberValue(row.imported_weight, 0);
          const importedQuantity =
            selectedCandidate?.importedQuantity ?? numberValue(row.imported_quantity, 0);
          const allocatedWeight = numberValue(row.allocated_weight, 0);
          const allocatedQuantity = numberValue(row.allocated_quantity, 0);
          const alreadyAllocatedWeight =
            selectedCandidate?.alreadyAllocatedWeight ?? numberValue(row.already_allocated_weight, 0);
          const alreadyAllocatedQuantity =
            selectedCandidate?.alreadyAllocatedQuantity ??
            numberValue(row.already_allocated_quantity, 0);
          const remainingWeight = importedWeight - alreadyAllocatedWeight - allocatedWeight;
          const remainingQuantity = importedQuantity - alreadyAllocatedQuantity - allocatedQuantity;
          const overallocated = remainingWeight < 0 || remainingQuantity < 0;
          const processedAvailable =
            selectedCandidate?.processedAvailable ?? row.processed_available;
          const nonPhysicalStock =
            selectedCandidate?.nonPhysicalStock ?? row.non_physical_stock;
          const referenceValue =
            selectedCandidate?.shipmentCode ?? row.import_shipment_reference;
          const clientValue = selectedCandidate?.clientNumber ?? row.client_number;
          const boeValue = selectedCandidate?.importBoeNumber ?? row.import_boe_number;
          const packageTypeValue = selectedCandidate?.packageType ?? row.package_type;
          const cargoDescriptionValue =
            selectedCandidate?.cargoDescription ?? row.cargo_description;

          const selectedSummary = selectedCandidate
            ? `${selectedCandidate.shipmentCode} | ${selectedCandidate.clientNumber || "-"} | ${selectedCandidate.importBoeNumber || "No BOE"}`
            : row.import_shipment_reference || "Saved reference";

          return (
            <div key={`import-${index}`} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-zinc-900">Import link #{index + 1}</div>
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

              {!row.source_shipment_id ? (
                <select
                  value={row.source_shipment_id}
                  onChange={(event) => {
                    const candidate = candidateById.get(event.target.value);
                    if (!candidate) return;
                    updateRow(index, rowFromCandidate(candidate, row));
                  }}
                  required
                  disabled={disableEdit}
                  className="mt-3 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                >
                  <option value="">Map this row to an existing import shipment *</option>
                  {filteredCandidates.map((candidate) => (
                    <option key={candidate.shipmentId} value={String(candidate.shipmentId)}>
                      {candidate.shipmentCode} | {candidate.clientNumber || "-"} |{" "}
                      {candidate.importBoeNumber || "No BOE"}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                    <div className="font-medium text-zinc-900">{selectedSummary}</div>
                    {selectedCandidate ? (
                      <div className="mt-1">
                        Current remaining: {selectedCandidate.remainingQuantity} qty /{" "}
                        {selectedCandidate.remainingWeight} wt
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`rounded-full px-2 py-1 font-medium ${
                        processedAvailable
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {processedAvailable ? "Processed" : "Not processed"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-1 font-medium ${
                        nonPhysicalStock
                          ? "bg-sky-100 text-sky-800"
                          : "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {nonPhysicalStock ? "Non-physical stock" : "Physical stock"}
                    </span>
                  </div>
                </div>
              )}

              <input
                type="hidden"
                name={fieldName(["import_shipments", String(index), "source_shipment_id"])}
                value={row.source_shipment_id}
              />
              <input
                type="hidden"
                name={fieldName(["import_shipments", String(index), "processed_available"])}
                value={processedAvailable ? "1" : ""}
              />
              <input
                type="hidden"
                name={fieldName(["import_shipments", String(index), "non_physical_stock"])}
                value={nonPhysicalStock ? "1" : ""}
              />
              <input
                type="hidden"
                name={fieldName(["import_shipments", String(index), "already_allocated_weight"])}
                value={String(alreadyAllocatedWeight)}
              />
              <input
                type="hidden"
                name={fieldName(["import_shipments", String(index), "already_allocated_quantity"])}
                value={String(alreadyAllocatedQuantity)}
              />

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <input
                  name={fieldName(["import_shipments", String(index), "import_shipment_reference"])}
                  value={referenceValue}
                  onChange={(event) =>
                    updateRow(index, { import_shipment_reference: event.target.value })
                  }
                  readOnly
                  className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm"
                />
                <input
                  name={fieldName(["import_shipments", String(index), "client_number"])}
                  value={clientValue}
                  onChange={(event) => updateRow(index, { client_number: event.target.value })}
                  readOnly
                  className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm"
                />
                <input
                  name={fieldName(["import_shipments", String(index), "import_boe_number"])}
                  value={boeValue}
                  onChange={(event) => updateRow(index, { import_boe_number: event.target.value })}
                  readOnly
                  className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm"
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  name={fieldName(["import_shipments", String(index), "imported_weight"])}
                  value={String(importedWeight)}
                  onChange={(event) => updateRow(index, { imported_weight: event.target.value })}
                  readOnly
                  className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  name={fieldName(["import_shipments", String(index), "imported_quantity"])}
                  value={String(importedQuantity)}
                  onChange={(event) => updateRow(index, { imported_quantity: event.target.value })}
                  readOnly
                  className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={alreadyAllocatedWeight}
                  readOnly
                  className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  value={alreadyAllocatedQuantity}
                  readOnly
                  className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm"
                />
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <input
                  name={fieldName(["import_shipments", String(index), "package_type"])}
                  value={packageTypeValue}
                  onChange={(event) => updateRow(index, { package_type: event.target.value })}
                  readOnly
                  className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm"
                />
                <input
                  name={fieldName(["import_shipments", String(index), "cargo_description"])}
                  value={cargoDescriptionValue}
                  onChange={(event) => updateRow(index, { cargo_description: event.target.value })}
                  readOnly
                  className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm sm:col-span-2"
                />
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  name={fieldName(["import_shipments", String(index), "allocated_weight"])}
                  value={row.allocated_weight}
                  onChange={(event) => updateRow(index, { allocated_weight: event.target.value })}
                  placeholder="Allocate weight"
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
                  placeholder="Allocate quantity"
                  disabled={disableEdit}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                />
              </div>

              <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <SegmentBar
                  label="Quantity allocation"
                  total={importedQuantity}
                  already={alreadyAllocatedQuantity}
                  current={allocatedQuantity}
                />
                <SegmentBar
                  label="Weight allocation"
                  total={importedWeight}
                  already={alreadyAllocatedWeight}
                  current={allocatedWeight}
                />
                <div className="text-xs text-zinc-700">
                  Remaining after this export: {remainingQuantity} qty / {remainingWeight} wt
                </div>
                {overallocated ? (
                  <div className="text-xs font-semibold text-red-700">
                    Warning: allocation exceeds remaining balance (save is still allowed).
                  </div>
                ) : null}
                {!processedAvailable ? (
                  <div className="text-xs font-semibold text-amber-700">
                    Warning: import shipment is not marked processed/available (save is allowed).
                  </div>
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
