"use client";

import { useMemo, useState } from "react";

import { AppIllustration } from "@/components/ui/AppIllustration";
import { FTL_EXPORT_TRAILER_TYPES } from "@/lib/ftlExport/constants";
import type { FtlStepData } from "../types";
import { boolValue, fieldName, numberValue, stringValue, toGroupRows, toRecord } from "../fieldNames";
import { SectionFrame } from "./SectionFrame";

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

type TruckDefaults = {
  bookingDate: string;
  estimatedLoadingDate: string;
  trailerType: string;
};

type Props = {
  step: FtlStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  isAdmin: boolean;
  invoiceFinalized: boolean;
  defaultEstimatedLoadingDate?: string;
};

function todayIso() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function normalizeTrailerType(value: string) {
  const normalized = value.trim();
  return (FTL_EXPORT_TRAILER_TYPES as readonly string[]).includes(normalized)
    ? normalized
    : "";
}

function emptyTruck(index: number, defaults: TruckDefaults): TruckCard {
  return {
    truck_reference: `Truck ${index + 1}`,
    booking_status: "PENDING",
    truck_booked: false,
    booking_date: defaults.bookingDate,
    estimated_loading_date: defaults.estimatedLoadingDate,
    truck_number: "",
    trailer_type: defaults.trailerType,
    driver_name: "",
    driver_contact: "",
    cancellation_reason: "",
    booking_notes: "",
  };
}

function mapTruck(row: Record<string, unknown>, index: number, defaults: TruckDefaults): TruckCard {
  const status = stringValue(row.booking_status).toUpperCase();
  const normalizedStatus =
    status === "BOOKED" || status === "CANCELLED" ? status : "PENDING";
  const bookingDate = stringValue(row.booking_date);
  const isBooked =
    normalizedStatus === "BOOKED" || boolValue(row.truck_booked) || !!bookingDate;
  const bookingStatus: TruckCard["booking_status"] =
    normalizedStatus === "CANCELLED" ? "CANCELLED" : isBooked ? "BOOKED" : "PENDING";
  return {
    truck_reference: stringValue(row.truck_reference) || `Truck ${index + 1}`,
    booking_status: bookingStatus,
    truck_booked: bookingStatus === "BOOKED",
    booking_date: bookingDate || defaults.bookingDate,
    estimated_loading_date:
      stringValue(row.estimated_loading_date) || defaults.estimatedLoadingDate,
    truck_number: stringValue(row.truck_number),
    trailer_type:
      normalizeTrailerType(stringValue(row.trailer_type)) || defaults.trailerType,
    driver_name: stringValue(row.driver_name),
    driver_contact: stringValue(row.driver_contact),
    cancellation_reason: stringValue(row.cancellation_reason),
    booking_notes: stringValue(row.booking_notes),
  };
}

