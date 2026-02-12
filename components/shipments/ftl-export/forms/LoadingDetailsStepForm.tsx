"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { FTL_EXPORT_CARGO_UNIT_TYPES } from "@/lib/ftlExport/constants";
import type { TruckBookingRow } from "@/lib/ftlExport/helpers";
import { encodeFieldPath, stepFieldDocType } from "@/lib/stepFields";
import type { FtlDocumentMeta, FtlStepData } from "../types";
import { boolValue, fieldName, stringValue, toGroupRows, toRecord } from "../fieldNames";
import { SectionFrame } from "./SectionFrame";

type LoadingOrigin = "" | "ZAXON_WAREHOUSE" | "EXTERNAL_SUPPLIER" | "MIXED";

type LoadingTruckCard = {
  truck_reference: string;
  truck_loaded: boolean;
  loading_origin: LoadingOrigin;
  supplier_name: string;
  external_loading_date: string;
  external_loading_location: string;
  zaxon_actual_loading_date: string;
  zaxon_warehouse_remarks: string;
  mixed_supplier_loading_date: string;
  mixed_supplier_remarks: string;
  mixed_zaxon_loading_date: string;
  mixed_zaxon_remarks: string;
  cargo_weight: string;
  cargo_unit_type: string;
  cargo_unit_type_other: string;
  cargo_quantity: string;
  mixed_supplier_cargo_weight: string;
  mixed_supplier_cargo_unit_type: string;
  mixed_supplier_cargo_unit_type_other: string;
  mixed_supplier_cargo_quantity: string;
  mixed_zaxon_cargo_weight: string;
  mixed_zaxon_cargo_unit_type: string;
  mixed_zaxon_cargo_unit_type_other: string;
  mixed_zaxon_cargo_quantity: string;
  remarks: string;
};

type Props = {
  step: FtlStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  truckRows: TruckBookingRow[];
  latestDocsByType: Record<string, FtlDocumentMeta>;
};

function normalizeOrigin(value: string): LoadingOrigin {
  if (value === "ZAXON_WAREHOUSE" || value === "EXTERNAL_SUPPLIER" || value === "MIXED") {
    return value;
  }
  return "";
}

function emptyRow(index: number, reference: string): LoadingTruckCard {
  return {
    truck_reference: reference || `Truck ${index + 1}`,
    truck_loaded: false,
    loading_origin: "",
    supplier_name: "",
    external_loading_date: "",
    external_loading_location: "",
    zaxon_actual_loading_date: "",
    zaxon_warehouse_remarks: "",
    mixed_supplier_loading_date: "",
    mixed_supplier_remarks: "",
    mixed_zaxon_loading_date: "",
    mixed_zaxon_remarks: "",
    cargo_weight: "",
    cargo_unit_type: "",
    cargo_unit_type_other: "",
    cargo_quantity: "",
    mixed_supplier_cargo_weight: "",
    mixed_supplier_cargo_unit_type: "",
    mixed_supplier_cargo_unit_type_other: "",
    mixed_supplier_cargo_quantity: "",
    mixed_zaxon_cargo_weight: "",
    mixed_zaxon_cargo_unit_type: "",
    mixed_zaxon_cargo_unit_type_other: "",
    mixed_zaxon_cargo_quantity: "",
    remarks: "",
  };
}

