import {
  FTL_EXPORT_LOADING_ORIGINS,
  FTL_EXPORT_TRUCK_BOOKING_STATUSES,
} from "./constants";

export type TruckBookingRow = {
  index: number;
  truck_reference: string;
  truck_number: string;
  trailer_type: string;
  driver_name: string;
  driver_contact: string;
  truck_booked: boolean;
  booking_status: string;
  booking_date: string;
  estimated_loading_date: string;
  cancellation_reason: string;
};

export type InvoiceTruckMissingField =
  | "truck_number"
  | "driver_name"
  | "driver_contact";

export type InvoiceTruckMissingRow = {
  index: number;
  truck_reference: string;
  missing_fields: InvoiceTruckMissingField[];
};

export type InvoiceTruckDetailsCheck = {
  active_trucks: number;
  missing_rows: InvoiceTruckMissingRow[];
  complete: boolean;
};

export type LoadingTruckRow = {
  index: number;
  truck_reference: string;
  truck_loaded: boolean;
  mixed_supplier_loaded: boolean;
  mixed_zaxon_loaded: boolean;
  raw_loading_origin: string;
  loading_origin: string;
  supplier_name: string;
  external_loading_date: string;
  external_loading_location: string;
  zaxon_actual_loading_date: string;
  zaxon_warehouse_remarks: string;
  mixed_supplier_loading_date: string;
  mixed_supplier_remarks: string;
  mixed_zaxon_loading_date: string;
  mixed_zaxon_remarks: string;
  mixed_supplier_cargo_weight: number;
  mixed_supplier_cargo_unit_type: string;
  mixed_supplier_cargo_unit_type_other: string;
  mixed_supplier_cargo_quantity: number;
  mixed_zaxon_cargo_weight: number;
  mixed_zaxon_cargo_unit_type: string;
  mixed_zaxon_cargo_unit_type_other: string;
  mixed_zaxon_cargo_quantity: number;
  cargo_weight: number;
  cargo_unit_type: string;
  cargo_unit_type_other: string;
  cargo_quantity: number;
  remarks: string;
};

export type ImportShipmentAllocationRow = {
  index: number;
  source_shipment_id: string;
  import_shipment_reference: string;
  client_number: string;
  import_boe_number: string;
  processed_available: boolean;
  imported_quantity: number;
  imported_weight: number;
  already_allocated_quantity: number;
  already_allocated_weight: number;
  allocated_quantity: number;
  allocated_weight: number;
  package_type: string;
  cargo_description: string;
  remarks: string;
  non_physical_stock: boolean;
};

export type ImportSelectionWarnings = {
  unavailable: ImportShipmentAllocationRow[];
  overallocation: ImportShipmentAllocationRow[];
};

export type ImportStockSummaryRow = {
  reference: string;
  importedQuantity: number;
  importedWeight: number;
  exportedQuantity: number;
  exportedWeight: number;
  remainingQuantity: number;
  remainingWeight: number;
};

type AnyRecord = Record<string, unknown>;

function isPlainObject(value: unknown): value is AnyRecord {
  if (!value || typeof value !== "object") return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

export function toRecord(value: unknown): AnyRecord {
  return isPlainObject(value) ? value : {};
}

export function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function isTruthy(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

export function hasAnyValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some((entry) => hasAnyValue(entry));
  if (isPlainObject(value)) {
    return Object.values(value).some((entry) => hasAnyValue(entry));
  }
  return false;
}

export function asGroupArray(values: AnyRecord, groupId: string): AnyRecord[] {
  const raw = values[groupId];
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is AnyRecord => isPlainObject(entry));
}

export function normalizeTruckBookingStatus(value: string): string {
  const normalized = value.trim().toUpperCase();
  return (FTL_EXPORT_TRUCK_BOOKING_STATUSES as readonly string[]).includes(
    normalized,
  )
    ? normalized
    : "PENDING";
}

export function normalizeLoadingOrigin(value: string): string {
  const normalized = value.trim().toUpperCase();
  return (FTL_EXPORT_LOADING_ORIGINS as readonly string[]).includes(normalized)
    ? normalized
    : "";
}

