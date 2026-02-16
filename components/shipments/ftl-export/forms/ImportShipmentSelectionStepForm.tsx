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
  };
}

function formatAmount(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function shortDate(value: string) {
  return value ? value.slice(0, 10) : "";
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
        <div className="grid gap-3 lg:grid-cols-[1fr_320px_auto]">
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">
              Search existing import shipment
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Shipment no / client no / BOE no"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">
              Import shipment to link
            </div>
            <select
              value={candidatePicker}
              onChange={(event) => setCandidatePicker(event.target.value)}
              disabled={disableEdit}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            >
              <option value="">Select import shipment</option>
              {filteredCandidates.map((candidate) => (
                <option key={candidate.shipmentId} value={String(candidate.shipmentId)}>
                  {candidate.shipmentCode} | {candidate.clientNumber || "-"} |{" "}
                  {candidate.importBoeNumber || "No BOE"}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => addCandidateRow(candidatePicker)}
              disabled={disableEdit || !candidatePicker}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
            >
              Link shipment
            </button>
          </div>
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
          const allocationHistory = selectedCandidate?.allocationHistory ?? [];
          const sortedHistory = [...allocationHistory].sort((a, b) =>
            (a.exportDate || "").localeCompare(b.exportDate || ""),
          );
          let runningBalanceWeight = importedWeight;
          let runningBalanceQuantity = importedQuantity;
          for (const entry of sortedHistory) {
            runningBalanceWeight -= entry.allocatedWeight;
            runningBalanceQuantity -= entry.allocatedQuantity;
          }
          const balanceBeforeCurrentWeight = runningBalanceWeight;
          const balanceBeforeCurrentQuantity = runningBalanceQuantity;
          const remainingWeight = balanceBeforeCurrentWeight - allocatedWeight;
          const remainingQuantity = balanceBeforeCurrentQuantity - allocatedQuantity;
          const overallocated =
            allocatedWeight > balanceBeforeCurrentWeight ||
            allocatedQuantity > balanceBeforeCurrentQuantity;
          let ledgerRunningWeight = importedWeight;
          let ledgerRunningQuantity = importedQuantity;
          const ledgerHistoryRows = sortedHistory.map((entry) => {
            ledgerRunningWeight -= entry.allocatedWeight;
            ledgerRunningQuantity -= entry.allocatedQuantity;
            return {
              ...entry,
              balanceWeight: ledgerRunningWeight,
              balanceQuantity: ledgerRunningQuantity,
            };
          });
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
              ) : null}

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
              <input
                type="hidden"
                name={fieldName([
                  "import_shipments",
                  String(index),
                  "import_shipment_reference",
                ])}
                value={referenceValue}
              />
              <input
                type="hidden"
                name={fieldName(["import_shipments", String(index), "client_number"])}
                value={clientValue}
              />
              <input
                type="hidden"
                name={fieldName(["import_shipments", String(index), "import_boe_number"])}
                value={boeValue}
              />
              <input
                type="hidden"
                name={fieldName(["import_shipments", String(index), "imported_weight"])}
                value={String(importedWeight)}
              />
              <input
                type="hidden"
                name={fieldName(["import_shipments", String(index), "imported_quantity"])}
                value={String(importedQuantity)}
              />
              <input
                type="hidden"
                name={fieldName(["import_shipments", String(index), "package_type"])}
                value={packageTypeValue}
              />
              <input
                type="hidden"
                name={fieldName(["import_shipments", String(index), "cargo_description"])}
                value={cargoDescriptionValue}
              />

              {row.source_shipment_id ? (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                      <div className="font-medium text-zinc-900">{selectedSummary}</div>
                      <div className="mt-1">
                        Package: {packageTypeValue || "-"} | Cargo: {cargoDescriptionValue || "-"}
                      </div>
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

                  <div className="overflow-x-auto rounded-lg border border-zinc-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-zinc-50 text-xs uppercase tracking-[0.08em] text-zinc-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Reference</th>
                          <th className="px-3 py-2 text-left">Transaction</th>
                          <th className="px-3 py-2 text-right">Weight</th>
                          <th className="px-3 py-2 text-right">Quantity</th>
                          <th className="px-3 py-2 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-zinc-200 bg-emerald-50/50">
                          <td className="px-3 py-2 font-medium text-zinc-900">
                            Original import shipment
                          </td>
                          <td className="px-3 py-2 text-zinc-700">IN</td>
                          <td className="px-3 py-2 text-right font-medium text-emerald-700">
                            +{formatAmount(importedWeight)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-emerald-700">
                            +{formatAmount(importedQuantity)}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-700">
                            {formatAmount(importedQuantity)} qty / {formatAmount(importedWeight)} wt
                          </td>
                        </tr>
                        {ledgerHistoryRows.map((entry, historyIndex) => (
                          <tr key={`history-${index}-${historyIndex}`} className="border-t border-zinc-200">
                            <td className="px-3 py-2 text-zinc-900">
                              {entry.exportShipmentCode || "Previous export"}
                              {entry.exportDate ? (
                                <span className="ml-1 text-xs text-zinc-500">
                                  ({shortDate(entry.exportDate)})
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-zinc-700">OUT</td>
                            <td className="px-3 py-2 text-right font-medium text-red-700">
                              -{formatAmount(entry.allocatedWeight)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-red-700">
                              -{formatAmount(entry.allocatedQuantity)}
                            </td>
                            <td className="px-3 py-2 text-right text-zinc-700">
                              {formatAmount(entry.balanceQuantity)} qty /{" "}
                              {formatAmount(entry.balanceWeight)} wt
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-zinc-200 bg-blue-50/40">
                          <td className="px-3 py-2 font-medium text-zinc-900">
                            Current shipment allocation
                          </td>
                          <td className="px-3 py-2 text-zinc-700">OUT (Current)</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              max={Math.max(0, balanceBeforeCurrentWeight)}
                              name={fieldName(["import_shipments", String(index), "allocated_weight"])}
                              value={row.allocated_weight}
                              onChange={(event) =>
                                updateRow(index, { allocated_weight: event.target.value })
                              }
                              placeholder="0"
                              disabled={disableEdit}
                              className={`w-28 rounded-lg border px-2 py-1 text-right text-sm disabled:bg-zinc-100 ${
                                overallocated ? "border-red-400 bg-red-50" : "border-zinc-300 bg-white"
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              min={0}
                              max={Math.max(0, balanceBeforeCurrentQuantity)}
                              name={fieldName(["import_shipments", String(index), "allocated_quantity"])}
                              value={row.allocated_quantity}
                              onChange={(event) =>
                                updateRow(index, { allocated_quantity: event.target.value })
                              }
                              placeholder="0"
                              disabled={disableEdit}
                              className={`w-28 rounded-lg border px-2 py-1 text-right text-sm disabled:bg-zinc-100 ${
                                overallocated ? "border-red-400 bg-red-50" : "border-zinc-300 bg-white"
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-700">
                            <span className={remainingQuantity < 0 || remainingWeight < 0 ? "text-red-700" : ""}>
                              {formatAmount(remainingQuantity)} qty / {formatAmount(remainingWeight)} wt
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {overallocated ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                      Current allocation cannot exceed running balance from previous row.
                    </div>
                  ) : null}
                  {!processedAvailable ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                      Warning: import shipment is not marked processed/available (save is allowed).
                    </div>
                  ) : null}

                </div>
              ) : null}
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

        <input type="hidden" name="notes" value="" />
      </SectionFrame>
    </form>
  );
}
