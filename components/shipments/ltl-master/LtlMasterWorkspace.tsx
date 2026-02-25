
"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { AppIcon } from "@/components/ui/AppIcon";
import { Badge } from "@/components/ui/Badge";
import { CustomsAgentsStepForm } from "@/components/shipments/ftl-export/forms/CustomsAgentsStepForm";
import { ExportInvoiceStepForm } from "@/components/shipments/ftl-export/forms/ExportInvoiceStepForm";
import { SectionFrame } from "@/components/shipments/ftl-export/forms/SectionFrame";
import { TrackingStepForm, type TrackingAgentGate } from "@/components/shipments/ftl-export/forms/TrackingStepForm";
import { TrucksDetailsStepForm } from "@/components/shipments/ftl-export/forms/TrucksDetailsStepForm";
import {
  trackingRegionFlowForRoute,
  type TrackingRegion,
} from "@/components/shipments/ftl-export/forms/trackingTimelineConfig";
import { fieldName, stringValue } from "@/components/shipments/ftl-export/fieldNames";
import type {
  FtlDocumentMeta,
  FtlImportCandidate,
  FtlShipmentMeta,
  FtlStepData,
} from "@/components/shipments/ftl-export/types";
import { overallStatusLabel, riskLabel, type StepStatus } from "@/lib/domain";
import {
  LTL_MASTER_SERVICE_TYPE_TO_ROUTE,
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES,
  LTL_SUBSHIPMENT_HANDOVER_METHODS,
  type LtlSubshipmentHandoverMethod,
} from "@/lib/ltlMasterJafzaSyria/constants";
import { getNumber, getString, isTruthy, parseMasterWarehouse } from "@/lib/ltlMasterJafzaSyria/helpers";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import {
  jafzaRouteById,
  resolveJafzaLandRoute,
} from "@/lib/routes/jafzaLandRoutes";

export type LtlMasterMainTab =
  | "creation"
  | "trucks"
  | "subshipments"
  | "loading"
  | "invoice"
  | "agents"
  | "tracking"
  | "handover";

export type LtlMasterTrackingTab =
  | "uae"
  | "ksa"
  | "jordan"
  | "syria"
  | "mushtarakah"
  | "lebanon";

export type LtlMasterStatusView = {
  statuses: Record<string, StepStatus>;
  tripLoadingStatus: "PENDING" | "IN_PROGRESS" | "DONE";
  canFinalizeInvoice: boolean;
  trackingUnlocked: boolean;
  allSubshipmentsDone: boolean;
};

export type LtlMasterSubshipmentView = {
  id: number;
  shipment_code: string;
  customer_name: string;
  details_step_id: number | null;
  loading_step_id: number | null;
  handover_step_id: number | null;
  details_values: Record<string, unknown>;
  loading_values: Record<string, unknown>;
  handover_values: Record<string, unknown>;
  loading_photo_doc_id: number | null;
  details_done: boolean;
  loading_done: boolean;
  loaded_into_truck: boolean;
  handover_done: boolean;
  shipment_done: boolean;
};

type WorkspaceProps = {
  headingClassName?: string;
  shipment: FtlShipmentMeta;
  steps: FtlStepData[];
  latestDocsByType: Record<string, FtlDocumentMeta>;
  customers: Array<{ id: number; name: string }>;
  brokers: Array<{ id: number; name: string }>;
  importCandidates: FtlImportCandidate[];
  subshipments: LtlMasterSubshipmentView[];
  masterStatus: LtlMasterStatusView;
  canEdit: boolean;
  isAdmin: boolean;
  updateMasterStepAction: (formData: FormData) => void;
  createSubshipmentAction: (formData: FormData) => void;
  updateSubshipmentLoadingAction: (formData: FormData) => void;
  updateSubshipmentHandoverAction: (formData: FormData) => void;
  closeMasterLoadingAction: (formData: FormData) => void;
  saveMasterWarehouseArrivalAction: (formData: FormData) => void;
  initialTab?: LtlMasterMainTab;
  initialTrackingTab?: LtlMasterTrackingTab;
};

type DraftImportRow = {
  id: string;
  sourceShipmentId: string;
  allocatedWeight: string;
  allocatedQuantity: string;
};

function riskTone(risk: string) {
  if (risk === "BLOCKED") return "red";
  if (risk === "AT_RISK") return "yellow";
  return "green";
}

function loadingTone(status: "PENDING" | "IN_PROGRESS" | "DONE") {
  if (status === "DONE") return "green";
  if (status === "IN_PROGRESS") return "blue";
  return "zinc";
}

function tabButtonClass(isActive: boolean, isDone: boolean) {
  if (isActive && isDone) return "bg-emerald-200 text-emerald-900";
  if (isActive) return "bg-zinc-900 text-white";
  if (isDone) {
    return "border border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-200";
  }
  return "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50";
}

function asMainTab(value: string | undefined): LtlMasterMainTab | undefined {
  if (!value) return undefined;
  if (
    value === "creation" ||
    value === "trucks" ||
    value === "subshipments" ||
    value === "loading" ||
    value === "invoice" ||
    value === "agents" ||
    value === "tracking" ||
    value === "handover"
  ) {
    return value;
  }
  return undefined;
}

function asTrackingTab(value: string | undefined): LtlMasterTrackingTab | undefined {
  if (!value) return undefined;
  if (
    value === "uae" ||
    value === "ksa" ||
    value === "jordan" ||
    value === "syria" ||
    value === "mushtarakah" ||
    value === "lebanon"
  ) {
    return value;
  }
  return undefined;
}

function returnTo(baseUrl: string, tab: LtlMasterMainTab, tracking?: LtlMasterTrackingTab) {
  const params = new URLSearchParams({ tab });
  if (tab === "tracking" && tracking) {
    params.set("tracking", tracking);
  }
  return `${baseUrl}?${params.toString()}`;
}

