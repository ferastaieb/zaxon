import type { StepStatus } from "@/lib/domain";
import { encodeFieldPath, stepFieldDocType } from "@/lib/stepFields";
import { FCL_IMPORT_STEP_NAMES } from "./constants";
import { isTruthy, normalizeContainerRows } from "./helpers";

type StepSnapshot = {
  id: number;
  values: Record<string, unknown>;
};

type StatusInput = {
  stepsByName: Record<string, StepSnapshot | undefined>;
  containerNumbers: string[];
  docTypes: Set<string>;
};

function getString(values: Record<string, unknown>, key: string) {
  const value = values[key];
  return typeof value === "string" ? value.trim() : "";
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  if (Object.getPrototypeOf(value) !== Object.prototype) return {};
  return value as Record<string, unknown>;
}

function hasFile(step: StepSnapshot | undefined, path: string[], docTypes: Set<string>) {
  if (!step) return false;
  const docType = stepFieldDocType(step.id, encodeFieldPath(path));
  return docTypes.has(docType);
}

export function computeFclStatuses(input: StatusInput): Record<string, StepStatus> {
  const statuses: Record<string, StepStatus> = {};
  const containerTotal = input.containerNumbers.length;

  const creationStep = input.stepsByName[FCL_IMPORT_STEP_NAMES.shipmentCreation];
  if (creationStep) {
    statuses[FCL_IMPORT_STEP_NAMES.shipmentCreation] = containerTotal
      ? "DONE"
      : "PENDING";
  }

  const orderStep = input.stepsByName[FCL_IMPORT_STEP_NAMES.orderReceived];
  const orderValues = orderStep?.values ?? {};
  const orderReceived = isTruthy(orderValues.order_received);
  statuses[FCL_IMPORT_STEP_NAMES.orderReceived] = orderReceived ? "DONE" : "PENDING";

  const trackingEnabled = orderReceived;

  const vesselStep = input.stepsByName[FCL_IMPORT_STEP_NAMES.vesselTracking];
  const vesselValues = vesselStep?.values ?? {};
  const eta = getString(vesselValues, "eta");
  const ata = getString(vesselValues, "ata");
  statuses[FCL_IMPORT_STEP_NAMES.vesselTracking] = !trackingEnabled
    ? "PENDING"
    : ata
      ? "DONE"
      : eta
        ? "IN_PROGRESS"
        : "PENDING";
  const vesselArrived = !!ata;

  const dischargeStep = input.stepsByName[FCL_IMPORT_STEP_NAMES.containersDischarge];
  const dischargeRows = normalizeContainerRows(
    input.containerNumbers,
    dischargeStep?.values ?? {},
  );
  const dischargedCount = dischargeRows.filter((row) => {
    return isTruthy(row.container_discharged) || !!row.container_discharged_date?.trim();
  }).length;
  statuses[FCL_IMPORT_STEP_NAMES.containersDischarge] =
    !containerTotal || !trackingEnabled || !vesselArrived
      ? "PENDING"
      : dischargedCount === 0
        ? "PENDING"
        : dischargedCount >= containerTotal
          ? "DONE"
          : "IN_PROGRESS";

  const blStep = input.stepsByName[FCL_IMPORT_STEP_NAMES.billOfLading];
  const blValues = blStep?.values ?? {};
  const blType = toRecord(blValues.bl_type);
  const telexValues = toRecord(blType.telex);
  const originalValues = toRecord(blType.original);
  const telexReleased =
    isTruthy(telexValues.telex_copy_released) &&
    hasFile(blStep, ["bl_type", "telex", "telex_copy_released_file"], input.docTypes);
  const originalReceived = isTruthy(originalValues.original_received);
  const originalSubmitted =
    originalReceived &&
    isTruthy(originalValues.original_submitted) &&
    !!getString(originalValues, "original_submitted_date");
  const originalSurrendered =
    isTruthy(originalValues.original_surrendered) &&
    hasFile(
      blStep,
      ["bl_type", "original", "original_surrendered_file"],
      input.docTypes,
    );
  const blDone = telexReleased || originalSubmitted || originalSurrendered;
  const blTouched =
    !!getString(blValues, "draft_bl_file") ||
    Object.keys(telexValues).length > 0 ||
    Object.keys(originalValues).length > 0;
  statuses[FCL_IMPORT_STEP_NAMES.billOfLading] = blDone
    ? "DONE"
    : blTouched
      ? "IN_PROGRESS"
      : "PENDING";

  const invoiceStep = input.stepsByName[FCL_IMPORT_STEP_NAMES.commercialInvoice];
  const invoiceValues = invoiceStep?.values ?? {};
  const legacyCopy = isTruthy(invoiceValues.proceed_with_copy);
  const legacyOriginal = isTruthy(invoiceValues.original_invoice_received);
  const invoiceOption =
    getString(invoiceValues, "invoice_option") ||
    (legacyCopy ? "COPY_FINE" : legacyOriginal ? "ORIGINAL" : "");
  const optionA = invoiceOption === "COPY_20_DAYS";
  const optionB = invoiceOption === "COPY_FINE";
  const optionC = invoiceOption === "ORIGINAL";
  const copyInvoiceReceived = isTruthy(invoiceValues.copy_invoice_received);
  const copyInvoiceFile = hasFile(invoiceStep, ["copy_invoice_file"], input.docTypes);
  const originalInvoiceReceived = isTruthy(invoiceValues.original_invoice_received);
  const originalInvoiceFile = hasFile(
    invoiceStep,
    ["original_invoice_file"],
    input.docTypes,
  );
  const invoiceDone = optionB || optionC;
  const invoiceTouched =
    copyInvoiceReceived ||
    copyInvoiceFile ||
    originalInvoiceReceived ||
    originalInvoiceFile ||
    !!invoiceOption ||
    legacyCopy;
  statuses[FCL_IMPORT_STEP_NAMES.commercialInvoice] = invoiceDone
    ? "DONE"
    : invoiceTouched
      ? "IN_PROGRESS"
      : "PENDING";

  const deliveryStep = input.stepsByName[FCL_IMPORT_STEP_NAMES.deliveryOrder];
  const deliveryValues = deliveryStep?.values ?? {};
  const deliveryObtained = isTruthy(deliveryValues.delivery_order_obtained);
  const deliveryDate = getString(deliveryValues, "delivery_order_date");
  const deliveryFile = hasFile(
    deliveryStep,
    ["delivery_order_file"],
    input.docTypes,
  );
  const deliveryTouched =
    deliveryObtained ||
    !!deliveryDate ||
    !!getString(deliveryValues, "delivery_order_validity");
  const deliveryDone = blDone && deliveryObtained && !!deliveryDate && deliveryFile;
  statuses[FCL_IMPORT_STEP_NAMES.deliveryOrder] = !blDone
    ? "PENDING"
    : deliveryDone
      ? "DONE"
      : deliveryTouched
        ? "IN_PROGRESS"
        : "PENDING";

  const boeStep = input.stepsByName[FCL_IMPORT_STEP_NAMES.billOfEntry];
  const boeValues = boeStep?.values ?? {};
  const boeDate = getString(boeValues, "boe_date");
  const boeNumber = getString(boeValues, "boe_number");
  const boeFile = hasFile(boeStep, ["boe_file"], input.docTypes);
  const boeTouched = !!boeDate || !!boeNumber || boeFile;
  const boeReady = deliveryDone && (invoiceDone || optionA);
  const boeDone = boeReady && !!boeDate && !!boeNumber && boeFile;
  statuses[FCL_IMPORT_STEP_NAMES.billOfEntry] = !boeReady
    ? "PENDING"
    : boeDone
      ? "DONE"
      : boeTouched
        ? "IN_PROGRESS"
        : "PENDING";

  const pullOutStep = input.stepsByName[FCL_IMPORT_STEP_NAMES.containerPullOut];
  const pullOutRows = normalizeContainerRows(
    input.containerNumbers,
    pullOutStep?.values ?? {},
  );
  const pulledOutCount = pullOutRows.filter((row) => {
    return isTruthy(row.pulled_out) || !!row.pull_out_date?.trim();
  }).length;
  statuses[FCL_IMPORT_STEP_NAMES.containerPullOut] =
    !containerTotal || !trackingEnabled || !boeDone || dischargedCount === 0
      ? "PENDING"
      : pulledOutCount === 0
        ? "PENDING"
        : pulledOutCount >= containerTotal
          ? "DONE"
          : "IN_PROGRESS";

  const deliveryStepTracking = input.stepsByName[FCL_IMPORT_STEP_NAMES.containerDelivery];
  const deliveryRows = normalizeContainerRows(
    input.containerNumbers,
    deliveryStepTracking?.values ?? {},
  );
  const deliveredCount = deliveryRows.filter((row) => {
    return (
      isTruthy(row.delivered_offloaded) || !!row.delivered_offloaded_date?.trim()
    );
  }).length;
  statuses[FCL_IMPORT_STEP_NAMES.containerDelivery] =
    !containerTotal || !trackingEnabled
      ? "PENDING"
      : deliveredCount === 0
        ? "PENDING"
        : deliveredCount >= containerTotal
          ? "DONE"
          : "IN_PROGRESS";

  const tokenStep = input.stepsByName[FCL_IMPORT_STEP_NAMES.tokenBooking];
  const tokenRows = normalizeContainerRows(
    input.containerNumbers,
    tokenStep?.values ?? {},
  );
  const tokenComplete = tokenRows.filter((row, index) => {
    const hasDate = !!row.token_date?.trim();
    const file = hasFile(
      tokenStep,
      ["containers", String(index), "token_file"],
      input.docTypes,
    );
    return hasDate && file;
  }).length;
  statuses[FCL_IMPORT_STEP_NAMES.tokenBooking] = !boeDone || !containerTotal
    ? "PENDING"
    : tokenComplete === 0
      ? "PENDING"
      : tokenComplete >= containerTotal
        ? "DONE"
        : "IN_PROGRESS";

  const returnTokenStep = input.stepsByName[FCL_IMPORT_STEP_NAMES.returnTokenBooking];
  const returnRows = normalizeContainerRows(
    input.containerNumbers,
    returnTokenStep?.values ?? {},
  );
  const returnComplete = returnRows.filter((row, index) => {
    const hasDate = !!row.return_token_date?.trim();
    const file = hasFile(
      returnTokenStep,
      ["containers", String(index), "return_token_file"],
      input.docTypes,
    );
    return hasDate && file;
  }).length;
  statuses[FCL_IMPORT_STEP_NAMES.returnTokenBooking] = !containerTotal
    ? "PENDING"
    : returnComplete === 0
      ? "PENDING"
      : returnComplete >= containerTotal
        ? "DONE"
        : "IN_PROGRESS";

  return statuses;
}