export function parseTruckBookingRows(values: AnyRecord): TruckBookingRow[] {
  return asGroupArray(values, "trucks").map((entry, index) => ({
    index,
    truck_reference: getString(entry.truck_reference),
    truck_number: getString(entry.truck_number),
    trailer_type: getString(entry.trailer_type),
    driver_name: getString(entry.driver_name),
    driver_contact: getString(entry.driver_contact),
    truck_booked: isTruthy(entry.truck_booked),
    booking_status: normalizeTruckBookingStatus(getString(entry.booking_status)),
    booking_date: getString(entry.booking_date),
    estimated_loading_date: getString(entry.estimated_loading_date),
    cancellation_reason: getString(entry.cancellation_reason),
  }));
}

export function evaluateInvoiceTruckDetails(
  rows: TruckBookingRow[],
): InvoiceTruckDetailsCheck {
  const activeRows = rows.filter((row) => row.booking_status !== "CANCELLED");
  const missingRows: InvoiceTruckMissingRow[] = [];

  for (const row of activeRows) {
    const missingFields: InvoiceTruckMissingField[] = [];
    if (!row.truck_number) missingFields.push("truck_number");
    if (!row.driver_name) missingFields.push("driver_name");
    if (!row.driver_contact) missingFields.push("driver_contact");
    if (!missingFields.length) continue;
    missingRows.push({
      index: row.index,
      truck_reference: row.truck_reference || `Truck ${row.index + 1}`,
      missing_fields: missingFields,
    });
  }

  return {
    active_trucks: activeRows.length,
    missing_rows: missingRows,
    complete: activeRows.length > 0 && missingRows.length === 0,
  };
}

export function parseLoadingRows(values: AnyRecord): LoadingTruckRow[] {
  return asGroupArray(values, "trucks").map((entry, index) => ({
    index,
    truck_reference: getString(entry.truck_reference),
    truck_loaded: isTruthy(entry.truck_loaded),
    mixed_supplier_loaded: isTruthy(entry.mixed_supplier_loaded),
    mixed_zaxon_loaded: isTruthy(entry.mixed_zaxon_loaded),
    raw_loading_origin: getString(entry.loading_origin),
    loading_origin: normalizeLoadingOrigin(getString(entry.loading_origin)),
    supplier_name: getString(entry.supplier_name),
    external_loading_date: getString(entry.external_loading_date),
    external_loading_location: getString(entry.external_loading_location),
    zaxon_actual_loading_date: getString(entry.zaxon_actual_loading_date),
    zaxon_warehouse_remarks: getString(entry.zaxon_warehouse_remarks),
    mixed_supplier_loading_date: getString(entry.mixed_supplier_loading_date),
    mixed_supplier_remarks: getString(entry.mixed_supplier_remarks),
    mixed_zaxon_loading_date: getString(entry.mixed_zaxon_loading_date),
    mixed_zaxon_remarks: getString(entry.mixed_zaxon_remarks),
    mixed_supplier_cargo_weight: getNumber(entry.mixed_supplier_cargo_weight),
    mixed_supplier_cargo_unit_type: getString(entry.mixed_supplier_cargo_unit_type),
    mixed_supplier_cargo_unit_type_other: getString(
      entry.mixed_supplier_cargo_unit_type_other,
    ),
    mixed_supplier_cargo_quantity: getNumber(entry.mixed_supplier_cargo_quantity),
    mixed_zaxon_cargo_weight: getNumber(entry.mixed_zaxon_cargo_weight),
    mixed_zaxon_cargo_unit_type: getString(entry.mixed_zaxon_cargo_unit_type),
    mixed_zaxon_cargo_unit_type_other: getString(
      entry.mixed_zaxon_cargo_unit_type_other,
    ),
    mixed_zaxon_cargo_quantity: getNumber(entry.mixed_zaxon_cargo_quantity),
    cargo_weight: getNumber(entry.cargo_weight),
    cargo_unit_type: getString(entry.cargo_unit_type),
    cargo_unit_type_other: getString(entry.cargo_unit_type_other),
    cargo_quantity: getNumber(entry.cargo_quantity),
    remarks: getString(entry.remarks),
  }));
}