function totalBySubshipments(subshipments: LtlMasterSubshipmentView[]) {
  let plannedWeight = 0;
  let plannedVolume = 0;
  let confirmedWeight = 0;
  let confirmedVolume = 0;

  for (const sub of subshipments) {
    plannedWeight += getNumber(sub.details_values.total_cargo_weight);
    plannedVolume += getNumber(sub.details_values.total_cargo_volume);

    const loaded = isTruthy(sub.loading_values.loaded_into_truck);
    if (loaded) {
      confirmedWeight += getNumber(sub.loading_values.confirmed_weight);
      confirmedVolume += getNumber(sub.loading_values.confirmed_volume);
      continue;
    }

    confirmedWeight += getNumber(sub.details_values.total_cargo_weight);
    confirmedVolume += getNumber(sub.details_values.total_cargo_volume);
  }

  return {
    plannedWeight,
    plannedVolume,
    confirmedWeight,
    confirmedVolume,
  };
}

function statusBadgeTone(status: StepStatus) {
  if (status === "DONE") return "green";
  if (status === "IN_PROGRESS") return "blue";
  if (status === "BLOCKED") return "red";
  return "zinc";
}

function isHandoverMethod(value: string): value is LtlSubshipmentHandoverMethod {
  return LTL_SUBSHIPMENT_HANDOVER_METHODS.includes(value as LtlSubshipmentHandoverMethod);
}

