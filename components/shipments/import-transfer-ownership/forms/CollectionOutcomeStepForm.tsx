"use client";

import { useMemo, useState } from "react";

import {
  IMPORT_TRANSFER_COLLECTION_PERFORMED_BY,
  IMPORT_TRANSFER_OUTCOME_TYPES,
  IMPORT_TRANSFER_TRAILER_TYPES,
} from "@/lib/importTransferOwnership/constants";
import type { ImportTransferStepData } from "../types";
import {
  boolValue,
  fieldName,
  fieldRemoveName,
  stringValue,
  toGroupRows,
  toRecord,
} from "../fieldNames";
import { SectionFrame } from "@/components/shipments/ftl-export/forms/SectionFrame";
import { DatePickerInput } from "@/components/ui/DatePickerInput";

type Props = {
  step: ImportTransferStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  isAdmin: boolean;
  boeDone: boolean;
};

type VehicleDraft = {
  trailer_type: string;
  truck_count: string;
  truck_number: string;
  truck_loaded: boolean;
  truck_loaded_date: string;
};

function normalizeOutcomeLabel(value: string) {
  if (value === "DELIVER_TO_ZAXON_WAREHOUSE") return "Deliver to Zaxon Warehouse";
  if (value === "DIRECT_EXPORT") return "Direct Export";
  return value;
}

function normalizePerformerLabel(value: string) {
  if (value === "ZAXON") return "Zaxon";
  if (value === "SUPPLIER") return "Supplier";
  return value;
}

function computeLatestDate(values: string[]) {
  const valid = values.filter(Boolean).sort();
  return valid[valid.length - 1] ?? "";
}

