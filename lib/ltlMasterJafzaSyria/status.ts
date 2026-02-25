import type { StepStatus } from "@/lib/domain";
import { encodeFieldPath, stepFieldDocType } from "@/lib/stepFields";
import {
  countActiveBookedTrucks,
  parseTruckBookingRows,
} from "@/lib/ftlExport/helpers";
import {
  LTL_MASTER_SERVICE_TYPE_TO_ROUTE,
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES,
  LTL_SUBSHIPMENT_STEP_NAMES,
} from "./constants";
import {
  getString,
  hasAnyValue,
  isTruthy,
  parseMasterWarehouse,
  parseSubshipmentHandover,
  parseSubshipmentImportRows,
  parseSubshipmentLoading,
  toRecord,
} from "./helpers";

type StepSnapshot = {
  id: number;
  values: Record<string, unknown>;
};

function hasFile(stepId: number | null | undefined, path: string[], docTypes: Set<string>) {
  if (!stepId) return false;
  const type = stepFieldDocType(stepId, encodeFieldPath(path));
  return docTypes.has(type);
}

function statusByDoneAndTouched(done: boolean, touched: boolean): StepStatus {
  if (done) return "DONE";
  if (touched) return "IN_PROGRESS";
  return "PENDING";
}

function checkpointDone(values: Record<string, unknown>, flagKey: string, dateKey: string) {
  return isTruthy(values[flagKey]) || !!getString(values[dateKey]);
}

export type LtlSubshipmentStatusResult = {
  statuses: Record<string, StepStatus>;
  detailsDone: boolean;
  loadingDone: boolean;
  loadedIntoTruck: boolean;
  handoverDone: boolean;
  shipmentDone: boolean;
};

export function computeLtlSubshipmentStatuses(input: {
  stepsByName: Record<string, StepSnapshot | undefined>;
  docTypes: Set<string>;
}) {
  const statuses: Record<string, StepStatus> = {};

  const detailsStep = input.stepsByName[LTL_SUBSHIPMENT_STEP_NAMES.detailsAndImports];
  const detailsValues = toRecord(detailsStep?.values ?? {});
  const clientName = getString(detailsValues.client_name);
  const importRows = parseSubshipmentImportRows(detailsValues);
  const hasImportReference = importRows.some((row) => !!row.source_shipment_id.trim());
  const detailsDone = !!clientName && hasImportReference;
  statuses[LTL_SUBSHIPMENT_STEP_NAMES.detailsAndImports] = statusByDoneAndTouched(
    detailsDone,
    hasAnyValue(detailsValues),
  );

  const loadingStep = input.stepsByName[LTL_SUBSHIPMENT_STEP_NAMES.loadingExecution];
  const loadingValues = toRecord(loadingStep?.values ?? {});
  const loading = parseSubshipmentLoading(loadingValues);
  const loadingPhoto = hasFile(loadingStep?.id, ["loading_photos"], input.docTypes);
  const loadingDone =
    loading.loadedIntoTruck &&
    loading.confirmedWeight > 0 &&
    loading.confirmedVolume > 0 &&
    loadingPhoto;
  statuses[LTL_SUBSHIPMENT_STEP_NAMES.loadingExecution] = statusByDoneAndTouched(
    loadingDone,
    hasAnyValue(loadingValues),
  );

  const handoverStep = input.stepsByName[LTL_SUBSHIPMENT_STEP_NAMES.finalHandover];
  const handoverValues = toRecord(handoverStep?.values ?? {});
  const handover = parseSubshipmentHandover(handoverValues);
  const pickupDone =
    handover.method === "PICKUP" &&
    (handover.collectedByCustomer || !!handover.collectionDate);
  const deliveryDone =
    handover.method === "LOCAL_DELIVERY" &&
    (handover.delivered || !!handover.deliveryDate);
  const handoverDone = pickupDone || deliveryDone;
  statuses[LTL_SUBSHIPMENT_STEP_NAMES.finalHandover] = statusByDoneAndTouched(
    handoverDone,
    hasAnyValue(handoverValues),
  );

  return {
    statuses,
    detailsDone,
    loadingDone,
    loadedIntoTruck: loading.loadedIntoTruck,
    handoverDone,
    shipmentDone: handoverDone,
  } as LtlSubshipmentStatusResult;
}

export type LtlMasterTripLoadingStatus = "PENDING" | "IN_PROGRESS" | "DONE";

export type LtlMasterStatusResult = {
  statuses: Record<string, StepStatus>;
  tripLoadingStatus: LtlMasterTripLoadingStatus;
  canFinalizeInvoice: boolean;
  trackingUnlocked: boolean;
  allSubshipmentsDone: boolean;
};

