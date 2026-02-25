export const FCL_IMPORT_TEMPLATE_NAME = "FCL Import Clearance";
export const FCL_IMPORT_DEFAULT_DESTINATION = "Jebel ali port - Dubai";

export const FCL_IMPORT_STEP_NAMES = {
  shipmentCreation: "Shipment creation",
  vesselTracking: "Vessel tracking",
  containersDischarge: "Containers discharge",
  containerPullOut: "Container pull-out from port",
  containerDelivery: "Container delivery / offload",
  orderReceived: "Order received",
  billOfLading: "Bill of lading",
  commercialInvoice: "Commercial invoice and documents",
  deliveryOrder: "Delivery order",
  billOfEntry: "Bill of entry passed",
  tokenBooking: "Token booking",
  returnTokenBooking: "Return token booking",
} as const;

export const FCL_IMPORT_MAIN_TABS = [
  "order-overview",
  "tracking",
  "customs-clearance",
] as const;

export const FCL_IMPORT_ORDER_TABS = [
  "order-received",
  "container-list",
] as const;

export const FCL_IMPORT_TRACKING_TABS = [
  "vessel",
  "container",
] as const;

export const FCL_IMPORT_CUSTOMS_TABS = [
  "bl",
  "delivery-order",
  "commercial-invoice",
  "bill-of-entry",
] as const;

export const FCL_IMPORT_TRACKING_STEPS = [
  FCL_IMPORT_STEP_NAMES.vesselTracking,
  FCL_IMPORT_STEP_NAMES.containersDischarge,
  FCL_IMPORT_STEP_NAMES.containerPullOut,
  FCL_IMPORT_STEP_NAMES.containerDelivery,
] as const;

export const FCL_IMPORT_OPERATIONS_STEPS = [
  FCL_IMPORT_STEP_NAMES.orderReceived,
  FCL_IMPORT_STEP_NAMES.billOfLading,
  FCL_IMPORT_STEP_NAMES.commercialInvoice,
  FCL_IMPORT_STEP_NAMES.deliveryOrder,
  FCL_IMPORT_STEP_NAMES.billOfEntry,
] as const;

export const FCL_IMPORT_CONTAINER_STEPS = [
  FCL_IMPORT_STEP_NAMES.tokenBooking,
  FCL_IMPORT_STEP_NAMES.returnTokenBooking,
] as const;
