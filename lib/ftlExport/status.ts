import type { StepStatus } from "@/lib/domain";
import { encodeFieldPath, stepFieldDocType } from "@/lib/stepFields";
import { FTL_EXPORT_STEP_NAMES } from "./constants";
import {
  allReferencedImportsAvailable,
  computeImportWarnings,
  computeLoadingProgress,
  countActiveBookedTrucks,
  getString,
  hasAnyValue,
  isTruthy,
  parseImportShipmentRows,
  parseLoadingRows,
  parseTruckBookingRows,
  toRecord,
  type ImportSelectionWarnings,
} from "./helpers";

type StepSnapshot = {
  id: number;
  values: Record<string, unknown>;
};

type StatusInput = {
  stepsByName: Record<string, StepSnapshot | undefined>;
  docTypes: Set<string>;
};

export type FtlExportStatusResult = {
  statuses: Record<string, StepStatus>;
  loadingExpectedTrucks: number;
  loadingLoadedTrucks: number;
  canFinalizeInvoice: boolean;
  importWarnings: ImportSelectionWarnings;
};

function hasFile(step: StepSnapshot | undefined, path: string[], docTypes: Set<string>) {
  if (!step) return false;
  const docType = stepFieldDocType(step.id, encodeFieldPath(path));
  return docTypes.has(docType);
}

function statusByDoneAndTouched(done: boolean, touched: boolean): StepStatus {
  if (done) return "DONE";
  if (touched) return "IN_PROGRESS";
  return "PENDING";
}

