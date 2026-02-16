import {
  IMPORT_TRANSFER_OUTCOME_TYPES,
  type ImportTransferOutcomeType,
  type ImportTransferStockType,
} from "./constants";

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
  if (typeof value === "number" && Number.isFinite(value)) return value;
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

export type ImportTransferVehicleRow = {
  index: number;
  vehicle_type: string;
  vehicle_size: string;
  vehicle_count: number;
};

export function parseVehicleRows(values: AnyRecord): ImportTransferVehicleRow[] {
  return asGroupArray(values, "vehicles").map((entry, index) => ({
    index,
    vehicle_type: getString(entry.vehicle_type),
    vehicle_size: getString(entry.vehicle_size),
    vehicle_count: getNumber(entry.vehicle_count),
  }));
}

export type ImportTransferPartiesCargoData = {
  supplier_company_name: string;
  supplier_location: string;
  supplier_contact_person: string;
  supplier_contact_details: string;
  cargo_description: string;
  package_type: string;
  quantity: number;
  total_weight: number;
  remarks: string;
};

export function parsePartiesCargo(values: AnyRecord): ImportTransferPartiesCargoData {
  return {
    supplier_company_name: getString(values.supplier_company_name),
    supplier_location: getString(values.supplier_location),
    supplier_contact_person: getString(values.supplier_contact_person),
    supplier_contact_details: getString(values.supplier_contact_details),
    cargo_description: getString(values.cargo_description),
    package_type: getString(values.package_type),
    quantity: getNumber(values.quantity),
    total_weight: getNumber(values.total_weight),
    remarks: getString(values.remarks),
  };
}

export type ImportTransferDocumentsBoeData = {
  boe_prepared_by: string;
  boe_number: string;
  boe_date: string;
};

export function parseDocumentsBoe(values: AnyRecord): ImportTransferDocumentsBoeData {
  return {
    boe_prepared_by: getString(values.boe_prepared_by),
    boe_number: getString(values.boe_number),
    boe_date: getString(values.boe_date),
  };
}

export type ImportTransferCollectionOutcomeData = {
  outcome_type: string;
  planned_collection_date: string;
  collection_performed_by: string;
  cargo_collected: boolean;
  collected_date: string;
  cargo_delivered_to_zaxon: boolean;
  dropoff_date: string;
  collected_by_export_truck: boolean;
  direct_export_date: string;
  pending_reason: string;
  expected_collection_date: string;
};

export function parseCollectionOutcome(
  values: AnyRecord,
): ImportTransferCollectionOutcomeData {
  return {
    outcome_type: getString(values.outcome_type),
    planned_collection_date: getString(values.planned_collection_date),
    collection_performed_by: getString(values.collection_performed_by),
    cargo_collected: isTruthy(values.cargo_collected),
    collected_date: getString(values.collected_date),
    cargo_delivered_to_zaxon: isTruthy(values.cargo_delivered_to_zaxon),
    dropoff_date: getString(values.dropoff_date),
    collected_by_export_truck: isTruthy(values.collected_by_export_truck),
    direct_export_date: getString(values.direct_export_date),
    pending_reason: getString(values.pending_reason),
    expected_collection_date: getString(values.expected_collection_date),
  };
}

export function normalizeOutcomeType(value: string): ImportTransferOutcomeType | "" {
  const normalized = value.trim().toUpperCase();
  return (IMPORT_TRANSFER_OUTCOME_TYPES as readonly string[]).includes(normalized)
    ? (normalized as ImportTransferOutcomeType)
    : "";
}

export function computeImportTransferStockType(input: {
  boeDone: boolean;
  outcomeType: string;
  deliveredToWarehouse: boolean;
}): ImportTransferStockType {
  if (!input.boeDone) return "PENDING";
  const outcome = normalizeOutcomeType(input.outcomeType);
  if (outcome === "DELIVER_TO_ZAXON_WAREHOUSE" && input.deliveredToWarehouse) {
    return "WAREHOUSE_STOCK";
  }
  return "OWNERSHIP_STOCK";
}
