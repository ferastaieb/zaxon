import type { JafzaLandRouteId } from "@/lib/routes/jafzaLandRoutes";

export const LTL_MASTER_JAFZA_SYRIA_TEMPLATE_NAME =
  "LTL Master JAFZA -> Syria";

export const LTL_MASTER_JAFZA_SYRIA_SERVICE_TYPE =
  "LTL_JAFZA_SYRIA_MASTER";
export const LTL_MASTER_JAFZA_KSA_SERVICE_TYPE =
  "LTL_JAFZA_KSA_MASTER";
export const LTL_MASTER_JAFZA_MUSHTARAKAH_SERVICE_TYPE =
  "LTL_JAFZA_MUSHTARAKAH_MASTER";

export type LtlMasterServiceType =
  | typeof LTL_MASTER_JAFZA_SYRIA_SERVICE_TYPE
  | typeof LTL_MASTER_JAFZA_KSA_SERVICE_TYPE
  | typeof LTL_MASTER_JAFZA_MUSHTARAKAH_SERVICE_TYPE;

export const LTL_MASTER_ROUTE_TO_SERVICE_TYPE: Record<
  JafzaLandRouteId,
  LtlMasterServiceType
> = {
  JAFZA_TO_SYRIA: LTL_MASTER_JAFZA_SYRIA_SERVICE_TYPE,
  JAFZA_TO_KSA: LTL_MASTER_JAFZA_KSA_SERVICE_TYPE,
  JAFZA_TO_MUSHTARAKAH: LTL_MASTER_JAFZA_MUSHTARAKAH_SERVICE_TYPE,
};

export const LTL_MASTER_SERVICE_TYPE_TO_ROUTE: Record<
  LtlMasterServiceType,
  JafzaLandRouteId
> = {
  [LTL_MASTER_JAFZA_SYRIA_SERVICE_TYPE]: "JAFZA_TO_SYRIA",
  [LTL_MASTER_JAFZA_KSA_SERVICE_TYPE]: "JAFZA_TO_KSA",
  [LTL_MASTER_JAFZA_MUSHTARAKAH_SERVICE_TYPE]: "JAFZA_TO_MUSHTARAKAH",
};

export const LTL_MASTER_JAFZA_SYRIA_STEP_NAMES = {
  shipmentCreation: "Shipment creation",
  trucksDetails: "Trucks details",
  addCustomerShipments: "Add customer shipments",
  loadingExecution: "Loading execution",
  exportInvoice: "Export invoice",
  customsAgentsAllocation: "Customs agents allocation",
  trackingUae: "Tracking - UAE",
  trackingKsa: "Tracking - KSA",
  trackingJordan: "Tracking - Jordan",
  trackingSyria: "Tracking - Syria",
  syriaWarehouseFinalDelivery: "Syria warehouse & final delivery",
} as const;

export const LTL_MASTER_JAFZA_SYRIA_MAIN_TABS = [
  "creation",
  "trucks",
  "subshipments",
  "loading",
  "invoice",
  "agents",
  "tracking",
  "handover",
] as const;

export const LTL_MASTER_JAFZA_SYRIA_TRACKING_STEPS = [
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingUae,
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingKsa,
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingJordan,
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingSyria,
] as const;

export const LTL_MASTER_JAFZA_SYRIA_OPERATIONS_STEPS = [
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.shipmentCreation,
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trucksDetails,
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.addCustomerShipments,
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.loadingExecution,
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.exportInvoice,
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.customsAgentsAllocation,
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.syriaWarehouseFinalDelivery,
] as const;

export const LTL_SUBSHIPMENT_TEMPLATE_NAME =
  "LTL Customer Shipment - Master";

export const LTL_SUBSHIPMENT_STEP_NAMES = {
  detailsAndImports: "Customer shipment details and imports",
  loadingExecution: "Customer loading execution",
  finalHandover: "Customer final handover",
} as const;

export const LTL_SUBSHIPMENT_HANDOVER_METHODS = [
  "PICKUP",
  "LOCAL_DELIVERY",
] as const;

export type LtlSubshipmentHandoverMethod =
  (typeof LTL_SUBSHIPMENT_HANDOVER_METHODS)[number];