function nextDraftId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function toAmount(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function shortDate(value: string) {
  return value ? value.slice(0, 10) : "";
}

function daysSince(isoDate: string) {
  if (!isoDate) return 0;
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return 0;
  const diff = Date.now() - target.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function latestDateValue(values: Record<string, unknown>) {
  const dates = Object.entries(values)
    .filter(([key, value]) => key.endsWith("_date") && typeof value === "string" && !!value)
    .map(([, value]) => String(value));
  return dates.sort().at(-1) ?? "";
}

function MissingStep({ name }: { name: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Step not found in this shipment: {name}
    </div>
  );
}

function PendingSubmitButton({
  label,
  pendingLabel,
  disabled,
  className,
}: {
  label: string;
  pendingLabel: string;
  disabled: boolean;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function AddCustomerShipmentForm({
  customers,
  importCandidates,
  canEdit,
  action,
  returnToUrl,
}: {
  customers: Array<{ id: number; name: string }>;
  importCandidates: FtlImportCandidate[];
  canEdit: boolean;
  action: (formData: FormData) => void;
  returnToUrl: string;
}) {
  const [customerPartyId, setCustomerPartyId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [rows, setRows] = useState<DraftImportRow[]>([]);
  const [totalCargoWeightOverride, setTotalCargoWeightOverride] = useState<string | null>(null);
  const [totalCargoVolumeOverride, setTotalCargoVolumeOverride] = useState<string | null>(null);

  const importCandidatesWithRemaining = useMemo(
    () =>
      importCandidates.filter(
        (candidate) => candidate.remainingWeight > 0.0001 || candidate.remainingQuantity > 0.0001,
      ),
    [importCandidates],
  );

  const candidateMap = useMemo(
    () =>
      new Map(importCandidatesWithRemaining.map((candidate) => [String(candidate.shipmentId), candidate])),
    [importCandidatesWithRemaining],
  );

  const availableCandidates = useMemo(() => {
    const selected = new Set(rows.map((row) => row.sourceShipmentId));
    return importCandidatesWithRemaining.filter(
      (candidate) => !selected.has(String(candidate.shipmentId)),
    );
  }, [importCandidatesWithRemaining, rows]);

  const addRow = () => {
    if (!candidateId) return;
    const candidate = candidateMap.get(candidateId);
    if (!candidate) return;
    if (rows.some((row) => row.sourceShipmentId === candidateId)) return;
    setRows((prev) => [
      ...prev,
      {
        id: nextDraftId(),
        sourceShipmentId: String(candidate.shipmentId),
        allocatedWeight: "",
        allocatedQuantity: "",
      },
    ]);
    setCandidateId("");
  };

  const updateRow = (rowId: string, patch: Partial<DraftImportRow>) => {
    setRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const analyzedRows = useMemo(() => {
    return rows.map((row) => {
      const candidate = candidateMap.get(row.sourceShipmentId);
      const importedWeight = candidate?.importedWeight ?? 0;
      const importedQuantity = candidate?.importedQuantity ?? 0;
      const allocatedWeight = toAmount(row.allocatedWeight);
      const allocatedQuantity = toAmount(row.allocatedQuantity);
      const allocationHistory = candidate?.allocationHistory ?? [];
      const sortedHistory = [...allocationHistory].sort((left, right) =>
        (left.exportDate || "").localeCompare(right.exportDate || ""),
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
        allocatedWeight > balanceBeforeCurrentWeight + 0.0001 ||
        allocatedQuantity > balanceBeforeCurrentQuantity + 0.0001;
      const emptyAllocation = allocatedWeight <= 0 && allocatedQuantity <= 0;

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

      return {
        row,
        candidate,
        importedWeight,
        importedQuantity,
        allocatedWeight,
        allocatedQuantity,
        balanceBeforeCurrentWeight,
        balanceBeforeCurrentQuantity,
        remainingWeight,
        remainingQuantity,
        overallocated,
        emptyAllocation,
        ledgerHistoryRows,
      };
    });
  }, [rows, candidateMap]);

  const totals = useMemo(() => {
    return analyzedRows.reduce(
      (acc, entry) => {
        acc.weight += entry.allocatedWeight;
        acc.quantity += entry.allocatedQuantity;
        return acc;
      },
      { weight: 0, quantity: 0 },
    );
  }, [analyzedRows]);
  const totalCargoWeight = totalCargoWeightOverride ?? formatAmount(totals.weight);
  const totalCargoVolume = totalCargoVolumeOverride ?? formatAmount(totals.quantity);

  const hasInvalidRows = analyzedRows.some(
    (entry) => !entry.candidate || entry.overallocated || entry.emptyAllocation,
  );

  const canSubmit =
    canEdit &&
    !!customerPartyId &&
    rows.length > 0 &&
    (totals.weight > 0 || totals.quantity > 0) &&
    !hasInvalidRows;

  const rowsJson = JSON.stringify(
    rows.map((row) => ({
      sourceShipmentId: row.sourceShipmentId,
      allocatedWeight: Number(row.allocatedWeight || 0),
      allocatedQuantity: Number(row.allocatedQuantity || 0),
    })),
  );

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <input type="hidden" name="returnTo" value={returnToUrl} />
      <input type="hidden" name="importRowsJson" value={rowsJson} />

      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Client name *</div>
          <select
            name="customerPartyId"
            value={customerPartyId}
            onChange={(event) => setCustomerPartyId(event.target.value)}
            disabled={!canEdit}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          >
            <option value="">Select customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Total cargo weight (auto, editable)</div>
          <input
            type="number"
            step="0.01"
            min={0}
            name="totalCargoWeight"
            value={totalCargoWeight}
            onChange={(event) => {
              const next = event.target.value;
              setTotalCargoWeightOverride(next === "" ? null : next);
            }}
            disabled={!canEdit}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Total cargo volume (auto, editable)</div>
          <input
            type="number"
            step="0.01"
            min={0}
            name="totalCargoVolume"
            value={totalCargoVolume}
            onChange={(event) => {
              const next = event.target.value;
              setTotalCargoVolumeOverride(next === "" ? null : next);
            }}
            disabled={!canEdit}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
        </label>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
        Totals are auto-calculated from reference allocations and you can edit them if needed.
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Import reference *</div>
          <select
            value={candidateId}
            onChange={(event) => setCandidateId(event.target.value)}
            disabled={!canEdit}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          >
            <option value="">Select import shipment</option>
            {availableCandidates.map((candidate) => (
              <option key={candidate.shipmentId} value={candidate.shipmentId}>
                {candidate.shipmentCode} | {candidate.clientNumber || "-"} |{" "}
                {candidate.importBoeNumber || "No BOE"} | Remaining {formatAmount(candidate.remainingQuantity)} qty /{" "}
                {formatAmount(candidate.remainingWeight)} wt
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            onClick={addRow}
            disabled={!canEdit || !candidateId}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
          >
            Add reference
          </button>
        </div>
      </div>
      {rows.length ? (
        <div className="space-y-3">
          {analyzedRows.map((entry, index) => {
            const { row, candidate } = entry;
            const selectedSummary = candidate
              ? `${candidate.shipmentCode} | ${candidate.clientNumber || "-"} | ${
                  candidate.importBoeNumber || "No BOE"
                }`
              : row.sourceShipmentId;
            return (
              <div key={row.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                  <div className="font-medium text-zinc-900">Reference #{index + 1}</div>
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    disabled={!canEdit}
                    className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                  >
                    Remove
                  </button>
                </div>

                <div className="mb-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                  <div className="font-medium text-zinc-900">{selectedSummary}</div>
                  <div className="mt-1 text-zinc-600">
                    Product: {candidate?.cargoDescription?.trim() || "N/A"}
                  </div>
                  <div className="mt-1">
                    Remaining before current: {formatAmount(entry.balanceBeforeCurrentQuantity)} qty /{" "}
                    {formatAmount(entry.balanceBeforeCurrentWeight)} wt
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-zinc-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-zinc-50 text-xs uppercase tracking-[0.08em] text-zinc-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Reference</th>
                        <th className="px-3 py-2 text-left">Product description</th>
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
                        <td className="px-3 py-2 text-zinc-700">
                          {candidate?.cargoDescription?.trim() || "-"}
                        </td>
                        <td className="px-3 py-2 text-zinc-700">IN</td>
                        <td className="px-3 py-2 text-right font-medium text-emerald-700">
                          +{formatAmount(entry.importedWeight)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-emerald-700">
                          +{formatAmount(entry.importedQuantity)}
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-700">
                          {formatAmount(entry.importedQuantity)} qty / {formatAmount(entry.importedWeight)} wt
                        </td>
                      </tr>

                      {entry.ledgerHistoryRows.map((historyRow, historyIndex) => (
                        <tr key={`history-${row.id}-${historyIndex}`} className="border-t border-zinc-200">
                          <td className="px-3 py-2 text-zinc-900">
                            {historyRow.exportShipmentCode || "Previous export"}
                            {historyRow.exportDate ? (
                              <span className="ml-1 text-xs text-zinc-500">
                                ({shortDate(historyRow.exportDate)})
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-zinc-700">
                            {candidate?.cargoDescription?.trim() || "-"}
                          </td>
                          <td className="px-3 py-2 text-zinc-700">OUT</td>
                          <td className="px-3 py-2 text-right font-medium text-red-700">
                            -{formatAmount(historyRow.allocatedWeight)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-red-700">
                            -{formatAmount(historyRow.allocatedQuantity)}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-700">
                            {formatAmount(historyRow.balanceQuantity)} qty /{" "}
                            {formatAmount(historyRow.balanceWeight)} wt
                          </td>
                        </tr>
                      ))}

                      <tr className="border-t border-zinc-200 bg-blue-50/40">
                        <td className="px-3 py-2 font-medium text-zinc-900">Current take</td>
                        <td className="px-3 py-2 text-zinc-700">
                          {candidate?.cargoDescription?.trim() || "-"}
                        </td>
                        <td className="px-3 py-2 text-zinc-700">OUT (Current)</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            max={Math.max(0, entry.balanceBeforeCurrentWeight)}
                            value={row.allocatedWeight}
                            onChange={(event) =>
                              updateRow(row.id, { allocatedWeight: event.target.value })
                            }
                            placeholder="0"
                            disabled={!canEdit}
                            className={`w-28 rounded-lg border px-2 py-1 text-right text-sm disabled:bg-zinc-100 ${
                              entry.overallocated ? "border-red-400 bg-red-50" : "border-zinc-300 bg-white"
                            }`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            max={Math.max(0, entry.balanceBeforeCurrentQuantity)}
                            value={row.allocatedQuantity}
                            onChange={(event) =>
                              updateRow(row.id, { allocatedQuantity: event.target.value })
                            }
                            placeholder="0"
                            disabled={!canEdit}
                            className={`w-28 rounded-lg border px-2 py-1 text-right text-sm disabled:bg-zinc-100 ${
                              entry.overallocated ? "border-red-400 bg-red-50" : "border-zinc-300 bg-white"
                            }`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-700">
                          <span
                            className={
                              entry.remainingQuantity < -0.0001 || entry.remainingWeight < -0.0001
                                ? "text-red-700"
                                : ""
                            }
                          >
                            {formatAmount(entry.remainingQuantity)} qty / {formatAmount(entry.remainingWeight)} wt
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {entry.overallocated ? (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    Current take cannot exceed running balance.
                  </div>
                ) : null}
                {entry.emptyAllocation ? (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                    Enter weight, quantity, or both for current take.
                  </div>
                ) : null}
                {!candidate ? (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    Selected import shipment no longer has remaining cargo.
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          Add at least one import reference before creating subshipment.
        </div>
      )}

      {!importCandidatesWithRemaining.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No import shipment with remaining cargo is available.
        </div>
      ) : null}
      {hasInvalidRows ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          Fix highlighted allocation rows before creating the customer shipment.
        </div>
      ) : null}

      <PendingSubmitButton
        label="Create customer shipment"
        pendingLabel="Creating..."
        disabled={!canSubmit}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
      />
    </form>
  );
}

function HandoverSubshipmentForm({
  sub,
  canEdit,
  warehouseOffloaded,
  returnToUrl,
  action,
}: {
  sub: LtlMasterSubshipmentView;
  canEdit: boolean;
  warehouseOffloaded: boolean;
  returnToUrl: string;
  action: (formData: FormData) => void;
}) {
  const methodRaw = getString(sub.handover_values.handover_method).toUpperCase();
  const initialMethod = isHandoverMethod(methodRaw) ? methodRaw : "";
  const [method, setMethod] = useState<LtlSubshipmentHandoverMethod | "">(initialMethod);
  const delivered = isTruthy(sub.handover_values.delivered);
  const collected = isTruthy(sub.handover_values.collected_by_customer);

  return (
    <form
      action={action}
      className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
    >
      <input type="hidden" name="subshipmentId" value={sub.id} />
      <input type="hidden" name="returnTo" value={returnToUrl} />
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-zinc-900">{sub.shipment_code}</div>
          <div className="text-xs text-zinc-600">{sub.customer_name || "-"}</div>
        </div>
        <Badge tone={sub.shipment_done ? "green" : "blue"}>
          {sub.shipment_done ? "Done" : "In progress"}
        </Badge>
      </div>

      <label className="block">
        <div className="mb-1 text-xs font-medium text-zinc-600">Handover method *</div>
        <select
          name={fieldName(["handover_method"])}
          value={method}
          onChange={(event) => {
            const value = event.target.value;
            setMethod(isHandoverMethod(value) ? value : "");
          }}
          disabled={!warehouseOffloaded}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
        >
          <option value="">Select method</option>
          <option value="PICKUP">Pickup</option>
          <option value="LOCAL_DELIVERY">Local delivery</option>
        </select>
      </label>

      {method === "PICKUP" ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
            Pickup
          </div>
          <input type="hidden" name={fieldName(["delivery_city_area"])} value="" />
          <input type="hidden" name={fieldName(["out_for_delivery"])} value="" />
          <input type="hidden" name={fieldName(["out_for_delivery_date"])} value="" />
          <input type="hidden" name={fieldName(["delivered"])} value="" />
          <input type="hidden" name={fieldName(["delivery_date"])} value="" />

          <label className="mb-2 flex items-center gap-2 text-sm">
            <input type="hidden" name={fieldName(["collected_by_customer"])} value="" />
            <input
              type="checkbox"
              name={fieldName(["collected_by_customer"])}
              value="1"
              defaultChecked={collected}
              disabled={!warehouseOffloaded}
            />
            Collected by customer
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Collection date</div>
            <DatePickerInput
              
              name={fieldName(["collection_date"])}
              defaultValue={stringValue(sub.handover_values.collection_date)}
              disabled={!warehouseOffloaded}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
             />
          </label>
          <label className="mt-2 block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Receiver name/ID</div>
            <input
              name={fieldName(["receiver_name_id"])}
              defaultValue={stringValue(sub.handover_values.receiver_name_id)}
              disabled={!warehouseOffloaded}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>
        </div>
      ) : null}

      {method === "LOCAL_DELIVERY" ? (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">
            Local delivery
          </div>
          <input type="hidden" name={fieldName(["collected_by_customer"])} value="" />
          <input type="hidden" name={fieldName(["collection_date"])} value="" />
          <input type="hidden" name={fieldName(["receiver_name_id"])} value="" />

          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Delivery city/area</div>
            <input
              name={fieldName(["delivery_city_area"])}
              defaultValue={stringValue(sub.handover_values.delivery_city_area)}
              disabled={!warehouseOffloaded}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>
          <label className="mt-2 mb-2 flex items-center gap-2 text-sm">
            <input type="hidden" name={fieldName(["out_for_delivery"])} value="" />
            <input
              type="checkbox"
              name={fieldName(["out_for_delivery"])}
              value="1"
              defaultChecked={isTruthy(sub.handover_values.out_for_delivery)}
              disabled={!warehouseOffloaded}
            />
            Out for delivery
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Out for delivery date</div>
            <DatePickerInput
              
              name={fieldName(["out_for_delivery_date"])}
              defaultValue={stringValue(sub.handover_values.out_for_delivery_date)}
              disabled={!warehouseOffloaded}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
             />
          </label>
          <label className="mt-2 mb-2 flex items-center gap-2 text-sm">
            <input type="hidden" name={fieldName(["delivered"])} value="" />
            <input
              type="checkbox"
              name={fieldName(["delivered"])}
              value="1"
              defaultChecked={delivered}
              disabled={!warehouseOffloaded}
            />
            Delivered
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Delivery date</div>
            <DatePickerInput
              
              name={fieldName(["delivery_date"])}
              defaultValue={stringValue(sub.handover_values.delivery_date)}
              disabled={!warehouseOffloaded}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
             />
          </label>
        </div>
      ) : null}

      {!method ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Select handover method to show the required fields.
        </div>
      ) : null}

      <div className="mt-3 flex justify-end">
        <PendingSubmitButton
          label="Save handover"
          pendingLabel="Saving..."
          disabled={!canEdit || !warehouseOffloaded}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        />
      </div>
    </form>
  );
}

export function LtlMasterWorkspace({
  headingClassName = "",
  shipment,
  steps,
  latestDocsByType,
  customers,
  brokers,
  importCandidates,
  subshipments,
  masterStatus,
  canEdit,
  isAdmin,
  updateMasterStepAction,
  createSubshipmentAction,
  updateSubshipmentLoadingAction,
  updateSubshipmentHandoverAction,
  closeMasterLoadingAction,
  saveMasterWarehouseArrivalAction,
  initialTab,
  initialTrackingTab,
}: WorkspaceProps) {
  const fallbackRouteId = resolveJafzaLandRoute(shipment.origin, shipment.destination);
  const fallbackRouteProfile = jafzaRouteById(fallbackRouteId);
  const [tab, setTab] = useState<LtlMasterMainTab>(asMainTab(initialTab) ?? "creation");
  const [trackingTab, setTrackingTab] = useState<LtlMasterTrackingTab>(() => {
    const first = (fallbackRouteProfile.trackingTabs[0] ?? "uae") as LtlMasterTrackingTab;
    const parsed = asTrackingTab(initialTrackingTab);
    if (!parsed) return first;
    return fallbackRouteProfile.trackingTabs.includes(parsed) ? parsed : first;
  });

  const stepByName = useMemo(() => new Map(steps.map((step) => [step.name, step])), [steps]);

  const creationStep = stepByName.get(LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.shipmentCreation);
  const trucksStep = stepByName.get(LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trucksDetails);
  const invoiceStep = stepByName.get(LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.exportInvoice);
  const agentsStep = stepByName.get(LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.customsAgentsAllocation);
  const trackingUaeStep = stepByName.get(LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingUae);
  const trackingKsaStep = stepByName.get(LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingKsa);
  const trackingJordanStep = stepByName.get(LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingJordan);
  const trackingSyriaStep = stepByName.get(LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingSyria);
  const warehouseStep = stepByName.get(
    LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.syriaWarehouseFinalDelivery,
  );

  const creationValues = (creationStep?.values ?? {}) as Record<string, unknown>;
  const creationServiceType = stringValue(creationValues.service_type);
  const mappedRouteId =
    creationServiceType &&
    Object.prototype.hasOwnProperty.call(LTL_MASTER_SERVICE_TYPE_TO_ROUTE, creationServiceType)
      ? LTL_MASTER_SERVICE_TYPE_TO_ROUTE[creationServiceType as keyof typeof LTL_MASTER_SERVICE_TYPE_TO_ROUTE]
      : null;
  const routeId = mappedRouteId ?? fallbackRouteId;
  const routeProfile = jafzaRouteById(routeId);
  const trackingFlow = trackingRegionFlowForRoute(routeId);
  const warehouseValues = (warehouseStep?.values ?? {}) as Record<string, unknown>;
  const warehouseState = parseMasterWarehouse(warehouseValues);

  const totals = totalBySubshipments(subshipments);

  const invoiceFinalized = isTruthy(invoiceStep?.values.invoice_finalized);

  const baseUrl = `/shipments/master/${shipment.id}`;

  const gateValues = (agentsStep?.values ?? {}) as Record<string, unknown>;
  const bathaMode = getString(gateValues.batha_clearance_mode).toUpperCase();
  const bathaModeReady =
    routeId !== "JAFZA_TO_KSA"
      ? !!getString(gateValues.batha_agent_name)
      : bathaMode === "ZAXON"
        ? !!getString(gateValues.batha_agent_name) &&
          !!getString(gateValues.batha_consignee_name) &&
          !!getString(gateValues.show_batha_consignee_to_client)
        : bathaMode === "CLIENT"
          ? !!getString(gateValues.batha_client_final_choice)
          : false;
  const masnaaMode = getString(gateValues.masnaa_clearance_mode).toUpperCase();
  const masnaaReady =
    routeId !== "JAFZA_TO_MUSHTARAKAH"
      ? true
      : masnaaMode === "ZAXON"
        ? !!getString(gateValues.masnaa_agent_name) &&
          !!getString(gateValues.masnaa_consignee_name) &&
          !!getString(gateValues.show_masnaa_consignee_to_client)
        : masnaaMode === "CLIENT"
          ? !!getString(gateValues.masnaa_client_final_choice)
          : false;
  const trackingAgentGate: TrackingAgentGate = {
    jebelAliReady: !!getString(gateValues.jebel_ali_agent_name),
    silaReady: !!getString(gateValues.sila_agent_name),
    bathaReady: !!getString(gateValues.batha_agent_name),
    bathaModeReady,
    omariReady: !!getString(gateValues.omari_agent_name),
    naseebReady:
      getString(gateValues.naseeb_clearance_mode).toUpperCase() === "CLIENT"
        ? !!getString(gateValues.naseeb_client_final_choice)
        : !!getString(gateValues.naseeb_agent_name),
    mushtarakahReady:
      routeId !== "JAFZA_TO_MUSHTARAKAH"
        ? true
        : !!getString(gateValues.mushtarakah_agent_name) &&
          !!getString(gateValues.mushtarakah_consignee_name),
    masnaaReady,
  };
  const stepForTrackingTab = (tabId: LtlMasterTrackingTab) => {
    if (tabId === "uae") return trackingUaeStep;
    if (tabId === "ksa") return trackingKsaStep;
    if (tabId === "jordan") return trackingJordanStep;
    return trackingSyriaStep;
  };
  const trackingRegionStates = trackingFlow.map((regionEntry) => {
    const step = stepForTrackingTab(regionEntry.id as LtlMasterTrackingTab);
    const latestDate = latestDateValue((step?.values ?? {}) as Record<string, unknown>);
    const stalled =
      !!latestDate && step?.status !== "DONE" && daysSince(latestDate) >= 3;
    return {
      ...regionEntry,
      stepStatus: step?.status ?? "PENDING",
      stalled,
    };
  });

  const tabDone: Record<LtlMasterMainTab, boolean> = {
    creation: masterStatus.statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.shipmentCreation] === "DONE",
    trucks: masterStatus.statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trucksDetails] === "DONE",
    subshipments:
      masterStatus.statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.addCustomerShipments] === "DONE",
    loading: masterStatus.statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.loadingExecution] === "DONE",
    invoice: masterStatus.statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.exportInvoice] === "DONE",
    agents:
      masterStatus.statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.customsAgentsAllocation] === "DONE",
    tracking:
      routeProfile.trackingTabs.every((tabId) => stepForTrackingTab(tabId)?.status === "DONE"),
    handover:
      masterStatus.statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.syriaWarehouseFinalDelivery] ===
      "DONE",
  };

  const invoicePrerequisiteMessage = masterStatus.canFinalizeInvoice
    ? undefined
    : "Finalize invoice is available only when loading is done.";

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
          <AppIcon name="icon-route" size={22} />
          Consolidated LTL {routeProfile.origin} to {routeProfile.destination}
        </div>
        <h1 className={`${headingClassName} mt-2 text-2xl font-semibold text-zinc-900`}>
          {shipment.shipment_code}
        </h1>
        <div className="mt-1 text-sm text-zinc-600">
          {shipment.origin} to {shipment.destination}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="zinc">{overallStatusLabel(shipment.overall_status)}</Badge>
          <Badge tone={riskTone(shipment.risk)}>{riskLabel(shipment.risk)}</Badge>
          <Badge tone={loadingTone(masterStatus.tripLoadingStatus)}>
            Loading: {masterStatus.tripLoadingStatus === "PENDING"
              ? "Pending"
              : masterStatus.tripLoadingStatus === "IN_PROGRESS"
                ? "In progress"
                : "Done"}
          </Badge>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
            Planned weight: <span className="font-semibold">{totals.plannedWeight.toFixed(2)}</span>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
            Planned volume: <span className="font-semibold">{totals.plannedVolume.toFixed(2)}</span>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
            Confirmed weight: <span className="font-semibold">{totals.confirmedWeight.toFixed(2)}</span>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
            Confirmed volume: <span className="font-semibold">{totals.confirmedVolume.toFixed(2)}</span>
          </div>
        </div>
      </header>

      <div className="flex flex-nowrap gap-2 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        {[
          { id: "creation", label: "1. Shipment Creation" },
          { id: "trucks", label: "2. Truck Details" },
          { id: "subshipments", label: "3. Add Customer Shipments" },
          { id: "loading", label: "4. Loading Execution" },
          { id: "invoice", label: "5. Export Invoice" },
          { id: "agents", label: "6. Customs Agents" },
          { id: "tracking", label: "7. Shipment Tracking" },
          { id: "handover", label: `8. ${routeProfile.destination} Warehouse & Final Delivery` },
        ].map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id as LtlMasterMainTab)}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${tabButtonClass(
              tab === entry.id,
              tabDone[entry.id as LtlMasterMainTab],
            )}`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "creation" && creationStep ? (
        <form action={updateMasterStepAction}>
          <input type="hidden" name="stepId" value={creationStep.id} />
          <input type="hidden" name="returnTo" value={returnTo(baseUrl, "creation")} />
          <SectionFrame
            title="Shipment creation"
            description="Service type is fixed for this workflow."
            status={creationStep.status}
            canEdit={canEdit}
            isAdmin={isAdmin}
            saveLabel="Save creation"
          >
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Service type</div>
              <input
                name={fieldName(["service_type"])}
                readOnly
                value={creationServiceType || "LTL_JAFZA_SYRIA_MASTER"}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Route</div>
              <input
                readOnly
                value={`${routeProfile.origin} -> ${routeProfile.destination}`}
                className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Planned loading date</div>
              <DatePickerInput
                
                name={fieldName(["planned_loading_date"])}
                defaultValue={stringValue(creationValues.planned_loading_date)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
               />
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Notes</div>
              <textarea
                name={fieldName(["notes"])}
                defaultValue={stringValue(creationValues.notes)}
                rows={3}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </SectionFrame>
        </form>
      ) : null}

      {tab === "trucks" && trucksStep ? (
        <TrucksDetailsStepForm
          step={trucksStep}
          updateAction={updateMasterStepAction}
          returnTo={returnTo(baseUrl, "trucks")}
          canEdit={canEdit}
          isAdmin={isAdmin}
          invoiceFinalized={invoiceFinalized}
          defaultEstimatedLoadingDate={stringValue(creationValues.planned_loading_date)}
        />
      ) : null}

      {tab === "subshipments" ? (
        <div className="space-y-4">
          <AddCustomerShipmentForm
            customers={customers}
            importCandidates={importCandidates}
            canEdit={canEdit}
            action={createSubshipmentAction}
            returnToUrl={returnTo(baseUrl, "subshipments")}
          />

          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-zinc-900">Customer subshipments</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-zinc-500">
                  <tr>
                    <th className="px-2 py-2 text-left">Shipment</th>
                    <th className="px-2 py-2 text-left">Customer</th>
                    <th className="px-2 py-2 text-right">Weight</th>
                    <th className="px-2 py-2 text-right">Volume</th>
                    <th className="px-2 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {subshipments.map((sub) => (
                    <tr key={sub.id} className="border-t border-zinc-100">
                      <td className="px-2 py-2 font-medium text-zinc-900">{sub.shipment_code}</td>
                      <td className="px-2 py-2 text-zinc-700">{sub.customer_name || "-"}</td>
                      <td className="px-2 py-2 text-right text-zinc-700">
                        {getNumber(sub.details_values.total_cargo_weight).toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-right text-zinc-700">
                        {getNumber(sub.details_values.total_cargo_volume).toFixed(2)}
                      </td>
                      <td className="px-2 py-2">
                        <Badge tone={sub.shipment_done ? "green" : "blue"}>
                          {sub.shipment_done ? "Done" : "In progress"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {subshipments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-6 text-center text-sm text-zinc-500">
                        No customer subshipments yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "loading" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">Trip loading status</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {masterStatus.tripLoadingStatus === "PENDING"
                    ? "Pending"
                    : masterStatus.tripLoadingStatus === "IN_PROGRESS"
                      ? "In progress"
                      : "Done"}
                </div>
              </div>
              <form action={closeMasterLoadingAction}>
                <input type="hidden" name="returnTo" value={returnTo(baseUrl, "loading")} />
                <PendingSubmitButton
                  label="Close loading"
                  pendingLabel="Closing..."
                  disabled={!canEdit || masterStatus.tripLoadingStatus === "DONE"}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                />
              </form>
            </div>
          </div>

          {subshipments.map((sub) => (
            <form
              key={`loading-${sub.id}`}
              action={updateSubshipmentLoadingAction}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <input type="hidden" name="subshipmentId" value={sub.id} />
              <input type="hidden" name="returnTo" value={returnTo(baseUrl, "loading")} />
              {(() => {
                const plannedWeight = getNumber(sub.details_values.total_cargo_weight);
                const plannedVolume = getNumber(sub.details_values.total_cargo_volume);
                return (
                  <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{sub.shipment_code}</div>
                        <div className="text-xs text-zinc-600">{sub.customer_name || "-"}</div>
                      </div>
                      <Badge tone={statusBadgeTone(sub.loading_done ? "DONE" : "IN_PROGRESS")}>
                        {sub.loading_done ? "Done" : "Pending"}
                      </Badge>
                    </div>

                    <div className="mb-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                        Planned weight: <span className="font-semibold">{plannedWeight.toFixed(2)}</span>
                      </div>
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                        Planned volume: <span className="font-semibold">{plannedVolume.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                );
              })()}

              <div className="grid gap-3 md:grid-cols-4">
                <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                  <input type="hidden" name={fieldName(["loaded_into_truck"])} value="" />
                  <input
                    type="checkbox"
                    name={fieldName(["loaded_into_truck"])}
                    value="1"
                    defaultChecked={isTruthy(sub.loading_values.loaded_into_truck)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  Loaded into truck
                </label>

                <label className="block">
                  <div className="mb-1 text-xs font-medium text-zinc-600">Confirmed weight *</div>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    name={fieldName(["confirmed_weight"])}
                    defaultValue={stringValue(sub.loading_values.confirmed_weight)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  />
                </label>

                <label className="block">
                  <div className="mb-1 text-xs font-medium text-zinc-600">Confirmed volume *</div>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    name={fieldName(["confirmed_volume"])}
                    defaultValue={stringValue(sub.loading_values.confirmed_volume)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  />
                </label>

                <label className="block">
                  <div className="mb-1 text-xs font-medium text-zinc-600">Loading photos *</div>
                  <input
                    type="file"
                    name={fieldName(["loading_photos"])}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs"
                  />
                  {sub.loading_photo_doc_id ? (
                    <a
                      href={`/api/documents/${sub.loading_photo_doc_id}`}
                      className="mt-1 inline-block text-xs text-zinc-600 hover:underline"
                    >
                      View latest photo
                    </a>
                  ) : null}
                </label>
              </div>

              <label className="mt-3 block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Remarks</div>
                <textarea
                  name={fieldName(["remarks"])}
                  defaultValue={stringValue(sub.loading_values.remarks)}
                  rows={2}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </label>

              <div className="mt-3 flex justify-end">
                <PendingSubmitButton
                  label="Save loading"
                  pendingLabel="Saving..."
                  disabled={!canEdit}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                />
              </div>
            </form>
          ))}
        </div>
      ) : null}

      {tab === "invoice" && invoiceStep ? (
        <ExportInvoiceStepForm
          step={invoiceStep}
          updateAction={updateMasterStepAction}
          returnTo={returnTo(baseUrl, "invoice")}
          canEdit={canEdit}
          isAdmin={isAdmin}
          canFinalizeInvoice={masterStatus.canFinalizeInvoice}
          prerequisiteMessage={invoicePrerequisiteMessage}
          latestDocsByType={latestDocsByType}
        />
      ) : null}

      {tab === "agents" && agentsStep ? (
        <CustomsAgentsStepForm
          step={agentsStep}
          updateAction={updateMasterStepAction}
          returnTo={returnTo(baseUrl, "agents")}
          canEdit={canEdit}
          isAdmin={isAdmin}
          brokers={brokers}
          consigneeParties={customers}
          routeId={routeId}
          naseebModeLock={routeId === "JAFZA_TO_SYRIA" ? "ZAXON" : undefined}
        />
      ) : null}

      {tab === "tracking" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-3">
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              <AppIcon name="icon-route" size={19} />
              Route timeline
            </div>
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max items-center gap-2">
                {trackingRegionStates.map((entry, index) => {
                  const tone =
                    entry.stepStatus === "DONE"
                      ? "done"
                      : entry.stalled
                        ? "stalled"
                        : trackingTab === entry.id
                          ? "active"
                          : entry.stepStatus === "IN_PROGRESS"
                            ? "active"
                            : "pending";
                  const buttonClass =
                    tone === "done"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : tone === "stalled"
                        ? "border-red-300 bg-red-50 text-red-900"
                        : tone === "active"
                          ? "border-blue-300 bg-blue-50 text-blue-900"
                          : "border-zinc-200 bg-white text-zinc-700";
                  const dotClass =
                    tone === "done"
                      ? "bg-emerald-500"
                      : tone === "stalled"
                        ? "bg-red-500"
                        : tone === "active"
                          ? "bg-blue-500"
                          : "bg-zinc-300";

                  return (
                    <div key={entry.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTrackingTab(entry.id as LtlMasterTrackingTab)}
                        className={`w-32 rounded-lg border px-3 py-2 text-left text-xs transition ${buttonClass}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                          <span className="font-semibold">
                            {entry.label} ({entry.code})
                          </span>
                        </div>
                        <div className="mt-1 opacity-80">
                          {entry.stepStatus === "DONE"
                            ? "Completed"
                            : entry.stalled
                              ? "Stalled"
                              : entry.stepStatus === "IN_PROGRESS"
                                ? "In progress"
                                : "Pending"}
                        </div>
                      </button>
                      {index < trackingRegionStates.length - 1 ? (
                        <div
                          className={`h-[3px] w-8 rounded-full ${
                            entry.stepStatus === "DONE"
                              ? "bg-emerald-400"
                              : entry.stalled
                                ? "bg-red-400"
                                : "bg-zinc-300"
                          }`}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {(() => {
            const activeStep = stepForTrackingTab(trackingTab);
            const missingStepName =
              trackingTab === "uae"
                ? LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingUae
                : trackingTab === "ksa"
                  ? LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingKsa
                  : trackingTab === "jordan"
                    ? LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingJordan
                    : LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingSyria;
            if (!activeStep) {
              return <MissingStep name={missingStepName} />;
            }

            return (
              <TrackingStepForm
                step={activeStep}
                updateAction={updateMasterStepAction}
                returnTo={returnTo(baseUrl, "tracking", trackingTab)}
                canEdit={canEdit}
                isAdmin={isAdmin}
                latestDocsByType={latestDocsByType}
                region={trackingTab as TrackingRegion}
                routeId={routeId}
                locked={!masterStatus.trackingUnlocked}
                lockedMessage={
                  !masterStatus.trackingUnlocked
                    ? "Tracking starts after loading and invoice are done."
                    : undefined
                }
                syriaClearanceMode={
                  routeId === "JAFZA_TO_SYRIA"
                    ? "ZAXON"
                    : getString(gateValues.naseeb_clearance_mode).toUpperCase() === "ZAXON"
                      ? "ZAXON"
                      : "CLIENT"
                }
                agentGate={trackingAgentGate}
              />
            );
          })()}
        </div>
      ) : null}

      {tab === "handover" && warehouseStep ? (
        <div className="space-y-4">
          <form action={saveMasterWarehouseArrivalAction}>
            <input type="hidden" name="returnTo" value={returnTo(baseUrl, "handover")} />
            <input type="hidden" name="stepId" value={warehouseStep.id} />

            <SectionFrame
              title={`${routeProfile.destination} warehouse gate`}
              description="Customer pickup or local delivery is enabled only after offload is completed."
              status={warehouseStep.status}
              canEdit={canEdit}
              isAdmin={isAdmin}
              saveLabel="Save warehouse status"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                  <input
                    type="hidden"
                    name={fieldName(["arrived_zaxon_syria_warehouse"])}
                    value=""
                  />
                  <input
                    type="checkbox"
                    name={fieldName(["arrived_zaxon_syria_warehouse"])}
                    value="1"
                    defaultChecked={isTruthy(warehouseValues.arrived_zaxon_syria_warehouse)}
                  />
                  Arrived at Zaxon {routeProfile.destination} warehouse
                </label>
                <label className="block">
                  <div className="mb-1 text-xs font-medium text-zinc-600">Arrival date</div>
                  <DatePickerInput
                    
                    name={fieldName(["arrival_date"])}
                    defaultValue={stringValue(warehouseValues.arrival_date)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                   />
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                  <input
                    type="hidden"
                    name={fieldName(["offloaded_zaxon_syria_warehouse"])}
                    value=""
                  />
                  <input
                    type="checkbox"
                    name={fieldName(["offloaded_zaxon_syria_warehouse"])}
                    value="1"
                    defaultChecked={isTruthy(warehouseValues.offloaded_zaxon_syria_warehouse)}
                  />
                  Offloaded at Zaxon {routeProfile.destination} warehouse
                </label>
                <label className="block">
                  <div className="mb-1 text-xs font-medium text-zinc-600">Offload date</div>
                  <DatePickerInput
                    
                    name={fieldName(["offload_date"])}
                    defaultValue={stringValue(warehouseValues.offload_date)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                   />
                </label>
              </div>

              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">
                  Damaged cargo / missing items notes
                </div>
                <textarea
                  name={fieldName(["damaged_missing_notes"])}
                  defaultValue={stringValue(warehouseValues.damaged_missing_notes)}
                  rows={3}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">Photos</div>
                <input
                  type="file"
                  name={fieldName(["offload_photos"])}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs"
                />
              </label>
            </SectionFrame>
          </form>

          {!warehouseState.offloaded ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Customer pickup/delivery actions are blocked until master offload is complete.
            </div>
          ) : null}

          {subshipments.map((sub) => (
            <HandoverSubshipmentForm
              key={`handover-${sub.id}`}
              sub={sub}
              canEdit={canEdit}
              warehouseOffloaded={warehouseState.offloaded}
              returnToUrl={returnTo(baseUrl, "handover")}
              action={updateSubshipmentHandoverAction}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