export function CollectionOutcomeStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  isAdmin,
  boeDone,
}: Props) {
  const values = toRecord(step.values);
  const initialVehicleRows = toGroupRows(step.values, "vehicles");
  const [tab, setTab] = useState<"plan" | "execution">("plan");
  const [outcomeType, setOutcomeType] = useState(
    stringValue(values.outcome_type) || "DELIVER_TO_ZAXON_WAREHOUSE",
  );
  const [plannedCollectionDate, setPlannedCollectionDate] = useState(
    stringValue(values.planned_collection_date),
  );
  const [collectionPerformedBy, setCollectionPerformedBy] = useState(
    stringValue(values.collection_performed_by),
  );
  const [cargoDeliveredToZaxon, setCargoDeliveredToZaxon] = useState(
    boolValue(values.cargo_delivered_to_zaxon),
  );
  const [cargoCollected, setCargoCollected] = useState(
    boolValue(values.cargo_collected),
  );
  const [collectedDate, setCollectedDate] = useState(stringValue(values.collected_date));
  const [dropoffDate, setDropoffDate] = useState(stringValue(values.dropoff_date));
  const [pendingReason, setPendingReason] = useState(stringValue(values.pending_reason));
  const [expectedCollectionDate, setExpectedCollectionDate] = useState(
    stringValue(values.expected_collection_date),
  );
  const [vehicles, setVehicles] = useState<VehicleDraft[]>(() =>
    initialVehicleRows.map((row) => ({
      trailer_type: stringValue(row.trailer_type || row.vehicle_size),
      truck_count: stringValue(row.truck_count || row.vehicle_count),
      truck_number: stringValue(row.truck_number),
      truck_loaded: boolValue(row.truck_loaded),
      truck_loaded_date: stringValue(row.truck_loaded_date),
    })),
  );

  const isDirectExport = outcomeType === "DIRECT_EXPORT";
  const removeIndices = useMemo(() => {
    const removals: number[] = [];
    for (let index = vehicles.length; index < initialVehicleRows.length; index += 1) {
      removals.push(index);
    }
    return removals;
  }, [initialVehicleRows.length, vehicles.length]);
  const activeVehicleRows = vehicles.filter(
    (row) =>
      !!row.trailer_type ||
      !!row.truck_count ||
      !!row.truck_number ||
      row.truck_loaded ||
      !!row.truck_loaded_date,
  );
  const loadedTruckCount = activeVehicleRows.filter((row) => row.truck_loaded).length;
  const allDirectExportLoaded =
    isDirectExport &&
    activeVehicleRows.length > 0 &&
    activeVehicleRows.every(
      (row) =>
        !!row.trailer_type &&
        !!row.truck_number &&
        row.truck_loaded &&
        !!row.truck_loaded_date,
    );
  const loadingFinishedDate = computeLatestDate(
    activeVehicleRows
      .map((row) => row.truck_loaded_date)
      .filter((value) => !!value),
  );

  const updateVehicle = (index: number, patch: Partial<VehicleDraft>) => {
    setVehicles((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name={fieldName(["outcome_type"])} value={outcomeType} />
      <input
        type="hidden"
        name={fieldName(["planned_collection_date"])}
        value={plannedCollectionDate}
      />
      <input
        type="hidden"
        name={fieldName(["collection_performed_by"])}
        value={collectionPerformedBy}
      />
      <input
        type="hidden"
        name={fieldName(["cargo_collected"])}
        value={cargoCollected ? "1" : ""}
      />
      <input type="hidden" name={fieldName(["collected_date"])} value={collectedDate} />
      <input
        type="hidden"
        name={fieldName(["cargo_delivered_to_zaxon"])}
        value={
          outcomeType === "DELIVER_TO_ZAXON_WAREHOUSE" && cargoDeliveredToZaxon ? "1" : ""
        }
      />
      <input
        type="hidden"
        name={fieldName(["dropoff_date"])}
        value={outcomeType === "DELIVER_TO_ZAXON_WAREHOUSE" ? dropoffDate : ""}
      />
      <input
        type="hidden"
        name={fieldName(["pending_reason"])}
        value={outcomeType === "DELIVER_TO_ZAXON_WAREHOUSE" ? pendingReason : ""}
      />
      <input
        type="hidden"
        name={fieldName(["expected_collection_date"])}
        value={outcomeType === "DELIVER_TO_ZAXON_WAREHOUSE" ? expectedCollectionDate : ""}
      />
      <input
        type="hidden"
        name={fieldName(["collected_by_export_truck"])}
        value={isDirectExport && allDirectExportLoaded ? "1" : ""}
      />
      <input
        type="hidden"
        name={fieldName(["direct_export_date"])}
        value={isDirectExport ? loadingFinishedDate : ""}
      />
      {removeIndices.map((index) => (
        <input
          key={`vehicle-remove-${index}`}
          type="hidden"
          name={fieldRemoveName(["vehicles", String(index)])}
          value="1"
        />
      ))}
      {vehicles.map((row, index) => (
        <div key={`vehicle-hidden-${index}`}>
          <input
            type="hidden"
            name={fieldName(["vehicles", String(index), "trailer_type"])}
            value={row.trailer_type}
          />
          <input
            type="hidden"
            name={fieldName(["vehicles", String(index), "truck_count"])}
            value={isDirectExport ? "1" : row.truck_count}
          />
          <input
            type="hidden"
            name={fieldName(["vehicles", String(index), "truck_number"])}
            value={isDirectExport ? row.truck_number : ""}
          />
          <input
            type="hidden"
            name={fieldName(["vehicles", String(index), "truck_loaded"])}
            value={isDirectExport && row.truck_loaded ? "1" : ""}
          />
          <input
            type="hidden"
            name={fieldName(["vehicles", String(index), "truck_loaded_date"])}
            value={isDirectExport ? row.truck_loaded_date : ""}
          />
        </div>
      ))}
      <SectionFrame
        title="Collection and Outcome"
        description="Plan collection first, then complete execution and direct-export truck loading."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        lockOnDone={false}
        saveLabel="Save collection and outcome"
        disabledMessage={
          !boeDone
            ? "BOE should be completed to mark this step done. You can still save draft values."
            : undefined
        }
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("plan")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === "plan"
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Collection plan
          </button>
          <button
            type="button"
            onClick={() => setTab("execution")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === "execution"
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Collection execution
          </button>
        </div>

        {tab === "plan" ? (
          <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                  Outcome type *
                </div>
                <select
                  value={outcomeType}
                  onChange={(event) => setOutcomeType(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  {IMPORT_TRANSFER_OUTCOME_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {normalizeOutcomeLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                  Planned collection date
                </div>
                <DatePickerInput
                  value={plannedCollectionDate}
                  onChange={(event) => setPlannedCollectionDate(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                  Collection performed by *
                </div>
                <select
                  value={collectionPerformedBy}
                  onChange={(event) => setCollectionPerformedBy(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select</option>
                  {IMPORT_TRANSFER_COLLECTION_PERFORMED_BY.map((option) => (
                    <option key={option} value={option}>
                      {normalizePerformerLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                    Trucks
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {isDirectExport
                      ? "Each row represents one truck for direct export."
                      : "Use truck count when multiple trucks share the same trailer type."}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setVehicles((prev) => [
                        ...prev,
                        {
                          trailer_type: "",
                          truck_count: "",
                          truck_number: "",
                          truck_loaded: false,
                          truck_loaded_date: "",
                        },
                      ])
                    }
                    className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Add truck
                  </button>
                  <button
                    type="button"
                    onClick={() => setVehicles((prev) => prev.slice(0, -1))}
                    disabled={vehicles.length === 0}
                    className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove last
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {vehicles.length === 0 ? (
                  <div className="text-xs text-zinc-500">No trucks added.</div>
                ) : null}
                {vehicles.map((row, index) => (
                  <div
                    key={`vehicle-${index}`}
                    className={`grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 ${
                      isDirectExport ? "md:grid-cols-2" : "md:grid-cols-2"
                    }`}
                  >
                    <label className="block">
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                        Trailer type
                      </div>
                      <select
                        value={row.trailer_type}
                        onChange={(event) =>
                          updateVehicle(index, { trailer_type: event.target.value })
                        }
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Select</option>
                        {IMPORT_TRANSFER_TRAILER_TYPES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    {isDirectExport ? (
                      <label className="block">
                        <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                          Truck number
                        </div>
                        <input
                          value={row.truck_number}
                          onChange={(event) =>
                            updateVehicle(index, { truck_number: event.target.value })
                          }
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                          placeholder="Enter truck number"
                        />
                      </label>
                    ) : (
                      <label className="block">
                        <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                          Truck count
                        </div>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={row.truck_count}
                          onChange={(event) =>
                            updateVehicle(index, { truck_count: event.target.value })
                          }
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {tab === "execution" ? (
          <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={cargoCollected}
                  onChange={(event) => setCargoCollected(event.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
                />
                <span className="font-medium text-zinc-800">Cargo collected</span>
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                  Collected date
                </div>
                <DatePickerInput
                  value={collectedDate}
                  onChange={(event) => setCollectedDate(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>

            {outcomeType === "DELIVER_TO_ZAXON_WAREHOUSE" ? (
              <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
                <label className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={cargoDeliveredToZaxon}
                    onChange={(event) => setCargoDeliveredToZaxon(event.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
                  />
                  <span className="font-medium text-zinc-800">
                    Cargo delivered to Zaxon warehouse
                  </span>
                </label>
                <label className="block">
                  <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                    Drop-off date
                  </div>
                  <DatePickerInput
                    value={dropoffDate}
                    onChange={(event) => setDropoffDate(event.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
                {!cargoDeliveredToZaxon ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block md:col-span-2">
                      <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                        Pending reason *
                      </div>
                      <input
                        value={pendingReason}
                        onChange={(event) => setPendingReason(event.target.value)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                        placeholder="Reason is required while pending collection"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                        Expected collection date
                      </div>
                      <DatePickerInput
                        value={expectedCollectionDate}
                        onChange={(event) => setExpectedCollectionDate(event.target.value)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="flex items-end rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Status: Pending Collection
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isDirectExport ? (
              <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                      Trucks loaded
                    </div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">
                      {loadedTruckCount} / {activeVehicleRows.length || 0}
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 md:col-span-2">
                    <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                      Loading finished date
                    </div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">
                      {loadingFinishedDate || "-"}
                    </div>
                  </div>
                </div>

                {vehicles.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Add the direct export trucks in Collection plan first.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {vehicles.map((row, index) => (
                      <div
                        key={`execution-truck-${index}`}
                        className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-[1fr_180px_180px]"
                      >
                        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
                          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                            Truck
                          </div>
                          <div className="mt-1 font-medium text-zinc-900">
                            {row.truck_number || `Truck ${index + 1}`}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {row.trailer_type || "Trailer type not set"}
                          </div>
                        </div>
                        <label className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={row.truck_loaded}
                            onChange={(event) =>
                              updateVehicle(index, { truck_loaded: event.target.checked })
                            }
                            className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
                          />
                          <span className="font-medium text-zinc-800">Truck loaded</span>
                        </label>
                        <label className="block">
                          <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                            Loading date
                          </div>
                          <DatePickerInput
                            value={row.truck_loaded_date}
                            onChange={(event) =>
                              updateVehicle(index, { truck_loaded_date: event.target.value })
                            }
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </SectionFrame>
    </form>
  );
}