export function computeFtlExportStatuses(input: StatusInput): FtlExportStatusResult {
  const statuses: Record<string, StepStatus> = {};

  const planStep = input.stepsByName[FTL_EXPORT_STEP_NAMES.exportPlanOverview];
  const planValues = toRecord(planStep?.values ?? {});
  const orderReceived = isTruthy(planValues.order_received);
  const orderReceivedDate = getString(planValues.order_received_date);
  const planTouched = hasAnyValue(planValues);
  statuses[FTL_EXPORT_STEP_NAMES.exportPlanOverview] = statusByDoneAndTouched(
    orderReceived && !!orderReceivedDate,
    planTouched,
  );

  const trucksStep = input.stepsByName[FTL_EXPORT_STEP_NAMES.trucksDetails];
  const truckRows = parseTruckBookingRows(toRecord(trucksStep?.values ?? {}));
  const truckProgress = countActiveBookedTrucks(truckRows);
  const trucksTouched = hasAnyValue(trucksStep?.values ?? {});
  statuses[FTL_EXPORT_STEP_NAMES.trucksDetails] =
    truckProgress.active > 0 && truckProgress.booked >= truckProgress.active
      ? "DONE"
      : truckRows.length > 0 || trucksTouched
        ? "IN_PROGRESS"
        : "PENDING";

  const loadingStep = input.stepsByName[FTL_EXPORT_STEP_NAMES.loadingDetails];
  const loadingRows = parseLoadingRows(toRecord(loadingStep?.values ?? {}));
  const loadingProgress = computeLoadingProgress({
    truckRows,
    loadingRows,
  });
  statuses[FTL_EXPORT_STEP_NAMES.loadingDetails] =
    loadingProgress.expected <= 0
      ? "PENDING"
      : loadingProgress.loaded <= 0
        ? "PENDING"
        : loadingProgress.loaded >= loadingProgress.expected
          ? "DONE"
          : "IN_PROGRESS";

  const importStep = input.stepsByName[FTL_EXPORT_STEP_NAMES.importShipmentSelection];
  const importRows = parseImportShipmentRows(toRecord(importStep?.values ?? {}));
  const importWarnings = computeImportWarnings(importRows);
  const importReady = importRows.filter(
    (row) =>
      !!row.import_shipment_reference &&
      row.processed_available &&
      (row.imported_quantity > 0 || row.imported_weight > 0),
  ).length;
  statuses[FTL_EXPORT_STEP_NAMES.importShipmentSelection] =
    importRows.length === 0
      ? "PENDING"
      : importReady >= importRows.length
        ? "DONE"
        : "IN_PROGRESS";

  const invoiceStep = input.stepsByName[FTL_EXPORT_STEP_NAMES.exportInvoice];
  const invoiceValues = toRecord(invoiceStep?.values ?? {});
  const invoiceNumber = getString(invoiceValues.invoice_number);
  const invoiceDate = getString(invoiceValues.invoice_date);
  const invoiceFinalized = isTruthy(invoiceValues.invoice_finalized);
  const invoiceFile = hasFile(invoiceStep, ["invoice_upload"], input.docTypes);
  const invoiceTouched = hasAnyValue(invoiceValues) || invoiceFile;
  const importsAvailable = allReferencedImportsAvailable(importRows);
  const loadingDone = statuses[FTL_EXPORT_STEP_NAMES.loadingDetails] === "DONE";
  const canFinalizeInvoice = loadingDone && importsAvailable;

  statuses[FTL_EXPORT_STEP_NAMES.exportInvoice] = !canFinalizeInvoice
    ? invoiceTouched
      ? "IN_PROGRESS"
      : "PENDING"
    : invoiceFinalized && !!invoiceNumber && !!invoiceDate && invoiceFile
      ? "DONE"
      : invoiceTouched
        ? "IN_PROGRESS"
        : "PENDING";

  const stockStep = input.stepsByName[FTL_EXPORT_STEP_NAMES.stockView];
  const stockTouched = hasAnyValue(stockStep?.values ?? {});
  statuses[FTL_EXPORT_STEP_NAMES.stockView] =
    statuses[FTL_EXPORT_STEP_NAMES.exportInvoice] === "DONE"
      ? "DONE"
      : importRows.length > 0 || stockTouched
        ? "IN_PROGRESS"
        : "PENDING";

  const customsStep = input.stepsByName[FTL_EXPORT_STEP_NAMES.customsAgentsAllocation];
  const customsValues = toRecord(customsStep?.values ?? {});
  const naseebMode = getString(customsValues.naseeb_clearance_mode).toUpperCase();
  const coreDone =
    !!getString(customsValues.jebel_ali_agent_name) &&
    !!getString(customsValues.sila_agent_name) &&
    !!getString(customsValues.batha_agent_name) &&
    !!getString(customsValues.omari_agent_name) &&
    !!naseebMode;
  const naseebDone =
    naseebMode === "CLIENT"
      ? !!getString(customsValues.naseeb_client_final_choice)
      : naseebMode === "ZAXON"
        ? !!getString(customsValues.naseeb_agent_name) &&
          !!getString(customsValues.syria_consignee_name) &&
          !!getString(customsValues.show_syria_consignee_to_client)
        : false;
  const customsTouched = hasAnyValue(customsValues);
  statuses[FTL_EXPORT_STEP_NAMES.customsAgentsAllocation] = statusByDoneAndTouched(
    coreDone && naseebDone,
    customsTouched,
  );

  const uaeStep = input.stepsByName[FTL_EXPORT_STEP_NAMES.trackingUae];
  const uaeValues = toRecord(uaeStep?.values ?? {});
  const uaeDone = isTruthy(uaeValues.sila_exit) || !!getString(uaeValues.sila_exit_date);
  statuses[FTL_EXPORT_STEP_NAMES.trackingUae] = statusByDoneAndTouched(
    uaeDone,
    hasAnyValue(uaeValues),
  );

  const ksaStep = input.stepsByName[FTL_EXPORT_STEP_NAMES.trackingKsa];
  const ksaValues = toRecord(ksaStep?.values ?? {});
  const ksaDone =
    isTruthy(ksaValues.hadietha_exit) || !!getString(ksaValues.hadietha_exit_date);
  statuses[FTL_EXPORT_STEP_NAMES.trackingKsa] = statusByDoneAndTouched(
    ksaDone,
    hasAnyValue(ksaValues),
  );

  const jordanStep = input.stepsByName[FTL_EXPORT_STEP_NAMES.trackingJordan];
  const jordanValues = toRecord(jordanStep?.values ?? {});
  const jordanDone =
    isTruthy(jordanValues.jaber_exit) || !!getString(jordanValues.jaber_exit_date);
  statuses[FTL_EXPORT_STEP_NAMES.trackingJordan] = statusByDoneAndTouched(
    jordanDone,
    hasAnyValue(jordanValues),
  );

  const syriaStep = input.stepsByName[FTL_EXPORT_STEP_NAMES.trackingSyria];
  const syriaValues = toRecord(syriaStep?.values ?? {});
  const clearanceMode = getString(syriaValues.syria_clearance_mode).toUpperCase();
  const delivered =
    isTruthy(syriaValues.syria_delivered) || !!getString(syriaValues.syria_delivered_date);
  const declarationDate = getString(syriaValues.syria_declaration_date);
  const declarationFile = hasFile(
    syriaStep,
    ["syria_declaration_upload"],
    input.docTypes,
  );
  const syriaDone =
    clearanceMode === "ZAXON"
      ? delivered && !!declarationDate && declarationFile
      : delivered;
  statuses[FTL_EXPORT_STEP_NAMES.trackingSyria] = statusByDoneAndTouched(
    syriaDone,
    hasAnyValue(syriaValues),
  );

  return {
    statuses,
    loadingExpectedTrucks: loadingProgress.expected,
    loadingLoadedTrucks: loadingProgress.loaded,
    canFinalizeInvoice,
    importWarnings,
  };
}

