export const FTL_EXPORT_TEMPLATE_NAME = "FTL Export - Warehouse Operations";

export const FTL_EXPORT_SERVICE_TYPE = "FTL_EXPORT_WAREHOUSE";

export const FTL_EXPORT_ROUTES = [
  {
    id: "JEBEL_ALI_DUBAI_TO_SYRIA",
    label: "Jebel Ali, Dubai to Syria",
    origin: "Jebel Ali, Dubai",
    destination: "Syria",
  },
] as const;

export const FTL_EXPORT_STEP_NAMES = {
  exportPlanOverview: "Export plan overview",
  trucksDetails: "Trucks details",
  loadingDetails: "Loading details",
  importShipmentSelection: "Import shipment selection",
  exportInvoice: "Export invoice",
  stockView: "Stock view",
  customsAgentsAllocation: "Customs agents allocation",
  trackingUae: "Tracking - UAE",
  trackingKsa: "Tracking - KSA",
  trackingJordan: "Tracking - Jordan",
  trackingSyria: "Tracking - Syria",
} as const;

export const FTL_EXPORT_OPERATIONS_STEPS = [
  FTL_EXPORT_STEP_NAMES.exportPlanOverview,
  FTL_EXPORT_STEP_NAMES.trucksDetails,
  FTL_EXPORT_STEP_NAMES.loadingDetails,
  FTL_EXPORT_STEP_NAMES.importShipmentSelection,
  FTL_EXPORT_STEP_NAMES.exportInvoice,
  FTL_EXPORT_STEP_NAMES.stockView,
  FTL_EXPORT_STEP_NAMES.customsAgentsAllocation,
] as const;

export const FTL_EXPORT_TRACKING_STEPS = [
  FTL_EXPORT_STEP_NAMES.trackingUae,
  FTL_EXPORT_STEP_NAMES.trackingKsa,
  FTL_EXPORT_STEP_NAMES.trackingJordan,
  FTL_EXPORT_STEP_NAMES.trackingSyria,
] as const;

export const FTL_EXPORT_CARGO_UNIT_TYPES = [
  "Pallets",
  "Cartons",
  "Packages",
  "Vehicles",
  "Machinery",
  "Other",
] as const;

export const FTL_EXPORT_TRAILER_TYPES = [
  "18M Trailer",
  "16M Trailer",
  "15M Trailer",
  "13.5M Refer",
] as const;

export const FTL_EXPORT_LOADING_ORIGINS = [
  "ZAXON_WAREHOUSE",
  "EXTERNAL_SUPPLIER",
  "MIXED",
] as const;

export const FTL_EXPORT_TRUCK_BOOKING_STATUSES = [
  "PENDING",
  "BOOKED",
  "CANCELLED",
] as const;