export function TrucksDetailsStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  isAdmin,
  invoiceFinalized,
  defaultEstimatedLoadingDate,
}: Props) {
  const values = toRecord(step.values);
  const today = useMemo(() => todayIso(), []);
  const estimatedDefault = defaultEstimatedLoadingDate || "";
  const truckRowsRaw = toGroupRows(step.values, "trucks");
  const savedPlannedRows = toGroupRows(step.values, "planned_trailers");
  const initialPlannedTotal = numberValue(values.total_trucks_planned, 0);
  const initialPlannedCount = Math.max(initialPlannedTotal, savedPlannedRows.length);
  const initialPlannedTrailers = Array.from({ length: initialPlannedCount }).map((_, index) => {
    const fromPlanning = normalizeTrailerType(
      stringValue(savedPlannedRows[index]?.trailer_type),
    );
    if (fromPlanning) return fromPlanning;
    return normalizeTrailerType(stringValue(truckRowsRaw[index]?.trailer_type));
  });
  const initialRows = truckRowsRaw.map((row, index) =>
    mapTruck(row, index, {
      bookingDate: "",
      estimatedLoadingDate: estimatedDefault,
      trailerType: initialPlannedTrailers[index] ?? "",
    }),
  );

  const [subtab, setSubtab] = useState<"planning" | "booking">("planning");
  const [plannedTotal, setPlannedTotal] = useState(
    stringValue(values.total_trucks_planned) ||
      String(initialRows.filter((row) => row.booking_status !== "CANCELLED").length || ""),
  );
  const [bookingRequiredBy, setBookingRequiredBy] = useState(
    stringValue(values.trucks_booking_required_by),
  );
  const [plannedTrailers, setPlannedTrailers] = useState<string[]>(initialPlannedTrailers);
  const [trucks, setTrucks] = useState<TruckCard[]>(() => {
    const minCount = Math.max(initialPlannedTotal, initialRows.length);
    const next = [...initialRows];
    while (next.length < minCount) {
      next.push(
        emptyTruck(next.length, {
          bookingDate: "",
          estimatedLoadingDate: estimatedDefault,
          trailerType: initialPlannedTrailers[next.length] ?? "",
        }),
      );
    }
    return next;
  });

  const plannedNumber = Math.max(0, Math.trunc(numberValue(plannedTotal, 0)));
  const activeTrucks = useMemo(
    () => trucks.filter((truck) => truck.booking_status !== "CANCELLED"),
    [trucks],
  );
  const actualNumber = activeTrucks.length;
  const variance = actualNumber - plannedNumber;
  const doneReadOnly = step.status === "DONE" && !isAdmin;
  const disableEdit = !canEdit || (invoiceFinalized && !isAdmin) || doneReadOnly;

  const ensureTruckCards = (count: number, trailers: string[]) => {
    if (count <= 0) return;
    setTrucks((prev) => {
      const next = [...prev];
      while (next.length < count) {
        next.push(
          emptyTruck(next.length, {
            bookingDate: "",
            estimatedLoadingDate: estimatedDefault,
            trailerType: trailers[next.length] ?? "",
          }),
        );
      }
      return next;
    });
  };

  const handlePlannedTotalChange = (value: string) => {
    setPlannedTotal(value);
    const nextCount = Math.max(0, Math.trunc(numberValue(value, 0)));
    setPlannedTrailers((prev) => {
      const next = [...prev];
      if (next.length > nextCount) {
        next.length = nextCount;
      } else {
        while (next.length < nextCount) {
          next.push("");
        }
      }
      ensureTruckCards(nextCount, next);
      return next;
    });
  };

  const updatePlannedTrailer = (index: number, trailerType: string) => {
    const nextTrailer = normalizeTrailerType(trailerType);
    const previousTrailer = plannedTrailers[index] ?? "";
    setPlannedTrailers((prev) => {
      const next = [...prev];
      next[index] = nextTrailer;
      return next;
    });
    setTrucks((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      if (!current.trailer_type || current.trailer_type === previousTrailer) {
        next[index] = { ...current, trailer_type: nextTrailer };
      }
      return next;
    });
  };

  const addTruck = () => {
    setTrucks((prev) => [
      ...prev,
      emptyTruck(prev.length, {
        bookingDate: "",
        estimatedLoadingDate: estimatedDefault,
        trailerType: plannedTrailers[prev.length] ?? "",
      }),
    ]);
    setSubtab("booking");
  };

  const updateTruck = (index: number, patch: Partial<TruckCard>) => {
    setTrucks((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const merged = { ...current, ...patch };
      if (!merged.estimated_loading_date && estimatedDefault) {
        merged.estimated_loading_date = estimatedDefault;
      }
      if (!merged.trailer_type && plannedTrailers[index]) {
        merged.trailer_type = plannedTrailers[index];
      }
      if ("booking_date" in patch && merged.booking_status !== "CANCELLED") {
        const booked = !!merged.booking_date;
        merged.truck_booked = booked;
        merged.booking_status = booked ? "BOOKED" : "PENDING";
      }
      next[index] = merged;
      return next;
    });
  };

  const toggleBooked = (index: number, booked: boolean) => {
    setTrucks((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current || current.booking_status === "CANCELLED") return prev;
      next[index] = {
        ...current,
        truck_booked: booked,
        booking_status: booked ? "BOOKED" : "PENDING",
        booking_date: booked ? current.booking_date || today : "",
      };
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

  return (
    <SectionFrame
      title="Trucks Details"
      description="Plan trailer types first, then save booking details truck by truck."
      status={step.status}
      canEdit={canEdit}
      isAdmin={isAdmin}
      showSaveButton={false}
      lockOnDone={false}
      disabled={invoiceFinalized && !isAdmin}
      disabledMessage={
        invoiceFinalized && !isAdmin
          ? "Truck booking/details are locked after invoice finalization."
          : doneReadOnly
            ? "This step is marked done and is read-only."
          : undefined
      }
      footer={
        <span className="text-xs text-zinc-500">
          {subtab === "planning"
            ? "Save planning to apply trailer defaults."
            : "Each truck card saves independently."}
        </span>
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
        <form action={updateAction} className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <input type="hidden" name="stepId" value={step.id} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name={fieldName(["planned_trucks_snapshot"])} value={plannedTotal} />
          <input type="hidden" name={fieldName(["actual_trucks_count"])} value={String(actualNumber)} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">
                Total number of trucks planned
              </div>
              <input
                type="number"
                min={0}
                value={plannedTotal}
                onChange={(event) => handlePlannedTotalChange(event.target.value)}
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
            <div className="mb-2 text-xs font-medium text-zinc-700">Trailer type per planned truck</div>
            {plannedNumber > 0 ? (
              <div className="space-y-2">
                {Array.from({ length: plannedNumber }).map((_, index) => (
                  <label
                    key={`planned-trailer-${index}`}
                    className="grid gap-2 sm:grid-cols-[120px_1fr]"
                  >
                    <div className="text-xs font-medium text-zinc-600 self-center">
                      Truck {index + 1}
                    </div>
                    <select
                      value={plannedTrailers[index] ?? ""}
                      onChange={(event) => updatePlannedTrailer(index, event.target.value)}
                      name={fieldName(["planned_trailers", String(index), "trailer_type"])}
                      disabled={disableEdit}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                    >
                      <option value="">Select trailer type</option>
                      {FTL_EXPORT_TRAILER_TYPES.map((option) => (
                        <option key={`${index}-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : (
              <div className="text-xs text-zinc-500">
                Enter planned truck count to configure trailer types.
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={disableEdit}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            Save planning
          </button>
        </form>
      ) : null}

      {subtab === "booking" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-zinc-600">
              Save each truck card separately after updating booking details.
            </div>
            <button
              type="button"
              onClick={addTruck}
              disabled={disableEdit}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
            >
              Add truck
            </button>
          </div>

          {trucks.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-5 text-center">
              <AppIllustration
                name="empty-no-trucks-booked"
                alt="No trucks booked"
                width={360}
                height={180}
                className="mx-auto h-32 w-full max-w-sm"
              />
              <div className="mt-2 text-sm text-zinc-600">
                No truck cards yet. Set planned total in Planning tab or add a booked truck.
              </div>
            </div>
          ) : null}

          {trucks.map((truck, index) => {
            const isCancelled = truck.booking_status === "CANCELLED";
            const isBooked = !isCancelled && !!truck.booking_date;
            const derivedStatus: TruckCard["booking_status"] = isCancelled
              ? "CANCELLED"
              : isBooked
                ? "BOOKED"
                : "PENDING";
            const statusBadgeClass =
              derivedStatus === "BOOKED"
                ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                : derivedStatus === "CANCELLED"
                  ? "bg-rose-100 text-rose-800 border-rose-200"
                  : "bg-amber-100 text-amber-800 border-amber-200";
            return (
              <form
                key={`truck-${index}`}
                action={updateAction}
                className={`rounded-xl border p-4 ${
                  isCancelled ? "border-amber-200 bg-amber-50/70" : "border-zinc-200 bg-white"
                }`}
              >
                <input type="hidden" name="stepId" value={step.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name={fieldName(["planned_trucks_snapshot"])} value={plannedTotal} />
                <input type="hidden" name={fieldName(["actual_trucks_count"])} value={String(actualNumber)} />
                <input type="hidden" name={fieldName(["total_trucks_planned"])} value={plannedTotal} />
                <input
                  type="hidden"
                  name={fieldName(["trucks_booking_required_by"])}
                  value={bookingRequiredBy}
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-zinc-900">
                    {truck.truck_reference || `Truck ${index + 1}`}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-2 py-1">
                      <span className="text-[11px] font-medium text-zinc-600">Booked</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isBooked}
                        aria-label={`Toggle booked for ${truck.truck_reference || `Truck ${index + 1}`}`}
                        onClick={() => toggleBooked(index, !isBooked)}
                        disabled={disableEdit || isCancelled}
                        className={`relative h-5 w-9 rounded-full transition ${
                          isBooked ? "bg-emerald-500" : "bg-zinc-300"
                        } disabled:opacity-60`}
                      >
                        <span
                          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${
                            isBooked ? "left-4" : "left-0.5"
                          }`}
                        />
                      </button>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-1 text-[11px] font-medium ${statusBadgeClass}`}
                    >
                      {derivedStatus === "BOOKED"
                        ? "Booked"
                        : derivedStatus === "CANCELLED"
                          ? "Cancelled"
                          : "Pending"}
                    </span>
                    {isCancelled ? (
                      <button
                        type="button"
                        onClick={() => toggleCancelled(index, false)}
                        disabled={disableEdit}
                        className="text-xs font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900 disabled:text-zinc-400"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleCancelled(index, true)}
                        disabled={disableEdit}
                        className="text-xs font-medium text-red-700 underline underline-offset-2 hover:text-red-800 disabled:text-zinc-400"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <label className="block">
                    <div className="mb-1 text-xs font-medium text-zinc-600">Booking date</div>
                    <input
                      type="date"
                      value={truck.booking_date}
                      onChange={(event) => updateTruck(index, { booking_date: event.target.value })}
                      name={fieldName(["trucks", String(index), "booking_date"])}
                      disabled={disableEdit || isCancelled || !isBooked}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                    />
                  </label>

                  <label className="block">
                    <div className="mb-1 text-xs font-medium text-zinc-600">
                      Estimated loading date
                    </div>
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
                    <div className="mb-1 text-xs font-medium text-zinc-600">
                      Trailer type (from planning)
                    </div>
                    <input
                      type="text"
                      value={truck.trailer_type}
                      name={fieldName(["trucks", String(index), "trailer_type"])}
                      readOnly
                      placeholder="Not set in planning tab"
                      className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-700"
                    />
                  </label>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-3">
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
                    rows={2}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
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
                  value={derivedStatus}
                />
                <input
                  type="hidden"
                  name={fieldName(["trucks", String(index), "truck_booked"])}
                  value={derivedStatus === "BOOKED" ? "1" : ""}
                />

                <div className="mt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={disableEdit}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                  >
                    Save changes
                  </button>
                </div>
              </form>
            );
          })}
        </div>
      ) : null}
    </SectionFrame>
  );
}