function mapRow(
  input: Record<string, unknown>,
  index: number,
  reference: string,
): LoadingTruckCard {
  return {
    truck_reference: stringValue(input.truck_reference) || reference || `Truck ${index + 1}`,
    truck_loaded: boolValue(input.truck_loaded),
    loading_origin: normalizeOrigin(stringValue(input.loading_origin)),
    supplier_name: stringValue(input.supplier_name),
    external_loading_date: stringValue(input.external_loading_date),
    external_loading_location: stringValue(input.external_loading_location),
    zaxon_actual_loading_date: stringValue(input.zaxon_actual_loading_date),
    zaxon_warehouse_remarks: stringValue(input.zaxon_warehouse_remarks),
    mixed_supplier_loading_date: stringValue(input.mixed_supplier_loading_date),
    mixed_supplier_remarks: stringValue(input.mixed_supplier_remarks),
    mixed_zaxon_loading_date: stringValue(input.mixed_zaxon_loading_date),
    mixed_zaxon_remarks: stringValue(input.mixed_zaxon_remarks),
    cargo_weight: stringValue(input.cargo_weight),
    cargo_unit_type: stringValue(input.cargo_unit_type),
    cargo_unit_type_other: stringValue(input.cargo_unit_type_other),
    cargo_quantity: stringValue(input.cargo_quantity),
    mixed_supplier_cargo_weight: stringValue(input.mixed_supplier_cargo_weight),
    mixed_supplier_cargo_unit_type: stringValue(input.mixed_supplier_cargo_unit_type),
    mixed_supplier_cargo_unit_type_other: stringValue(input.mixed_supplier_cargo_unit_type_other),
    mixed_supplier_cargo_quantity: stringValue(input.mixed_supplier_cargo_quantity),
    mixed_zaxon_cargo_weight: stringValue(input.mixed_zaxon_cargo_weight),
    mixed_zaxon_cargo_unit_type: stringValue(input.mixed_zaxon_cargo_unit_type),
    mixed_zaxon_cargo_unit_type_other: stringValue(input.mixed_zaxon_cargo_unit_type_other),
    mixed_zaxon_cargo_quantity: stringValue(input.mixed_zaxon_cargo_quantity),
    remarks: stringValue(input.remarks),
  };
}

