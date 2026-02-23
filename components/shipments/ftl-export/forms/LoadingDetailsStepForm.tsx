"use client";

import { useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { FTL_EXPORT_CARGO_UNIT_TYPES } from "@/lib/ftlExport/constants";
import type { TruckBookingRow } from "@/lib/ftlExport/helpers";
import { encodeFieldPath, stepFieldDocType } from "@/lib/stepFields";
import type { FtlDocumentMeta, FtlStepData } from "../types";
import { boolValue, fieldName, stringValue, toGroupRows, toRecord } from "../fieldNames";
import { SectionFrame } from "./SectionFrame";
import { DatePickerInput } from "@/components/ui/DatePickerInput";

type LoadingOrigin = "" | "ZAXON_WAREHOUSE" | "EXTERNAL_SUPPLIER" | "MIXED";

type LoadingTruckCard = {
  truck_reference: string;
  truck_loaded: boolean;
  mixed_supplier_loaded: boolean;
  mixed_zaxon_loaded: boolean;
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
  isAdmin: boolean;
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
    mixed_supplier_loaded: false,
    mixed_zaxon_loaded: false,
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
  const loadingOrigin = normalizeOrigin(stringValue(input.loading_origin));
  const truckLoaded = boolValue(input.truck_loaded);
  const supplierLoadedRaw = boolValue(input.mixed_supplier_loaded);
  const zaxonLoadedRaw = boolValue(input.mixed_zaxon_loaded);
  const mixedSupplierLoaded =
    loadingOrigin === "MIXED" ? supplierLoadedRaw || truckLoaded : supplierLoadedRaw;
  const mixedZaxonLoaded =
    loadingOrigin === "MIXED" ? zaxonLoadedRaw || truckLoaded : zaxonLoadedRaw;
  const effectiveTruckLoaded =
    loadingOrigin === "MIXED" ? mixedSupplierLoaded && mixedZaxonLoaded : truckLoaded;

  return {
    truck_reference: stringValue(input.truck_reference) || reference || `Truck ${index + 1}`,
    truck_loaded: effectiveTruckLoaded,
    mixed_supplier_loaded: mixedSupplierLoaded,
    mixed_zaxon_loaded: mixedZaxonLoaded,
    loading_origin: loadingOrigin,
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

function originLabel(origin: LoadingOrigin) {
  if (origin === "ZAXON_WAREHOUSE") return "Zaxon Warehouse";
  if (origin === "EXTERNAL_SUPPLIER") return "External Supplier";
  if (origin === "MIXED") return "Mixed";
  return "Not selected";
}

function isOriginConfigured(row: LoadingTruckCard) {
  if (!row.loading_origin) return false;
  if (row.loading_origin === "EXTERNAL_SUPPLIER") {
    return !!row.external_loading_date;
  }
  if (row.loading_origin === "ZAXON_WAREHOUSE") {
    return !!row.zaxon_actual_loading_date;
  }
  return (
    !!row.supplier_name &&
    !!row.external_loading_location &&
    !!row.mixed_supplier_loading_date &&
    !!row.mixed_zaxon_loading_date
  );
}

function isMixedFullyLoaded(row: LoadingTruckCard) {
  return row.mixed_supplier_loaded && row.mixed_zaxon_loaded;
}

function effectiveTruckLoaded(row: LoadingTruckCard) {
  if (row.loading_origin === "MIXED") return isMixedFullyLoaded(row);
  return row.truck_loaded;
}

function rowStatus(row: LoadingTruckCard): {
  label: "Pending" | "In Progress" | "Fully Loaded";
  tone: "zinc" | "blue" | "green";
} {
  if (row.loading_origin === "MIXED") {
    if (row.mixed_supplier_loaded && row.mixed_zaxon_loaded) {
      return { label: "Fully Loaded", tone: "green" };
    }
    if (row.mixed_supplier_loaded || row.mixed_zaxon_loaded) {
      return { label: "In Progress", tone: "blue" };
    }
    return { label: "Pending", tone: "zinc" };
  }
  return row.truck_loaded
    ? { label: "Fully Loaded", tone: "green" }
    : { label: "Pending", tone: "zinc" };
}

function shortDate(value: string) {
  return value ? value.slice(0, 10) : "";
}

function MiniLabel({ children }: { children: string }) {
  return (
    <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
      {children}
    </div>
  );
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
  isAdmin,
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
  const originReady = useMemo(() => rows.map((row) => isOriginConfigured(row)), [rows]);
  const canOpenDetails = rows.length === 0 || originReady.every(Boolean);
  const loadedCount = rows.filter((row) => effectiveTruckLoaded(row)).length;
  const doneReadOnly = step.status === "DONE" && !isAdmin;
  const disableEdit = !canEdit || doneReadOnly;
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [dragActiveKey, setDragActiveKey] = useState<string | null>(null);
  const [selectedUploads, setSelectedUploads] = useState<Record<string, string>>({});

  const updateRow = (index: number, patch: Partial<LoadingTruckCard>) => {
    setRows((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const updateMixedStopLoaded = (
    index: number,
    stop: "zaxon" | "supplier",
    checked: boolean,
  ) => {
    setRows((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const nextRow =
        stop === "zaxon"
          ? { ...current, mixed_zaxon_loaded: checked }
          : { ...current, mixed_supplier_loaded: checked };
      nextRow.truck_loaded = nextRow.mixed_zaxon_loaded && nextRow.mixed_supplier_loaded;
      next[index] = nextRow;
      return next;
    });
  };

  const setSelectedUploadLabel = (key: string, files: FileList | null) => {
    setSelectedUploads((prev) => {
      const next = { ...prev };
      if (!files || files.length === 0) {
        delete next[key];
        return next;
      }
      next[key] =
        files.length === 1 ? files[0]?.name || "1 file selected" : `${files.length} files selected`;
      return next;
    });
  };

  const assignDroppedFiles = (key: string, files: FileList) => {
    const input = fileInputRefs.current[key];
    if (!input) return;
    const transfer = new DataTransfer();
    for (const file of Array.from(files)) {
      transfer.items.add(file);
    }
    input.files = transfer.files;
    setSelectedUploadLabel(key, transfer.files);
  };

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title="Loading Details"
        description="Tab 1: setup loading origin and dates. Tab 2: execute loading details and mark loaded status."
        status={step.status}
        canEdit={canEdit && !doneReadOnly}
        isAdmin={isAdmin}
        saveLabel={tab === "origin" ? "Save setup" : "Save loading execution"}
        lockOnDone={false}
        disabledMessage={
          doneReadOnly ? "This step is marked done and is read-only." : undefined
        }
        before={
          <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
            <div className="text-xs text-zinc-500">Shipment loading status</div>
            <div className="font-medium text-zinc-800">
              {loadedCount}/{rows.length || 0} trucks fully loaded
            </div>
            {!canOpenDetails ? (
              <div className="text-xs text-amber-700">
                Complete loading origin/date setup for all trucks in Tab 1 before opening Tab 2.
              </div>
            ) : null}
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
            onClick={() => {
              if (canOpenDetails) setTab("details");
            }}
            disabled={!canOpenDetails}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === "details"
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            } disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400`}
          >
            Loading details
          </button>
        </div>

        {rows.map((row, index) => {
          const mixed = summaryForMixed(row);
          const rowReady = originReady[index] ?? false;
          const status = rowStatus(row);
          const effectiveLoaded = effectiveTruckLoaded(row);
          const photoInputKey = `row-${index}-loading-photo`;
          const sheetInputKey = `row-${index}-loading-sheet`;
          const requiresVisualProof =
            row.loading_origin === "ZAXON_WAREHOUSE" || row.loading_origin === "MIXED";
          const loadingPhotoDoc = toDoc(latestDocsByType, step.id, ["trucks", String(index), "loading_photo"]);
          const loadingSheetDoc = toDoc(latestDocsByType, step.id, ["trucks", String(index), "loading_sheet_upload"]);
          const selectedPhotoLabel =
            selectedUploads[photoInputKey] ??
            (loadingPhotoDoc ? `Latest: ${loadingPhotoDoc.file_name}` : "No files selected");
          const uploadedPhotoCount = loadingPhotoDoc?.count ?? (loadingPhotoDoc ? 1 : 0);
          const selectedSheetLabel =
            selectedUploads[sheetInputKey] ??
            (loadingSheetDoc ? `Latest: ${loadingSheetDoc.file_name}` : "No file selected");

          return (
            <div key={`loading-${index}`} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium text-zinc-900">{row.truck_reference || `Truck ${index + 1}`}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {tab === "details" ? (
                    <Badge tone="blue">{originLabel(row.loading_origin)}</Badge>
                  ) : null}
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
              </div>

              {tab === "origin" ? (
                <div className="mt-3">
                  <label className="block">
                    <div className="mb-1 text-xs font-medium text-zinc-600">Loading origin *</div>
                    <select
                      name={fieldName(["trucks", String(index), "loading_origin"])}
                      value={row.loading_origin}
                      onChange={(event) => {
                        const nextOrigin = normalizeOrigin(event.target.value);
                        updateRow(index, {
                          loading_origin: nextOrigin,
                          truck_loaded: nextOrigin === "MIXED" ? false : row.truck_loaded,
                          mixed_supplier_loaded:
                            nextOrigin === "MIXED" ? row.mixed_supplier_loaded : false,
                          mixed_zaxon_loaded:
                            nextOrigin === "MIXED" ? row.mixed_zaxon_loaded : false,
                        });
                      }}
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
              ) : (
                <input
                  type="hidden"
                  name={fieldName(["trucks", String(index), "loading_origin"])}
                  value={row.loading_origin}
                />
              )}

              {tab === "origin" ? (
                <div className="mt-3 space-y-3">
                  {row.loading_origin === "EXTERNAL_SUPPLIER" ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <MiniLabel>Supplier name</MiniLabel>
                        <input
                          name={fieldName(["trucks", String(index), "supplier_name"])}
                          value={row.supplier_name}
                          onChange={(event) => updateRow(index, { supplier_name: event.target.value })}
                          placeholder="Enter supplier name"
                          disabled={disableEdit}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                        />
                      </label>
                      <label className="block">
                        <MiniLabel>Loading date *</MiniLabel>
                        <DatePickerInput
                          
                          name={fieldName(["trucks", String(index), "external_loading_date"])}
                          value={row.external_loading_date}
                          onChange={(event) => updateRow(index, { external_loading_date: event.target.value })}
                          disabled={disableEdit}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                         />
                      </label>
                      <label className="block">
                        <MiniLabel>Loading location</MiniLabel>
                        <input
                          name={fieldName(["trucks", String(index), "external_loading_location"])}
                          value={row.external_loading_location}
                          onChange={(event) =>
                            updateRow(index, { external_loading_location: event.target.value })
                          }
                          placeholder="City/Area - Optional"
                          disabled={disableEdit}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                        />
                      </label>
                    </div>
                  ) : null}

                  {row.loading_origin === "ZAXON_WAREHOUSE" ? (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <MiniLabel>Actual loading date *</MiniLabel>
                        <DatePickerInput
                          
                          name={fieldName(["trucks", String(index), "zaxon_actual_loading_date"])}
                          value={row.zaxon_actual_loading_date}
                          onChange={(event) => updateRow(index, { zaxon_actual_loading_date: event.target.value })}
                          disabled={disableEdit}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                         />
                      </label>
                      <label className="block sm:col-span-2">
                        <MiniLabel>Warehouse remarks</MiniLabel>
                        <input
                          name={fieldName(["trucks", String(index), "zaxon_warehouse_remarks"])}
                          value={row.zaxon_warehouse_remarks}
                          onChange={(event) =>
                            updateRow(index, { zaxon_warehouse_remarks: event.target.value })
                          }
                          placeholder="Warehouse remarks"
                          disabled={disableEdit}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                        />
                      </label>
                    </div>
                  ) : null}

                  {row.loading_origin === "MIXED" ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="mb-2 text-sm font-semibold text-zinc-800">Supplier Side:</div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <MiniLabel>Supplier name *</MiniLabel>
                            <input
                              name={fieldName(["trucks", String(index), "supplier_name"])}
                              value={row.supplier_name}
                              onChange={(event) =>
                                updateRow(index, { supplier_name: event.target.value })
                              }
                              placeholder="Enter supplier name"
                              disabled={disableEdit}
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                            />
                          </label>
                          <label className="block">
                            <MiniLabel>Supplier location *</MiniLabel>
                            <input
                              name={fieldName(["trucks", String(index), "external_loading_location"])}
                              value={row.external_loading_location}
                              onChange={(event) =>
                                updateRow(index, { external_loading_location: event.target.value })
                              }
                              placeholder="City/Area"
                              disabled={disableEdit}
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                            />
                          </label>
                          <label className="block">
                            <MiniLabel>Supplier loading date *</MiniLabel>
                            <DatePickerInput
                              
                              name={fieldName(["trucks", String(index), "mixed_supplier_loading_date"])}
                              value={row.mixed_supplier_loading_date}
                              onChange={(event) =>
                                updateRow(index, { mixed_supplier_loading_date: event.target.value })
                              }
                              disabled={disableEdit}
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                             />
                          </label>
                          <label className="block sm:col-span-2">
                            <MiniLabel>Supplier remarks</MiniLabel>
                            <input
                              name={fieldName(["trucks", String(index), "mixed_supplier_remarks"])}
                              value={row.mixed_supplier_remarks}
                              onChange={(event) =>
                                updateRow(index, { mixed_supplier_remarks: event.target.value })
                              }
                              placeholder="Supplier remarks"
                              disabled={disableEdit}
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                            />
                          </label>
                        </div>
                      </div>
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="mb-2 text-sm font-semibold text-zinc-800">Zaxon Side:</div>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className="block">
                            <MiniLabel>Zaxon loading date *</MiniLabel>
                            <DatePickerInput
                              
                              name={fieldName(["trucks", String(index), "mixed_zaxon_loading_date"])}
                              value={row.mixed_zaxon_loading_date}
                              onChange={(event) =>
                                updateRow(index, { mixed_zaxon_loading_date: event.target.value })
                              }
                              disabled={disableEdit}
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                             />
                          </label>
                          <label className="block sm:col-span-2">
                            <MiniLabel>Zaxon remarks</MiniLabel>
                            <input
                              name={fieldName(["trucks", String(index), "mixed_zaxon_remarks"])}
                              value={row.mixed_zaxon_remarks}
                              onChange={(event) =>
                                updateRow(index, { mixed_zaxon_remarks: event.target.value })
                              }
                              placeholder="Zaxon remarks"
                              disabled={disableEdit}
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      rowReady
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-amber-200 bg-amber-50 text-amber-900"
                    }`}
                  >
                    {rowReady
                      ? "Configuration complete. Continue to Loading details."
                      : "Select origin and complete required setup fields before continuing."}
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  {row.loading_origin === "MIXED" ? (
                    <>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                          <div className="mb-2 text-sm font-medium text-zinc-900">
                            Stop 1: Zaxon Warehouse
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <label className="block">
                              <MiniLabel>Quantity *</MiniLabel>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                placeholder="Quantity *"
                                name={fieldName(["trucks", String(index), "mixed_zaxon_cargo_quantity"])}
                                value={row.mixed_zaxon_cargo_quantity}
                                onChange={(event) =>
                                  updateRow(index, { mixed_zaxon_cargo_quantity: event.target.value })
                                }
                                disabled={disableEdit}
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                              />
                            </label>
                            <label className="block">
                              <MiniLabel>Unit type *</MiniLabel>
                              <select
                                name={fieldName(["trucks", String(index), "mixed_zaxon_cargo_unit_type"])}
                                value={row.mixed_zaxon_cargo_unit_type}
                                onChange={(event) =>
                                  updateRow(index, { mixed_zaxon_cargo_unit_type: event.target.value })
                                }
                                disabled={disableEdit}
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                              >
                                <option value="">Unit type *</option>
                                {FTL_EXPORT_CARGO_UNIT_TYPES.map((unit) => (
                                  <option key={`zax-unit-${index}-${unit}`} value={unit}>
                                    {unit}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <MiniLabel>Weight *</MiniLabel>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                placeholder="Weight *"
                                name={fieldName(["trucks", String(index), "mixed_zaxon_cargo_weight"])}
                                value={row.mixed_zaxon_cargo_weight}
                                onChange={(event) =>
                                  updateRow(index, { mixed_zaxon_cargo_weight: event.target.value })
                                }
                                disabled={disableEdit}
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                              />
                            </label>
                            {row.mixed_zaxon_cargo_unit_type === "Other" ? (
                              <label className="block sm:col-span-3">
                                <MiniLabel>Unit type (other) *</MiniLabel>
                                <input
                                  name={fieldName([
                                    "trucks",
                                    String(index),
                                    "mixed_zaxon_cargo_unit_type_other",
                                  ])}
                                  value={row.mixed_zaxon_cargo_unit_type_other}
                                  onChange={(event) =>
                                    updateRow(index, {
                                      mixed_zaxon_cargo_unit_type_other: event.target.value,
                                    })
                                  }
                                  placeholder="Unit type (other) *"
                                  disabled={disableEdit}
                                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                                />
                              </label>
                            ) : null}
                          </div>
                          <label className="mt-3 flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs">
                            <input
                              type="hidden"
                              name={fieldName(["trucks", String(index), "mixed_zaxon_loaded"])}
                              value=""
                            />
                            <input
                              type="checkbox"
                              name={fieldName(["trucks", String(index), "mixed_zaxon_loaded"])}
                              value="1"
                              checked={row.mixed_zaxon_loaded}
                              onChange={(event) =>
                                updateMixedStopLoaded(index, "zaxon", event.target.checked)
                              }
                              disabled={disableEdit}
                              className="h-4 w-4 rounded border-zinc-300"
                            />
                            <span>Mark Stop 1 loaded</span>
                          </label>
                        </div>

                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                          <div className="mb-2 text-sm font-medium text-zinc-900">
                            Stop 2: External Supplier
                          </div>
                          <div className="grid gap-3 sm:grid-cols-3">
                            <label className="block">
                              <MiniLabel>Quantity *</MiniLabel>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                placeholder="Quantity *"
                                name={fieldName(["trucks", String(index), "mixed_supplier_cargo_quantity"])}
                                value={row.mixed_supplier_cargo_quantity}
                                onChange={(event) =>
                                  updateRow(index, { mixed_supplier_cargo_quantity: event.target.value })
                                }
                                disabled={disableEdit}
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                              />
                            </label>
                            <label className="block">
                              <MiniLabel>Unit type *</MiniLabel>
                              <select
                                name={fieldName(["trucks", String(index), "mixed_supplier_cargo_unit_type"])}
                                value={row.mixed_supplier_cargo_unit_type}
                                onChange={(event) =>
                                  updateRow(index, {
                                    mixed_supplier_cargo_unit_type: event.target.value,
                                  })
                                }
                                disabled={disableEdit}
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                              >
                                <option value="">Unit type *</option>
                                {FTL_EXPORT_CARGO_UNIT_TYPES.map((unit) => (
                                  <option key={`sup-unit-${index}-${unit}`} value={unit}>
                                    {unit}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block">
                              <MiniLabel>Weight *</MiniLabel>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                placeholder="Weight *"
                                name={fieldName(["trucks", String(index), "mixed_supplier_cargo_weight"])}
                                value={row.mixed_supplier_cargo_weight}
                                onChange={(event) =>
                                  updateRow(index, {
                                    mixed_supplier_cargo_weight: event.target.value,
                                  })
                                }
                                disabled={disableEdit}
                                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                              />
                            </label>
                            {row.mixed_supplier_cargo_unit_type === "Other" ? (
                              <label className="block sm:col-span-3">
                                <MiniLabel>Unit type (other) *</MiniLabel>
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
                                  placeholder="Unit type (other) *"
                                  disabled={disableEdit}
                                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                                />
                              </label>
                            ) : null}
                          </div>
                          <label className="mt-3 flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs">
                            <input
                              type="hidden"
                              name={fieldName(["trucks", String(index), "mixed_supplier_loaded"])}
                              value=""
                            />
                            <input
                              type="checkbox"
                              name={fieldName(["trucks", String(index), "mixed_supplier_loaded"])}
                              value="1"
                              checked={row.mixed_supplier_loaded}
                              onChange={(event) =>
                                updateMixedStopLoaded(index, "supplier", event.target.checked)
                              }
                              disabled={disableEdit}
                              className="h-4 w-4 rounded border-zinc-300"
                            />
                            <span>Mark Stop 2 loaded</span>
                          </label>
                        </div>
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
                    <>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="block">
                          <MiniLabel>Cargo quantity *</MiniLabel>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            placeholder="Cargo quantity *"
                            name={fieldName(["trucks", String(index), "cargo_quantity"])}
                            value={row.cargo_quantity}
                            onChange={(event) => updateRow(index, { cargo_quantity: event.target.value })}
                            disabled={disableEdit}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                          />
                        </label>
                        <label className="block">
                          <MiniLabel>Unit type *</MiniLabel>
                          <select
                            name={fieldName(["trucks", String(index), "cargo_unit_type"])}
                            value={row.cargo_unit_type}
                            onChange={(event) => updateRow(index, { cargo_unit_type: event.target.value })}
                            disabled={disableEdit}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                          >
                            <option value="">Unit type *</option>
                            {FTL_EXPORT_CARGO_UNIT_TYPES.map((unit) => (
                              <option key={`${index}-${unit}`} value={unit}>
                              {unit}
                            </option>
                          ))}
                          </select>
                        </label>
                        <label className="block">
                          <MiniLabel>Cargo weight *</MiniLabel>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            placeholder="Cargo weight *"
                            name={fieldName(["trucks", String(index), "cargo_weight"])}
                            value={row.cargo_weight}
                            onChange={(event) => updateRow(index, { cargo_weight: event.target.value })}
                            disabled={disableEdit}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                          />
                        </label>
                        {row.cargo_unit_type === "Other" ? (
                          <label className="block sm:col-span-3">
                            <MiniLabel>Unit type (other) *</MiniLabel>
                            <input
                              name={fieldName(["trucks", String(index), "cargo_unit_type_other"])}
                              value={row.cargo_unit_type_other}
                              onChange={(event) =>
                                updateRow(index, { cargo_unit_type_other: event.target.value })
                              }
                              placeholder="Unit type (other) *"
                              disabled={disableEdit}
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                            />
                          </label>
                        ) : null}
                      </div>
                      <label className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
                        <input
                          type="hidden"
                          name={fieldName(["trucks", String(index), "truck_loaded"])}
                          value=""
                        />
                        <input
                          type="checkbox"
                          name={fieldName(["trucks", String(index), "truck_loaded"])}
                          value="1"
                          checked={row.truck_loaded}
                          onChange={(event) =>
                            updateRow(index, { truck_loaded: event.target.checked })
                          }
                          disabled={disableEdit}
                          className="h-4 w-4 rounded border-zinc-300"
                        />
                        <span>Mark as loaded</span>
                      </label>
                    </>
                  )}

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                        Photos
                      </div>
                      <div className="mt-1 text-xs text-zinc-600">
                        Visual proof uploads {requiresVisualProof ? "(required)" : "(optional)"}
                      </div>
                      <div className="mt-3">
                        <label
                          className={`block cursor-pointer rounded-lg border border-dashed p-3 transition ${
                            dragActiveKey === photoInputKey
                              ? "border-emerald-400 bg-emerald-50"
                              : "border-zinc-300 bg-white hover:border-zinc-400"
                          } ${disableEdit ? "cursor-not-allowed bg-zinc-100 opacity-70" : ""}`}
                          onDragEnter={() => {
                            if (disableEdit) return;
                            setDragActiveKey(photoInputKey);
                          }}
                          onDragLeave={() => {
                            if (disableEdit) return;
                            setDragActiveKey((prev) => (prev === photoInputKey ? null : prev));
                          }}
                          onDragOver={(event) => {
                            if (disableEdit) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "copy";
                            setDragActiveKey(photoInputKey);
                          }}
                          onDrop={(event) => {
                            if (disableEdit) return;
                            event.preventDefault();
                            setDragActiveKey(null);
                            if (event.dataTransfer.files.length > 0) {
                              assignDroppedFiles(photoInputKey, event.dataTransfer.files);
                            }
                          }}
                        >
                          <input
                            ref={(el) => {
                              fileInputRefs.current[photoInputKey] = el;
                            }}
                            type="file"
                            name={fieldName(["trucks", String(index), "loading_photo"])}
                            multiple
                            disabled={disableEdit}
                            onChange={(event) =>
                              setSelectedUploadLabel(photoInputKey, event.currentTarget.files)
                            }
                            className="sr-only"
                          />
                          <div className="text-xs font-medium text-zinc-800">Loading photos</div>
                          <div className="mt-1 text-[11px] text-zinc-500">
                            Drag and drop files here, or click to browse.
                          </div>
                          <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700">
                            {selectedPhotoLabel}
                          </div>
                        </label>
                      </div>
                      <div
                        className={`mt-3 rounded-lg border p-2 text-xs ${
                          loadingPhotoDoc
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-zinc-200 bg-white text-zinc-500"
                        }`}
                      >
                        <div className="font-medium">Latest uploaded photo</div>
                        <div className="mt-1 truncate">
                          {loadingPhotoDoc ? loadingPhotoDoc.file_name : "No upload"}
                        </div>
                        <div className="mt-1 text-[11px] opacity-80">
                          Total photos uploaded: {uploadedPhotoCount}
                        </div>
                        {loadingPhotoDoc ? (
                          <div className="mt-1 text-[11px] opacity-80">
                            Uploaded {shortDate(loadingPhotoDoc.uploaded_at)}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                        Documents
                      </div>
                      <div className="mt-1 text-xs text-zinc-600">Optional paperwork uploads</div>
                      <div className="mt-3">
                        <label
                          className={`block cursor-pointer rounded-lg border border-dashed p-3 transition ${
                            dragActiveKey === sheetInputKey
                              ? "border-emerald-400 bg-emerald-50"
                              : "border-zinc-300 bg-white hover:border-zinc-400"
                          } ${disableEdit ? "cursor-not-allowed bg-zinc-100 opacity-70" : ""}`}
                          onDragEnter={() => {
                            if (disableEdit) return;
                            setDragActiveKey(sheetInputKey);
                          }}
                          onDragLeave={() => {
                            if (disableEdit) return;
                            setDragActiveKey((prev) => (prev === sheetInputKey ? null : prev));
                          }}
                          onDragOver={(event) => {
                            if (disableEdit) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "copy";
                            setDragActiveKey(sheetInputKey);
                          }}
                          onDrop={(event) => {
                            if (disableEdit) return;
                            event.preventDefault();
                            setDragActiveKey(null);
                            if (event.dataTransfer.files.length > 0) {
                              assignDroppedFiles(sheetInputKey, event.dataTransfer.files);
                            }
                          }}
                        >
                          <input
                            ref={(el) => {
                              fileInputRefs.current[sheetInputKey] = el;
                            }}
                            type="file"
                            name={fieldName(["trucks", String(index), "loading_sheet_upload"])}
                            disabled={disableEdit}
                            onChange={(event) =>
                              setSelectedUploadLabel(sheetInputKey, event.currentTarget.files)
                            }
                            className="sr-only"
                          />
                          <div className="text-xs font-medium text-zinc-800">Loading sheet</div>
                          <div className="mt-1 text-[11px] text-zinc-500">
                            Drag and drop a file here, or click to browse.
                          </div>
                          <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700">
                            {selectedSheetLabel}
                          </div>
                        </label>
                      </div>
                      <div
                        className={`mt-3 rounded-lg border p-2 text-xs ${
                          loadingSheetDoc
                            ? "border-blue-200 bg-blue-50 text-blue-900"
                            : "border-zinc-200 bg-white text-zinc-500"
                        }`}
                      >
                        <div className="font-medium">Loading sheet</div>
                        <div className="mt-1 truncate">
                          {loadingSheetDoc ? loadingSheetDoc.file_name : "No upload"}
                        </div>
                        {loadingSheetDoc ? (
                          <div className="mt-1 text-[11px] opacity-80">
                            Uploaded {shortDate(loadingSheetDoc.uploaded_at)}
                          </div>
                        ) : null}
                      </div>
                    </div>
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

              {tab === "details" ? (
                <>
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "supplier_name"])}
                    value={row.supplier_name}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "external_loading_date"])}
                    value={row.external_loading_date}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "external_loading_location"])}
                    value={row.external_loading_location}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "zaxon_actual_loading_date"])}
                    value={row.zaxon_actual_loading_date}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "zaxon_warehouse_remarks"])}
                    value={row.zaxon_warehouse_remarks}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_supplier_loading_date"])}
                    value={row.mixed_supplier_loading_date}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_supplier_remarks"])}
                    value={row.mixed_supplier_remarks}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_zaxon_loading_date"])}
                    value={row.mixed_zaxon_loading_date}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_zaxon_remarks"])}
                    value={row.mixed_zaxon_remarks}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_supplier_loaded"])}
                    value={row.mixed_supplier_loaded ? "1" : ""}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_zaxon_loaded"])}
                    value={row.mixed_zaxon_loaded ? "1" : ""}
                  />
                </>
              ) : null}

              {tab === "origin" ? (
                <>
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "truck_loaded"])}
                    value={effectiveLoaded ? "1" : ""}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_supplier_loaded"])}
                    value={row.mixed_supplier_loaded ? "1" : ""}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_zaxon_loaded"])}
                    value={row.mixed_zaxon_loaded ? "1" : ""}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "cargo_weight"])}
                    value={row.cargo_weight}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "cargo_unit_type"])}
                    value={row.cargo_unit_type}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "cargo_unit_type_other"])}
                    value={row.cargo_unit_type_other}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "cargo_quantity"])}
                    value={row.cargo_quantity}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_supplier_cargo_weight"])}
                    value={row.mixed_supplier_cargo_weight}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_supplier_cargo_unit_type"])}
                    value={row.mixed_supplier_cargo_unit_type}
                  />
                  <input
                    type="hidden"
                    name={fieldName([
                      "trucks",
                      String(index),
                      "mixed_supplier_cargo_unit_type_other",
                    ])}
                    value={row.mixed_supplier_cargo_unit_type_other}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_supplier_cargo_quantity"])}
                    value={row.mixed_supplier_cargo_quantity}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_zaxon_cargo_weight"])}
                    value={row.mixed_zaxon_cargo_weight}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_zaxon_cargo_unit_type"])}
                    value={row.mixed_zaxon_cargo_unit_type}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_zaxon_cargo_unit_type_other"])}
                    value={row.mixed_zaxon_cargo_unit_type_other}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "mixed_zaxon_cargo_quantity"])}
                    value={row.mixed_zaxon_cargo_quantity}
                  />
                  <input
                    type="hidden"
                    name={fieldName(["trucks", String(index), "remarks"])}
                    value={row.remarks}
                  />
                </>
              ) : null}

              <input
                type="hidden"
                name={fieldName(["trucks", String(index), "truck_reference"])}
                value={row.truck_reference || `Truck ${index + 1}`}
              />
            </div>
          );
        })}

        <input type="hidden" name="notes" value="" />
      </SectionFrame>
    </form>
  );
}



