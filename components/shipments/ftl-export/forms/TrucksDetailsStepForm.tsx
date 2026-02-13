"use client";

import { useMemo, useState } from "react";

import type { FtlStepData } from "../types";
import {
  boolValue,
  fieldName,
  numberValue,
  stringValue,
  toGroupRows,
  toRecord,
} from "../fieldNames";
import { SectionFrame } from "./SectionFrame";

type PlanningTruckType = {
  truck_type: string;
  truck_count: string;
};

type TruckCard = {
  truck_reference: string;
  booking_status: "PENDING" | "BOOKED" | "CANCELLED";
  truck_booked: boolean;
  booking_date: string;
  estimated_loading_date: string;
  truck_number: string;
  trailer_type: string;
  driver_name: string;
  driver_contact: string;
  cancellation_reason: string;
  booking_notes: string;
};

function emptyTruck(index: number): TruckCard {
  return {
    truck_reference: `Truck ${index + 1}`,
    booking_status: "PENDING",
    truck_booked: false,
    booking_date: "",
    estimated_loading_date: "",
    truck_number: "",
    trailer_type: "",
    driver_name: "",
    driver_contact: "",
    cancellation_reason: "",
    booking_notes: "",
  };
}

function mapTruck(row: Record<string, unknown>, index: number): TruckCard {
  const status = stringValue(row.booking_status).toUpperCase();
  const normalizedStatus =
    status === "BOOKED" || status === "CANCELLED" ? status : "PENDING";
  return {
    truck_reference: stringValue(row.truck_reference) || `Truck ${index + 1}`,
    booking_status: normalizedStatus,
    truck_booked: boolValue(row.truck_booked) || normalizedStatus === "BOOKED",
    booking_date: stringValue(row.booking_date),
    estimated_loading_date: stringValue(row.estimated_loading_date),
    truck_number: stringValue(row.truck_number),
    trailer_type: stringValue(row.trailer_type),
    driver_name: stringValue(row.driver_name),
    driver_contact: stringValue(row.driver_contact),
    cancellation_reason: stringValue(row.cancellation_reason),
    booking_notes: stringValue(row.booking_notes),
  };
}

type Props = {
  step: FtlStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  isAdmin: boolean;
  invoiceFinalized: boolean;
};