function toTripLoadingStatus(input: {
  subshipmentCount: number;
  loadedCount: number;
  closeLoading: boolean;
  allProcessed: boolean;
}): LtlMasterTripLoadingStatus {
  if (input.subshipmentCount <= 0 || input.loadedCount <= 0) return "PENDING";
  if (input.closeLoading || input.allProcessed) return "DONE";
  return "IN_PROGRESS";
}

export function computeLtlMasterStatuses(input: {
  stepsByName: Record<string, StepSnapshot | undefined>;
  docTypes: Set<string>;
  subshipments: LtlSubshipmentStatusResult[];
}) {
  const statuses: Record<string, StepStatus> = {};

  const creationStep = input.stepsByName[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.shipmentCreation];
  const creationValues = toRecord(creationStep?.values ?? {});
  const serviceType = getString(creationValues.service_type);
  const routeIdRaw = getString(creationValues.route_id);
  const routeId =
    routeIdRaw === "JAFZA_TO_SYRIA" ||
    routeIdRaw === "JAFZA_TO_KSA" ||
    routeIdRaw === "JAFZA_TO_MUSHTARAKAH"
      ? routeIdRaw
      : serviceType &&
        Object.prototype.hasOwnProperty.call(LTL_MASTER_SERVICE_TYPE_TO_ROUTE, serviceType)
        ? LTL_MASTER_SERVICE_TYPE_TO_ROUTE[
            serviceType as keyof typeof LTL_MASTER_SERVICE_TYPE_TO_ROUTE
          ]
        : "JAFZA_TO_SYRIA";
  const validServiceType =
    !!serviceType &&
    Object.prototype.hasOwnProperty.call(LTL_MASTER_SERVICE_TYPE_TO_ROUTE, serviceType);
  statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.shipmentCreation] = statusByDoneAndTouched(
    validServiceType,
    hasAnyValue(creationValues),
  );

  const trucksStep = input.stepsByName[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trucksDetails];
  const trucksValues = toRecord(trucksStep?.values ?? {});
  const truckRows = parseTruckBookingRows(trucksValues);
  const truckProgress = countActiveBookedTrucks(truckRows);
  const trucksDone = truckProgress.active > 0 && truckProgress.booked >= truckProgress.active;
  statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trucksDetails] = statusByDoneAndTouched(
    trucksDone,
    hasAnyValue(trucksValues),
  );

  statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.addCustomerShipments] =
    input.subshipments.length > 0 ? "DONE" : "PENDING";

  const loadingStep = input.stepsByName[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.loadingExecution];
  const loadingValues = toRecord(loadingStep?.values ?? {});
  const closeLoading = isTruthy(loadingValues.close_loading);
  const loadedCount = input.subshipments.filter((item) => item.loadedIntoTruck).length;
  const allProcessed =
    input.subshipments.length > 0 &&
    input.subshipments.every((item) => item.loadingDone);
  const tripLoadingStatus = toTripLoadingStatus({
    subshipmentCount: input.subshipments.length,
    loadedCount,
    closeLoading,
    allProcessed,
  });
  statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.loadingExecution] =
    tripLoadingStatus === "DONE"
      ? "DONE"
      : tripLoadingStatus === "IN_PROGRESS"
        ? "IN_PROGRESS"
        : "PENDING";

  const invoiceStep = input.stepsByName[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.exportInvoice];
  const invoiceValues = toRecord(invoiceStep?.values ?? {});
  const invoiceNumber = getString(invoiceValues.invoice_number);
  const invoiceDate = getString(invoiceValues.invoice_date);
  const invoiceFinalized = isTruthy(invoiceValues.invoice_finalized);
  const invoiceFile = hasFile(invoiceStep?.id, ["invoice_upload"], input.docTypes);
  const canFinalizeInvoice = statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.loadingExecution] === "DONE";
  statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.exportInvoice] = !canFinalizeInvoice
    ? hasAnyValue(invoiceValues) || invoiceFile
      ? "IN_PROGRESS"
      : "PENDING"
    : invoiceFinalized && !!invoiceNumber && !!invoiceDate && invoiceFile
      ? "DONE"
      : hasAnyValue(invoiceValues) || invoiceFile
        ? "IN_PROGRESS"
        : "PENDING";

  const customsStep =
    input.stepsByName[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.customsAgentsAllocation];
  const customsValues = toRecord(customsStep?.values ?? {});
  const modeDone = (prefix: "batha" | "masnaa") => {
    const mode = getString(customsValues[`${prefix}_clearance_mode`]).toUpperCase();
    if (mode === "CLIENT") {
      return !!getString(customsValues[`${prefix}_client_final_choice`]);
    }
    if (mode === "ZAXON") {
      return (
        !!getString(customsValues[`${prefix}_agent_name`]) &&
        !!getString(customsValues[`${prefix}_consignee_name`]) &&
        !!getString(customsValues[`show_${prefix}_consignee_to_client`])
      );
    }
    return false;
  };
  const coreUaeDone =
    !!getString(customsValues.jebel_ali_agent_name) &&
    !!getString(customsValues.sila_agent_name);
  const customsDone =
    routeId === "JAFZA_TO_KSA"
      ? coreUaeDone && modeDone("batha")
      : routeId === "JAFZA_TO_MUSHTARAKAH"
        ? coreUaeDone &&
          !!getString(customsValues.batha_agent_name) &&
          !!getString(customsValues.omari_agent_name) &&
          !!getString(customsValues.mushtarakah_agent_name) &&
          !!getString(customsValues.mushtarakah_consignee_name) &&
          modeDone("masnaa")
        : coreUaeDone &&
          !!getString(customsValues.batha_agent_name) &&
          !!getString(customsValues.omari_agent_name) &&
          getString(customsValues.naseeb_clearance_mode).toUpperCase() === "ZAXON" &&
          !!getString(customsValues.naseeb_agent_name) &&
          !!getString(customsValues.syria_consignee_name);
  statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.customsAgentsAllocation] = statusByDoneAndTouched(
    customsDone,
    hasAnyValue(customsValues),
  );

  const trackingUnlocked =
    statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.loadingExecution] === "DONE" &&
    statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.exportInvoice] === "DONE";

  const uaeStep = input.stepsByName[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingUae];
  const uaeValues = toRecord(uaeStep?.values ?? {});
  statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingUae] = statusByDoneAndTouched(
    checkpointDone(uaeValues, "sila_exit", "sila_exit_date"),
    hasAnyValue(uaeValues),
  );

  const ksaStep = input.stepsByName[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingKsa];
  const ksaValues = toRecord(ksaStep?.values ?? {});
  statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingKsa] = statusByDoneAndTouched(
    routeId === "JAFZA_TO_KSA"
      ? checkpointDone(ksaValues, "batha_delivered", "batha_delivered_date")
      : checkpointDone(ksaValues, "hadietha_exit", "hadietha_exit_date"),
    hasAnyValue(ksaValues),
  );

  const jordanStep = input.stepsByName[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingJordan];
  const jordanValues = toRecord(jordanStep?.values ?? {});
  statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingJordan] = statusByDoneAndTouched(
    routeId === "JAFZA_TO_KSA"
      ? true
      : checkpointDone(jordanValues, "jaber_exit", "jaber_exit_date"),
    hasAnyValue(jordanValues),
  );

  const syriaStep = input.stepsByName[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingSyria];
  const syriaValues = toRecord(syriaStep?.values ?? {});
  const syriaDone =
    routeId === "JAFZA_TO_KSA"
      ? true
      : routeId === "JAFZA_TO_MUSHTARAKAH"
        ? checkpointDone(syriaValues, "mushtarakah_entered", "mushtarakah_entered_date") &&
          checkpointDone(
            syriaValues,
            "mushtarakah_offloaded_warehouse",
            "mushtarakah_offloaded_warehouse_date",
          ) &&
          checkpointDone(
            syriaValues,
            "mushtarakah_loaded_syrian_trucks",
            "mushtarakah_loaded_syrian_trucks_date",
          ) &&
          checkpointDone(syriaValues, "mushtarakah_exit", "mushtarakah_exit_date") &&
          checkpointDone(syriaValues, "naseeb_arrived", "naseeb_arrived_date") &&
          checkpointDone(syriaValues, "naseeb_entered", "naseeb_entered_date") &&
          checkpointDone(syriaValues, "masnaa_arrived", "masnaa_arrived_date") &&
          checkpointDone(syriaValues, "masnaa_entered", "masnaa_entered_date") &&
          checkpointDone(syriaValues, "masnaa_delivered", "masnaa_delivered_date")
        : checkpointDone(syriaValues, "syria_delivered", "syria_delivered_date") &&
          getString(syriaValues.syria_clearance_mode).toUpperCase() === "ZAXON";
  statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingSyria] = statusByDoneAndTouched(
    syriaDone,
    hasAnyValue(syriaValues),
  );

  const handoverStep = input.stepsByName[
    LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.syriaWarehouseFinalDelivery
  ];
  const handoverValues = toRecord(handoverStep?.values ?? {});
  const warehouse = parseMasterWarehouse(handoverValues);
  const allSubshipmentsDone =
    input.subshipments.length > 0 &&
    input.subshipments.every((item) => item.shipmentDone);
  const handoverDone = warehouse.offloaded && !!warehouse.offloadDate && allSubshipmentsDone;
  statuses[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.syriaWarehouseFinalDelivery] =
    statusByDoneAndTouched(handoverDone, hasAnyValue(handoverValues) || allSubshipmentsDone);

  return {
    statuses,
    tripLoadingStatus,
    canFinalizeInvoice,
    trackingUnlocked,
    allSubshipmentsDone,
  } as LtlMasterStatusResult;
}