function toNumber(value: string) {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function summaryForMixed(row: LoadingTruckCard) {
  const totalWeight =
    toNumber(row.mixed_supplier_cargo_weight) + toNumber(row.mixed_zaxon_cargo_weight);
  const totalQuantity =
    toNumber(row.mixed_supplier_cargo_quantity) + toNumber(row.mixed_zaxon_cargo_quantity);
  const supplierUnit = row.mixed_supplier_cargo_unit_type;
  const zaxonUnit = row.mixed_zaxon_cargo_unit_type;
  const supplierOther = row.mixed_supplier_cargo_unit_type_other;
  const zaxonOther = row.mixed_zaxon_cargo_unit_type_other;

  let cargoUnitType = "";
  let cargoUnitTypeOther = "";
  if (supplierUnit && zaxonUnit && supplierUnit === zaxonUnit) {
    cargoUnitType = supplierUnit;
    cargoUnitTypeOther = supplierUnit === "Other" ? supplierOther || zaxonOther : "";
  } else if (supplierUnit || zaxonUnit) {
    cargoUnitType = "Other";
    cargoUnitTypeOther = "Mixed origins";
  }

  return { totalWeight, totalQuantity, cargoUnitType, cargoUnitTypeOther };
}

function toDoc(
  latestDocsByType: Record<string, FtlDocumentMeta>,
  stepId: number,
  path: string[],
) {
  const key = stepFieldDocType(stepId, encodeFieldPath(path));
  return latestDocsByType[key];
}

export function LoadingDetailsStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  truckRows,
  latestDocsByType,
}: Props) {
  const activeTrucks = truckRows.filter((row) => row.booking_status !== "CANCELLED");
  const existingRows = toGroupRows(step.values, "trucks");
  const rowsCount = Math.max(activeTrucks.length, existingRows.length);
  const [tab, setTab] = useState<"origin" | "details">("origin");
  const [rows, setRows] = useState<LoadingTruckCard[]>(
    Array.from({ length: rowsCount }).map((_, index) => {
      const fallbackReference = activeTrucks[index]?.truck_reference || `Truck ${index + 1}`;
      const source = toRecord(existingRows[index]);
      return Object.keys(source).length ? mapRow(source, index, fallbackReference) : emptyRow(index, fallbackReference);
    }),
  );
  const [notes, setNotes] = useState(step.notes ?? "");
  const loadedCount = rows.filter((row) => row.truck_loaded).length;
  const disableEdit = !canEdit;

  const updateRow = (index: number, patch: Partial<LoadingTruckCard>) => {
    setRows((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  return (
    <form action={updateAction} encType="multipart/form-data">
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title="Loading Details"
        description="Origin-first flow: pick origin and dates, then complete only required loading details."
        status={step.status}
        canEdit={canEdit}
        saveLabel={tab === "origin" ? "Save origin & dates" : "Save loading details"}
        before={
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <div className="text-xs text-zinc-500">Shipment loading status</div>
            <div className="mt-1 font-medium text-zinc-800">
              {loadedCount}/{rows.length || 0} trucks marked loaded
            </div>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("origin")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === "origin"
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Loading date & origin
          </button>
          <button
            type="button"
            onClick={() => setTab("details")}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === "details"
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            Loading details
          </button>
        </div>

        {rows.map((row, index) => {
          const mixed = summaryForMixed(row);
          const loadingPhotoDoc = toDoc(latestDocsByType, step.id, ["trucks", String(index), "loading_photo"]);
          const loadingSheetDoc = toDoc(latestDocsByType, step.id, ["trucks", String(index), "loading_sheet_upload"]);
          const extraPhotoDoc = toDoc(latestDocsByType, step.id, [
            "trucks",
            String(index),
            "additional_photos",
            "0",
            "file",
          ]);
          const requiresZaxonPhoto =
            row.truck_loaded &&
            (row.loading_origin === "ZAXON_WAREHOUSE" || row.loading_origin === "MIXED");

          return (
            <div key={`loading-${index}`} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-zinc-900">{row.truck_reference || `Truck ${index + 1}`}</div>
                <Badge tone={row.truck_loaded ? "green" : "zinc"}>
                  {row.truck_loaded ? "Loaded" : "Pending"}
                </Badge>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                  <input type="hidden" name={fieldName(["trucks", String(index), "truck_loaded"])} value="" />
                  <input
                    type="checkbox"
                    name={fieldName(["trucks", String(index), "truck_loaded"])}
                    value="1"
                    checked={row.truck_loaded}
                    onChange={(event) => updateRow(index, { truck_loaded: event.target.checked })}
                    disabled={disableEdit}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  <span>Truck loaded</span>
                </label>
                <label className="block sm:col-span-2">
                  <div className="mb-1 text-xs font-medium text-zinc-600">Loading origin {row.truck_loaded ? "*" : ""}</div>
                  <select
                    name={fieldName(["trucks", String(index), "loading_origin"])}
                    value={row.loading_origin}
                    onChange={(event) => updateRow(index, { loading_origin: normalizeOrigin(event.target.value) })}
                    required={row.truck_loaded}
                    disabled={disableEdit}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                  >
                    <option value="">Select origin</option>
                    <option value="ZAXON_WAREHOUSE">Zaxon Warehouse</option>
                    <option value="EXTERNAL_SUPPLIER">External Supplier Location</option>
                    <option value="MIXED">Mixed</option>
                  </select>
                </label>
              </div>

              {tab === "origin" ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {row.loading_origin === "EXTERNAL_SUPPLIER" ? (
                    <>
                      <input
                        name={fieldName(["trucks", String(index), "supplier_name"])}
                        value={row.supplier_name}
                        onChange={(event) => updateRow(index, { supplier_name: event.target.value })}
                        placeholder="Supplier name"
                        disabled={disableEdit}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                      <input
                        type="date"
                        name={fieldName(["trucks", String(index), "external_loading_date"])}
                        value={row.external_loading_date}
                        onChange={(event) => updateRow(index, { external_loading_date: event.target.value })}
                        required={row.truck_loaded}
                        disabled={disableEdit}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                      <input
                        name={fieldName(["trucks", String(index), "external_loading_location"])}
                        value={row.external_loading_location}
                        onChange={(event) =>
                          updateRow(index, { external_loading_location: event.target.value })
                        }
                        placeholder="Loading location (optional)"
                        disabled={disableEdit}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100 sm:col-span-2"
                      />
                    </>
                  ) : null}

                  {row.loading_origin === "ZAXON_WAREHOUSE" ? (
                    <>
                      <input
                        type="date"
                        name={fieldName(["trucks", String(index), "zaxon_actual_loading_date"])}
                        value={row.zaxon_actual_loading_date}
                        onChange={(event) => updateRow(index, { zaxon_actual_loading_date: event.target.value })}
                        required={row.truck_loaded}
                        disabled={disableEdit}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                      <input
                        name={fieldName(["trucks", String(index), "zaxon_warehouse_remarks"])}
                        value={row.zaxon_warehouse_remarks}
                        onChange={(event) =>
                          updateRow(index, { zaxon_warehouse_remarks: event.target.value })
                        }
                        placeholder="Warehouse remarks (optional)"
                        disabled={disableEdit}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                    </>
                  ) : null}

                  {row.loading_origin === "MIXED" ? (
                    <>
                      <input
                        type="date"
                        name={fieldName(["trucks", String(index), "mixed_supplier_loading_date"])}
                        value={row.mixed_supplier_loading_date}
                        onChange={(event) => updateRow(index, { mixed_supplier_loading_date: event.target.value })}
                        required={row.truck_loaded}
                        disabled={disableEdit}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                      <input
                        type="date"
                        name={fieldName(["trucks", String(index), "mixed_zaxon_loading_date"])}
                        value={row.mixed_zaxon_loading_date}
                        onChange={(event) => updateRow(index, { mixed_zaxon_loading_date: event.target.value })}
                        required={row.truck_loaded}
                        disabled={disableEdit}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                      <input
                        name={fieldName(["trucks", String(index), "mixed_supplier_remarks"])}
                        value={row.mixed_supplier_remarks}
                        onChange={(event) =>
                          updateRow(index, { mixed_supplier_remarks: event.target.value })
                        }
                        placeholder="Supplier remarks (optional)"
                        disabled={disableEdit}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                      <input
                        name={fieldName(["trucks", String(index), "mixed_zaxon_remarks"])}
                        value={row.mixed_zaxon_remarks}
                        onChange={(event) =>
                          updateRow(index, { mixed_zaxon_remarks: event.target.value })
                        }
                        placeholder="Zaxon remarks (optional)"
                        disabled={disableEdit}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {row.loading_origin === "MIXED" ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="Supplier weight"
                          name={fieldName(["trucks", String(index), "mixed_supplier_cargo_weight"])}
                          value={row.mixed_supplier_cargo_weight}
                          onChange={(event) => updateRow(index, { mixed_supplier_cargo_weight: event.target.value })}
                          required={row.truck_loaded}
                          disabled={disableEdit}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="Zaxon weight"
                          name={fieldName(["trucks", String(index), "mixed_zaxon_cargo_weight"])}
                          value={row.mixed_zaxon_cargo_weight}
                          onChange={(event) => updateRow(index, { mixed_zaxon_cargo_weight: event.target.value })}
                          required={row.truck_loaded}
                          disabled={disableEdit}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="Supplier quantity"
                          name={fieldName(["trucks", String(index), "mixed_supplier_cargo_quantity"])}
                          value={row.mixed_supplier_cargo_quantity}
                          onChange={(event) => updateRow(index, { mixed_supplier_cargo_quantity: event.target.value })}
                          required={row.truck_loaded}
                          disabled={disableEdit}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          placeholder="Zaxon quantity"
                          name={fieldName(["trucks", String(index), "mixed_zaxon_cargo_quantity"])}
                          value={row.mixed_zaxon_cargo_quantity}
                          onChange={(event) => updateRow(index, { mixed_zaxon_cargo_quantity: event.target.value })}
                          required={row.truck_loaded}
                          disabled={disableEdit}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                        />
                        <select
                          name={fieldName(["trucks", String(index), "mixed_supplier_cargo_unit_type"])}
                          value={row.mixed_supplier_cargo_unit_type}
                          onChange={(event) =>
                            updateRow(index, { mixed_supplier_cargo_unit_type: event.target.value })
                          }
                          required={row.truck_loaded}
                          disabled={disableEdit}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                        >
                          <option value="">Supplier unit type</option>
                          {FTL_EXPORT_CARGO_UNIT_TYPES.map((unit) => (
                            <option key={`sup-unit-${index}-${unit}`} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                        <select
                          name={fieldName(["trucks", String(index), "mixed_zaxon_cargo_unit_type"])}
                          value={row.mixed_zaxon_cargo_unit_type}
                          onChange={(event) =>
                            updateRow(index, { mixed_zaxon_cargo_unit_type: event.target.value })
                          }
                          required={row.truck_loaded}
                          disabled={disableEdit}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                        >
                          <option value="">Zaxon unit type</option>
                          {FTL_EXPORT_CARGO_UNIT_TYPES.map((unit) => (
                            <option key={`zax-unit-${index}-${unit}`} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                        {row.mixed_supplier_cargo_unit_type === "Other" ? (
                          <input
                            name={fieldName([
                              "trucks",
                              String(index),
                              "mixed_supplier_cargo_unit_type_other",
                            ])}
                            value={row.mixed_supplier_cargo_unit_type_other}
                            onChange={(event) =>
                              updateRow(index, {
                                mixed_supplier_cargo_unit_type_other: event.target.value,
                              })
                            }
                            placeholder="Supplier unit type (other)"
                            required={row.truck_loaded}
                            disabled={disableEdit}
                            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                          />
                        ) : null}
                        {row.mixed_zaxon_cargo_unit_type === "Other" ? (
                          <input
                            name={fieldName(["trucks", String(index), "mixed_zaxon_cargo_unit_type_other"])}
                            value={row.mixed_zaxon_cargo_unit_type_other}
                            onChange={(event) =>
                              updateRow(index, { mixed_zaxon_cargo_unit_type_other: event.target.value })
                            }
                            placeholder="Zaxon unit type (other)"
                            required={row.truck_loaded}
                            disabled={disableEdit}
                            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                          />
                        ) : null}
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                        Consolidated total: {mixed.totalWeight} weight / {mixed.totalQuantity} quantity
                      </div>
                      <input type="hidden" name={fieldName(["trucks", String(index), "cargo_weight"])} value={String(mixed.totalWeight)} />
                      <input type="hidden" name={fieldName(["trucks", String(index), "cargo_quantity"])} value={String(mixed.totalQuantity)} />
                      <input
                        type="hidden"
                        name={fieldName(["trucks", String(index), "cargo_unit_type"])}
                        value={mixed.cargoUnitType}
                      />
                      <input
                        type="hidden"
                        name={fieldName(["trucks", String(index), "cargo_unit_type_other"])}
                        value={mixed.cargoUnitTypeOther}
                      />
                    </>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="Cargo weight"
                        name={fieldName(["trucks", String(index), "cargo_weight"])}
                        value={row.cargo_weight}
                        onChange={(event) => updateRow(index, { cargo_weight: event.target.value })}
                        required={row.truck_loaded}
                        disabled={disableEdit}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                      <select
                        name={fieldName(["trucks", String(index), "cargo_unit_type"])}
                        value={row.cargo_unit_type}
                        onChange={(event) => updateRow(index, { cargo_unit_type: event.target.value })}
                        required={row.truck_loaded}
                        disabled={disableEdit}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      >
                        <option value="">Unit type</option>
                        {FTL_EXPORT_CARGO_UNIT_TYPES.map((unit) => (
                          <option key={`${index}-${unit}`} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="Cargo quantity"
                        name={fieldName(["trucks", String(index), "cargo_quantity"])}
                        value={row.cargo_quantity}
                        onChange={(event) => updateRow(index, { cargo_quantity: event.target.value })}
                        required={row.truck_loaded}
                        disabled={disableEdit}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                      />
                      {row.cargo_unit_type === "Other" ? (
                        <input
                          name={fieldName(["trucks", String(index), "cargo_unit_type_other"])}
                          value={row.cargo_unit_type_other}
                          onChange={(event) =>
                            updateRow(index, { cargo_unit_type_other: event.target.value })
                          }
                          placeholder="Unit type (other)"
                          required={row.truck_loaded}
                          disabled={disableEdit}
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100 sm:col-span-3"
                        />
                      ) : null}
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-3">
                    <input
                      type="file"
                      name={fieldName(["trucks", String(index), "loading_photo"])}
                      required={requiresZaxonPhoto && !loadingPhotoDoc}
                      disabled={disableEdit}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs disabled:bg-zinc-100"
                    />
                    <input
                      type="file"
                      name={fieldName(["trucks", String(index), "loading_sheet_upload"])}
                      disabled={disableEdit}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs disabled:bg-zinc-100"
                    />
                    <input
                      type="file"
                      name={fieldName(["trucks", String(index), "additional_photos", "0", "file"])}
                      disabled={disableEdit}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs disabled:bg-zinc-100"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                    <span>{loadingPhotoDoc ? "Loading photo uploaded" : "No loading photo"}</span>
                    <span>{loadingSheetDoc ? "Loading sheet uploaded" : "No loading sheet"}</span>
                    <span>{extraPhotoDoc ? "Additional photo uploaded" : "No additional photo"}</span>
                  </div>

                  <textarea
                    name={fieldName(["trucks", String(index), "remarks"])}
                    value={row.remarks}
                    onChange={(event) => updateRow(index, { remarks: event.target.value })}
                    placeholder="Remarks (optional)"
                    disabled={disableEdit}
                    className="min-h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                  />
                </div>
              )}

              <input
                type="hidden"
                name={fieldName(["trucks", String(index), "truck_reference"])}
                value={row.truck_reference || `Truck ${index + 1}`}
              />
            </div>
          );
        })}

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
