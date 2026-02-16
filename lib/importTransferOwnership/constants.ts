export const IMPORT_TRANSFER_OWNERSHIP_TEMPLATE_NAME =
  "Import Transfer of Ownership";

export const IMPORT_TRANSFER_OWNERSHIP_SERVICE_TYPE =
  "IMPORT_TRANSFER_OWNERSHIP";

export const IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES = {
  overview: "Overview",
  partiesCargo: "Parties and cargo",
  documentsBoe: "Documents and BOE",
  collectionOutcome: "Collection and outcome",
  stockView: "Stock view",
} as const;

export const IMPORT_TRANSFER_OWNERSHIP_OPERATIONS_STEPS = [
  IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.overview,
  IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.partiesCargo,
  IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.documentsBoe,
  IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.collectionOutcome,
  IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.stockView,
] as const;

export const IMPORT_TRANSFER_BOE_PREPARED_BY = ["ZAXON", "SUPPLIER"] as const;

export const IMPORT_TRANSFER_OUTCOME_TYPES = [
  "DELIVER_TO_ZAXON_WAREHOUSE",
  "DIRECT_EXPORT",
] as const;

export const IMPORT_TRANSFER_COLLECTION_PERFORMED_BY = [
  "ZAXON",
  "SUPPLIER",
] as const;

export const IMPORT_TRANSFER_VEHICLE_TYPES = ["PICKUP", "TRAILER"] as const;

export const IMPORT_TRANSFER_VEHICLE_SIZES = [
  "SMALL",
  "MEDIUM",
  "LARGE",
] as const;

export const IMPORT_TRANSFER_STOCK_TYPES = [
  "PENDING",
  "OWNERSHIP_STOCK",
  "WAREHOUSE_STOCK",
] as const;

export type ImportTransferOutcomeType =
  (typeof IMPORT_TRANSFER_OUTCOME_TYPES)[number];

export type ImportTransferStockType =
  (typeof IMPORT_TRANSFER_STOCK_TYPES)[number];
