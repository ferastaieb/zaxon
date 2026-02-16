"use client";

import { useMemo, useState } from "react";

import {
  IMPORT_TRANSFER_COLLECTION_PERFORMED_BY,
  IMPORT_TRANSFER_OUTCOME_TYPES,
  IMPORT_TRANSFER_VEHICLE_SIZES,
  IMPORT_TRANSFER_VEHICLE_TYPES,
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

type Props = {
  step: ImportTransferStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  isAdmin: boolean;
  boeDone: boolean;
};

type VehicleDraft = {
  vehicle_type: string;
  vehicle_size: string;
  vehicle_count: string;
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
  const [cargoDeliveredToZaxon, setCargoDeliveredToZaxon] = useState(
    boolValue(values.cargo_delivered_to_zaxon),
  );
  const [cargoCollected, setCargoCollected] = useState(
    boolValue(values.cargo_collected),
  );
  const [collectedByExportTruck, setCollectedByExportTruck] = useState(
    boolValue(values.collected_by_export_truck),
  );
  const [vehicles, setVehicles] = useState<VehicleDraft[]>(() =>
    initialVehicleRows.map((row) => ({
      vehicle_type: stringValue(row.vehicle_type),
      vehicle_size: stringValue(row.vehicle_size),
      vehicle_count: stringValue(row.vehicle_count),
    })),
  );

  const removeIndices = useMemo(() => {
    const removals: number[] = [];
    for (let index = vehicles.length; index < initialVehicleRows.length; index += 1) {
      removals.push(index);
    }
    return removals;
  }, [initialVehicleRows.length, vehicles.length]);

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {removeIndices.map((index) => (
        <input
          key={`vehicle-remove-${index}`}
          type="hidden"
          name={fieldRemoveName(["vehicles", String(index)])}
          value="1"
        />
      ))}
      <SectionFrame
        title="Collection and Outcome"
        description="Plan collection setup first, then register real execution events."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
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
                  name={fieldName(["outcome_type"])}
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
                <input
                  type="date"
                  name={fieldName(["planned_collection_date"])}
                  defaultValue={stringValue(values.planned_collection_date)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                  Collection performed by *
                </div>
                <select
                  name={fieldName(["collection_performed_by"])}
                  defaultValue={stringValue(values.collection_performed_by)}
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
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                  Vehicles (optional)
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setVehicles((prev) => [
                        ...prev,
                        { vehicle_type: "", vehicle_size: "", vehicle_count: "" },
                      ])
                    }
                    className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Add vehicle
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
                  <div className="text-xs text-zinc-500">No vehicles added.</div>
                ) : null}
                {vehicles.map((row, index) => (
                  <div
                    key={`vehicle-${index}`}
                    className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 md:grid-cols-3"
                  >
                    <label className="block">
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                        Vehicle type
                      </div>
                      <select
                        name={fieldName(["vehicles", String(index), "vehicle_type"])}
                        value={row.vehicle_type}
                        onChange={(event) =>
                          setVehicles((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], vehicle_type: event.target.value };
                            return next;
                          })
                        }
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Select</option>
                        {IMPORT_TRANSFER_VEHICLE_TYPES.map((option) => (
                          <option key={option} value={option}>
                            {option === "PICKUP" ? "Pickup" : "Trailer"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                        Vehicle size
                      </div>
                      <select
                        name={fieldName(["vehicles", String(index), "vehicle_size"])}
                        value={row.vehicle_size}
                        onChange={(event) =>
                          setVehicles((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], vehicle_size: event.target.value };
                            return next;
                          })
                        }
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Select</option>
                        {IMPORT_TRANSFER_VEHICLE_SIZES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
                        Vehicle count
                      </div>
                      <input
                        type="number"
                        min={0}
                        step="1"
                        name={fieldName(["vehicles", String(index), "vehicle_count"])}
                        value={row.vehicle_count}
                        onChange={(event) =>
                          setVehicles((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], vehicle_count: event.target.value };
                            return next;
                          })
                        }
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      />
                    </label>
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
                <input type="hidden" name={fieldName(["cargo_collected"])} value="" />
                <input
                  type="checkbox"
                  name={fieldName(["cargo_collected"])}
                  value="1"
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
                <input
                  type="date"
                  name={fieldName(["collected_date"])}
                  defaultValue={stringValue(values.collected_date)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>

            {outcomeType === "DELIVER_TO_ZAXON_WAREHOUSE" ? (
              <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
                <label className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                  <input
                    type="hidden"
                    name={fieldName(["cargo_delivered_to_zaxon"])}
                    value=""
                  />
                  <input
                    type="checkbox"
                    name={fieldName(["cargo_delivered_to_zaxon"])}
                    value="1"
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
                  <input
                    type="date"
                    name={fieldName(["dropoff_date"])}
                    defaultValue={stringValue(values.dropoff_date)}
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
                        name={fieldName(["pending_reason"])}
                        defaultValue={stringValue(values.pending_reason)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                        placeholder="Reason is required while pending collection"
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                        Expected collection date
                      </div>
                      <input
                        type="date"
                        name={fieldName(["expected_collection_date"])}
                        defaultValue={stringValue(values.expected_collection_date)}
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

            {outcomeType === "DIRECT_EXPORT" ? (
              <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-3">
                <label className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                  <input
                    type="hidden"
                    name={fieldName(["collected_by_export_truck"])}
                    value=""
                  />
                  <input
                    type="checkbox"
                    name={fieldName(["collected_by_export_truck"])}
                    value="1"
                    checked={collectedByExportTruck}
                    onChange={(event) => setCollectedByExportTruck(event.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
                  />
                  <span className="font-medium text-zinc-800">
                    Collected by export truck
                  </span>
                </label>
                <label className="block">
                  <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                    Date
                  </div>
                  <input
                    type="date"
                    name={fieldName(["direct_export_date"])}
                    defaultValue={stringValue(values.direct_export_date)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>
            ) : null}
          </div>
        ) : null}
      </SectionFrame>
    </form>
  );
}