export function TrucksDetailsStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  isAdmin,
  invoiceFinalized,
}: Props) {
  const values = toRecord(step.values);
  const initialRows = toGroupRows(step.values, "trucks").map(mapTruck);
  const [subtab, setSubtab] = useState<"planning" | "booking">("planning");
  const [plannedTotal, setPlannedTotal] = useState(
    stringValue(values.total_trucks_planned) ||
      String(initialRows.filter((row) => row.booking_status !== "CANCELLED").length || ""),
  );
  const [bookingRequiredBy, setBookingRequiredBy] = useState(
    stringValue(values.trucks_booking_required_by),
  );
  const [plannedTypes, setPlannedTypes] = useState<PlanningTruckType[]>(
    toGroupRows(step.values, "planned_truck_types").map((row) => ({
      truck_type: stringValue(row.truck_type),
      truck_count: stringValue(row.truck_count),
    })),
  );
  const [trucks, setTrucks] = useState<TruckCard[]>(initialRows.length ? initialRows : []);
  const [varianceNotes, setVarianceNotes] = useState(stringValue(values.variance_notes));

  const activeTrucks = useMemo(
    () => trucks.filter((truck) => truck.booking_status !== "CANCELLED"),
    [trucks],
  );
  const plannedNumber = numberValue(plannedTotal, 0);
  const actualNumber = activeTrucks.length;
  const variance = actualNumber - plannedNumber;

  const applyPlannedCards = () => {
    if (!plannedNumber || plannedNumber <= 0) return;
    setTrucks((prev) => {
      const current = [...prev];
      while (current.length < plannedNumber) {
        current.push(emptyTruck(current.length));
      }
      return current;
    });
  };

  const addTruck = () => {
    setTrucks((prev) => [
      ...prev,
      {
        ...emptyTruck(prev.length),
        booking_status: "BOOKED",
        truck_booked: true,
      },
    ]);
    setSubtab("booking");
  };

  const updateTruck = (index: number, patch: Partial<TruckCard>) => {
    setTrucks((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      next[index] = { ...current, ...patch };
      return next;
    });
  };

  const toggleCancelled = (index: number, cancelled: boolean) => {
    setTrucks((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      if (cancelled) {
        next[index] = { ...current, booking_status: "CANCELLED", truck_booked: false };
      } else {
        next[index] = { ...current, booking_status: "PENDING", cancellation_reason: "" };
      }
      return next;
    });
  };

  const disableEdit = !canEdit || (invoiceFinalized && !isAdmin);

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name={fieldName(["planned_trucks_snapshot"])} value={plannedTotal} />
      <input type="hidden" name={fieldName(["actual_trucks_count"])} value={String(actualNumber)} />

      <SectionFrame
        title="Trucks Details"
        description="Plan trucks first, then complete booking cards with statuses and driver details."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        saveLabel="Save trucks"
        disabled={invoiceFinalized && !isAdmin}
        disabledMessage={
          invoiceFinalized && !isAdmin
            ? "Truck booking/details are locked after invoice finalization."
            : undefined
        }
        before={
          <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-zinc-500">Planned trucks</div>
              <div className="font-semibold text-zinc-900">{plannedNumber}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Actual trucks</div>
              <div className="font-semibold text-zinc-900">{actualNumber}</div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Variance</div>
              <div
                className={`font-semibold ${
                  variance > 0 ? "text-amber-700" : variance < 0 ? "text-blue-700" : "text-zinc-900"
                }`}
              >
                {variance}
              </div>
            </div>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSubtab("planning")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              subtab === "planning"
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Planning
          </button>
          <button
            type="button"
            onClick={() => setSubtab("booking")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              subtab === "booking"
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Booking
          </button>
        </div>

        {subtab === "planning" ? (
          <div className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">
                  Total number of trucks planned
                </div>
                <input
                  type="number"
                  min={0}
                  value={plannedTotal}
                  onChange={(event) => setPlannedTotal(event.target.value)}
                  name={fieldName(["total_trucks_planned"])}
                  disabled={disableEdit}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-medium text-zinc-600">
                  Trucks booking required by
                </div>
                <input
                  type="date"
                  value={bookingRequiredBy}
                  onChange={(event) => setBookingRequiredBy(event.target.value)}
                  name={fieldName(["trucks_booking_required_by"])}
                  disabled={disableEdit}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                />
              </label>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="mb-2 text-xs font-medium text-zinc-700">Planned truck types</div>
              <div className="space-y-2">
                {plannedTypes.map((entry, index) => (
                  <div key={`ptype-${index}`} className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                    <input
                      type="text"
                      value={entry.truck_type}
                      onChange={(event) =>
                        setPlannedTypes((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], truck_type: event.target.value };
                          return next;
                        })
                      }
                      placeholder="Truck type"
                      disabled={disableEdit}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                    />
                    <input
                      type="number"
                      min={0}
                      value={entry.truck_count}
                      onChange={(event) =>
                        setPlannedTypes((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], truck_count: event.target.value };
                          return next;
                        })
                      }
                      placeholder="Count"
                      disabled={disableEdit}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setPlannedTypes((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                      }
                      disabled={disableEdit}
                      className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-700 hover:bg-red-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                    >
                      Remove
                    </button>
                    <input
                      type="hidden"
                      name={fieldName(["planned_truck_types", String(index), "truck_type"])}
                      value={entry.truck_type}
                    />
                    <input
                      type="hidden"
                      name={fieldName(["planned_truck_types", String(index), "truck_count"])}
                      value={entry.truck_count}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setPlannedTypes((prev) => [...prev, { truck_type: "", truck_count: "" }])
                  }
                  disabled={disableEdit}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                >
                  Add type
                </button>
                <button
                  type="button"
                  onClick={applyPlannedCards}
                  disabled={disableEdit || plannedNumber <= 0}
                  className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                >
                  Generate truck cards from planned total
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {subtab === "booking" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-zinc-600">
                Update booking status per truck. Cancelled trucks stay in history and can be restored.
              </div>
              <button
                type="button"
                onClick={addTruck}
                disabled={disableEdit}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                Add booked truck
              </button>
            </div>

            {trucks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-sm text-zinc-600">
                No truck cards yet. Set planned total and generate cards, or add a booked truck.
              </div>
            ) : null}

            {trucks.map((truck, index) => {
              const isCancelled = truck.booking_status === "CANCELLED";
              const isBooked = truck.booking_status === "BOOKED" || truck.truck_booked;
              return (
                <div
                  key={`truck-${index}`}
                  className={`rounded-xl border p-4 ${
                    isCancelled ? "border-amber-200 bg-amber-50/70" : "border-zinc-200 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-zinc-900">{truck.truck_reference || `Truck ${index + 1}`}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={truck.booking_status}
                        onChange={(event) =>
                          updateTruck(index, {
                            booking_status: event.target.value as TruckCard["booking_status"],
                            truck_booked: event.target.value === "BOOKED",
                          })
                        }
                        disabled={disableEdit}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:bg-zinc-100"
                      >
                        <option value="PENDING">Pending</option>
                        <option value="BOOKED">Booked</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                      {isCancelled ? (
                        <button
                          type="button"
                          onClick={() => toggleCancelled(index, false)}
                          disabled={disableEdit}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                        >
                          Restore to pending
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleCancelled(index, true)}
                          disabled={disableEdit}
                          className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                        >
                          Cancel truck
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                      <input
                        type="hidden"
                        name={fieldName(["trucks", String(index), "truck_booked"])}
                        value=""
                      />
                      <input
                        type="checkbox"
                        name={fieldName(["trucks", String(index), "truck_booked"])}
                        value="1"
                        checked={truck.truck_booked}
                        onChange={(event) =>
                          updateTruck(index, {
                            truck_booked: event.target.checked,
                            booking_status: event.target.checked ? "BOOKED" : "PENDING",
                          })
                        }
                        disabled={disableEdit || isCancelled}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                      <span>Truck booked</span>
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs font-medium text-zinc-600">
                        Booking date {isBooked ? "*" : ""}
                      </div>
                      <input
                        type="date"
                        value={truck.booking_date}
                        onChange={(event) => updateTruck(index, { booking_date: event.target.value })}
                        name={fieldName(["trucks", String(index), "booking_date"])}
                        required={isBooked}
                        disabled={disableEdit || isCancelled}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs font-medium text-zinc-600">Estimated loading date</div>
                      <input
                        type="date"
                        value={truck.estimated_loading_date}
                        onChange={(event) =>
                          updateTruck(index, { estimated_loading_date: event.target.value })
                        }
                        name={fieldName(["trucks", String(index), "estimated_loading_date"])}
                        disabled={disableEdit || isCancelled}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs font-medium text-zinc-600">Truck number</div>
                      <input
                        type="text"
                        value={truck.truck_number}
                        onChange={(event) => updateTruck(index, { truck_number: event.target.value })}
                        name={fieldName(["trucks", String(index), "truck_number"])}
                        disabled={disableEdit || isCancelled}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs font-medium text-zinc-600">Trailer type</div>
                      <input
                        type="text"
                        value={truck.trailer_type}
                        onChange={(event) => updateTruck(index, { trailer_type: event.target.value })}
                        name={fieldName(["trucks", String(index), "trailer_type"])}
                        disabled={disableEdit || isCancelled}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs font-medium text-zinc-600">Driver name</div>
                      <input
                        type="text"
                        value={truck.driver_name}
                        onChange={(event) => updateTruck(index, { driver_name: event.target.value })}
                        name={fieldName(["trucks", String(index), "driver_name"])}
                        disabled={disableEdit || isCancelled}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                    </label>

                    <label className="block">
                      <div className="mb-1 text-xs font-medium text-zinc-600">Driver contact</div>
                      <input
                        type="text"
                        value={truck.driver_contact}
                        onChange={(event) => updateTruck(index, { driver_contact: event.target.value })}
                        name={fieldName(["trucks", String(index), "driver_contact"])}
                        disabled={disableEdit || isCancelled}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                    </label>
                  </div>

                  {isCancelled ? (
                    <label className="mt-3 block">
                      <div className="mb-1 text-xs font-medium text-zinc-600">Cancellation reason</div>
                      <textarea
                        value={truck.cancellation_reason}
                        onChange={(event) =>
                          updateTruck(index, { cancellation_reason: event.target.value })
                        }
                        name={fieldName(["trucks", String(index), "cancellation_reason"])}
                        disabled={disableEdit}
                        className="min-h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                    </label>
                  ) : null}

                  <label className="mt-3 block">
                    <div className="mb-1 text-xs font-medium text-zinc-600">Booking remarks</div>
                    <textarea
                      value={truck.booking_notes}
                      onChange={(event) => updateTruck(index, { booking_notes: event.target.value })}
                      name={fieldName(["trucks", String(index), "booking_notes"])}
                      disabled={disableEdit || isCancelled}
                      className="min-h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                    />
                  </label>

                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "truck_reference"])}
                    value={truck.truck_reference || `Truck ${index + 1}`}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "booking_status"])}
                    value={truck.booking_status}
                  />
                </div>
              );
            })}
          </div>
        ) : null}

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Variance notes</div>
          <textarea
            name={fieldName(["variance_notes"])}
            value={varianceNotes}
            onChange={(event) => setVarianceNotes(event.target.value)}
            disabled={disableEdit}
            className="min-h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Notes</div>
          <textarea
            name="notes"
            defaultValue={step.notes ?? ""}
            disabled={disableEdit}
            className="min-h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
        </label>
      </SectionFrame>
    </form>
  );
}
