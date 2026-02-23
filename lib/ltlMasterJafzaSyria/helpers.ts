import { parseImportShipmentRows } from "@/lib/ftlExport/helpers";

export type SubshipmentLoadingSnapshot = {
  loadedIntoTruck: boolean;
  confirmedWeight: number;
  confirmedVolume: number;
};

export type SubshipmentHandoverSnapshot = {
  method: string;
  collectedByCustomer: boolean;
  collectionDate: string;
  outForDelivery: boolean;
  outForDeliveryDate: string;
  delivered: boolean;
  deliveryDate: string;
};

export function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  if (Array.isArray(value)) return {};
  if (Object.getPrototypeOf(value) !== Object.prototype) return {};
  return value as Record<string, unknown>;
}

export function getString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
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
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((entry) =>
      hasAnyValue(entry),
    );
  }
  return false;
}

export function parseSubshipmentImportRows(values: Record<string, unknown>) {
  return parseImportShipmentRows(values);
}

export function parseSubshipmentLoading(values: Record<string, unknown>): SubshipmentLoadingSnapshot {
  return {
    loadedIntoTruck: isTruthy(values.loaded_into_truck),
    confirmedWeight: getNumber(values.confirmed_weight),
    confirmedVolume: getNumber(values.confirmed_volume),
  };
}

export function parseSubshipmentHandover(values: Record<string, unknown>): SubshipmentHandoverSnapshot {
  return {
    method: getString(values.handover_method).toUpperCase(),
    collectedByCustomer: isTruthy(values.collected_by_customer),
    collectionDate: getString(values.collection_date),
    outForDelivery: isTruthy(values.out_for_delivery),
    outForDeliveryDate: getString(values.out_for_delivery_date),
    delivered: isTruthy(values.delivered),
    deliveryDate: getString(values.delivery_date),
  };
}

export function parseMasterWarehouse(values: Record<string, unknown>) {
  return {
    arrived: isTruthy(values.arrived_zaxon_syria_warehouse),
    arrivalDate: getString(values.arrival_date),
    offloaded: isTruthy(values.offloaded_zaxon_syria_warehouse),
    offloadDate: getString(values.offload_date),
  };
}