export function parseImportShipmentRows(values: AnyRecord): ImportShipmentAllocationRow[] {
  return asGroupArray(values, "import_shipments").map((entry, index) => ({
    index,
    source_shipment_id: getString(entry.source_shipment_id),
    import_shipment_reference: getString(entry.import_shipment_reference),
    client_number: getString(entry.client_number),
    import_boe_number: getString(entry.import_boe_number),
    processed_available: isTruthy(entry.processed_available),
    imported_quantity: getNumber(entry.imported_quantity),
    imported_weight: getNumber(entry.imported_weight),
    already_allocated_quantity: getNumber(entry.already_allocated_quantity),
    already_allocated_weight: getNumber(entry.already_allocated_weight),
    allocated_quantity: getNumber(entry.allocated_quantity),
    allocated_weight: getNumber(entry.allocated_weight),
    package_type: getString(entry.package_type),
    cargo_description: getString(entry.cargo_description),
    remarks: getString(entry.remarks),
    non_physical_stock: isTruthy(entry.non_physical_stock),
  }));
}

export function countActiveBookedTrucks(rows: TruckBookingRow[]): {
  active: number;
  booked: number;
} {
  const active = rows.filter((row) => row.booking_status !== "CANCELLED").length;
  const booked = rows.filter(
    (row) =>
      (row.booking_status === "BOOKED" || row.truck_booked) && !!row.booking_date,
  ).length;
  return { active, booked };
}

export function computeLoadingProgress(input: {
  truckRows: TruckBookingRow[];
  loadingRows: LoadingTruckRow[];
}) {
  const activeTruckCount = input.truckRows.filter(
    (row) => row.booking_status !== "CANCELLED",
  ).length;
  const expected = activeTruckCount || input.loadingRows.length;
  const loaded = input.loadingRows.filter((row) => row.truck_loaded).length;
  return { expected, loaded };
}

export function computeImportWarnings(
  rows: ImportShipmentAllocationRow[],
): ImportSelectionWarnings {
  const unavailable: ImportShipmentAllocationRow[] = [];
  const overallocation: ImportShipmentAllocationRow[] = [];
  for (const row of rows) {
    if (!row.processed_available) {
      unavailable.push(row);
    }
    const remainingQuantity = Math.max(
      0,
      row.imported_quantity - row.already_allocated_quantity,
    );
    const remainingWeight = Math.max(
      0,
      row.imported_weight - row.already_allocated_weight,
    );
    const quantityOver = row.allocated_quantity > remainingQuantity;
    const weightOver = row.allocated_weight > remainingWeight;
    if (quantityOver || weightOver) {
      overallocation.push(row);
    }
  }
  return { unavailable, overallocation };
}

export function allReferencedImportsAvailable(
  rows: ImportShipmentAllocationRow[],
): boolean {
  if (!rows.length) return false;
  return rows.every(
    (row) => row.processed_available && !!row.import_shipment_reference,
  );
}

export function buildImportStockSummary(
  rows: ImportShipmentAllocationRow[],
): ImportStockSummaryRow[] {
  return rows.map((row) => {
    const exportedQuantity = row.already_allocated_quantity + row.allocated_quantity;
    const exportedWeight = row.already_allocated_weight + row.allocated_weight;
    const remainingQuantity = Math.max(0, row.imported_quantity - exportedQuantity);
    const remainingWeight = Math.max(0, row.imported_weight - exportedWeight);
    return {
      reference:
        row.import_shipment_reference ||
        row.import_boe_number ||
        row.client_number ||
        `Import ${row.index + 1}`,
      importedQuantity: row.imported_quantity,
      importedWeight: row.imported_weight,
      exportedQuantity,
      exportedWeight,
      remainingQuantity,
      remainingWeight,
    };
  });
}
