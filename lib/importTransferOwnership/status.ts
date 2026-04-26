import type { StepStatus } from "@/lib/domain";
import { encodeFieldPath, stepFieldDocType } from "@/lib/stepFields";
import {
  IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES,
  type ImportTransferStockType,
} from "./constants";
import {
  computeImportTransferStockType,
  getNumber,
  hasAnyValue,
  isTruthy,
  parseCollectionOutcome,
  parsePartiesCargo,
  parseDocumentsBoe,
  parseVehicleRows,
  toRecord,
  normalizeOutcomeType,
} from "./helpers";

type StepSnapshot = {
  id: number;
  values: Record<string, unknown>;
};

type StatusInput = {
  stepsByName: Record<string, StepSnapshot | undefined>;
  docTypes: Set<string>;
  hasJobNumber?: boolean;
};

export type ImportTransferOwnershipStatusResult = {
  statuses: Record<string, StepStatus>;
  docsDone: boolean;
  boeDone: boolean;
  collectionDone: boolean;
  stockType: ImportTransferStockType;
  pendingCollection: boolean;
  pendingCollectionReasonMissing: boolean;
  jobNumberMissing: boolean;
  importedQuantity: number;
  importedWeight: number;
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

export function computeImportTransferOwnershipStatuses(
  input: StatusInput,
): ImportTransferOwnershipStatusResult {
  const statuses: Record<string, StepStatus> = {};

  const overviewStep = input.stepsByName[IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.overview];
  const overviewValues = toRecord(overviewStep?.values ?? {});
  const requestReceived = isTruthy(overviewValues.request_received);
  const requestReceivedDate =
    typeof overviewValues.request_received_date === "string"
      ? overviewValues.request_received_date.trim()
      : "";
  const hasJobNumber = !!input.hasJobNumber;
  const overviewTouched = hasAnyValue(overviewValues);
  statuses[IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.overview] = statusByDoneAndTouched(
    requestReceived && !!requestReceivedDate && hasJobNumber,
    overviewTouched || hasJobNumber,
  );

  const partiesStep = input.stepsByName[IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.partiesCargo];
  const partiesValues = toRecord(partiesStep?.values ?? {});
  const parties = parsePartiesCargo(partiesValues);
  const partiesDone =
    !!parties.supplier_company_name &&
    !!parties.supplier_location &&
    !!parties.supplier_contact_person &&
    !!parties.package_type &&
    getNumber(parties.quantity) > 0 &&
    getNumber(parties.total_weight) > 0;
  const partiesTouched = hasAnyValue(partiesValues);
  statuses[IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.partiesCargo] = statusByDoneAndTouched(
    partiesDone,
    partiesTouched,
  );

  const documentsStep = input.stepsByName[IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.documentsBoe];
  const documentsValues = toRecord(documentsStep?.values ?? {});
  const boe = parseDocumentsBoe(documentsValues);
  const bundleDocsDone =
    boe.single_documents_bundle &&
    hasFile(documentsStep, ["single_documents_bundle_upload"], input.docTypes);
  const mandatoryDocsDone =
    bundleDocsDone ||
    (hasFile(documentsStep, ["transfer_ownership_letter"], input.docTypes) &&
      hasFile(documentsStep, ["delivery_advice"], input.docTypes) &&
      hasFile(documentsStep, ["commercial_invoice"], input.docTypes));
  const boeDone =
    !!boe.boe_prepared_by &&
    !!boe.boe_number &&
    !!boe.boe_date &&
    hasFile(documentsStep, ["boe_upload"], input.docTypes);
  const docsTouched =
    hasAnyValue(documentsValues) ||
    hasFile(documentsStep, ["transfer_ownership_letter"], input.docTypes) ||
    hasFile(documentsStep, ["delivery_advice"], input.docTypes) ||
    hasFile(documentsStep, ["commercial_invoice"], input.docTypes) ||
    hasFile(documentsStep, ["packing_list"], input.docTypes) ||
    hasFile(documentsStep, ["single_documents_bundle_upload"], input.docTypes) ||
    hasFile(documentsStep, ["boe_upload"], input.docTypes);
  statuses[IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.documentsBoe] = statusByDoneAndTouched(
    mandatoryDocsDone && boeDone,
    docsTouched,
  );

  const collectionStep =
    input.stepsByName[IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.collectionOutcome];
  const collectionValues = toRecord(collectionStep?.values ?? {});
  const collection = parseCollectionOutcome(collectionValues);
  const vehicleRows = parseVehicleRows(collectionValues);
  const normalizedOutcome = normalizeOutcomeType(collection.outcome_type);
  const planReady = !!normalizedOutcome && !!collection.collection_performed_by;
  const vehicleRowsWithData = vehicleRows.filter(
    (row) =>
      !!row.trailer_type ||
      row.truck_count > 0 ||
      !!row.truck_number ||
      row.truck_loaded ||
      !!row.truck_loaded_date,
  );
  const vehiclesValid = vehicleRowsWithData.every(
    (row) =>
      !!row.trailer_type &&
      (normalizedOutcome !== "DIRECT_EXPORT" || !!row.truck_number),
  );
  const directExportUsesTruckRows = vehicleRowsWithData.some(
    (row) =>
      !!row.truck_number ||
      row.truck_loaded ||
      !!row.truck_loaded_date ||
      !!row.trailer_type,
  );
  const directExportLoaded =
    directExportUsesTruckRows &&
    vehicleRowsWithData.length > 0 &&
    vehicleRowsWithData.every((row) => row.truck_loaded && !!row.truck_loaded_date);

  const caseAComplete =
    normalizedOutcome === "DELIVER_TO_ZAXON_WAREHOUSE" &&
    collection.cargo_delivered_to_zaxon &&
    !!collection.dropoff_date;
  const caseBComplete =
    normalizedOutcome === "DIRECT_EXPORT" &&
    (directExportUsesTruckRows
      ? directExportLoaded
      : collection.collected_by_export_truck && !!collection.direct_export_date);
  const collectionDone = boeDone && planReady && vehiclesValid && (caseAComplete || caseBComplete);
  const pendingCollection =
    normalizedOutcome === "DELIVER_TO_ZAXON_WAREHOUSE" && !caseAComplete;
  const pendingCollectionReasonMissing =
    pendingCollection && !collection.pending_reason;
  const collectionTouched = hasAnyValue(collectionValues);
  statuses[IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.collectionOutcome] =
    statusByDoneAndTouched(
      collectionDone,
      collectionTouched || !!normalizedOutcome || vehicleRowsWithData.length > 0,
    );

  const stockStep = input.stepsByName[IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.stockView];
  const stockTouched = hasAnyValue(stockStep?.values ?? {});
  statuses[IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.stockView] = collectionDone
    ? "DONE"
    : stockTouched || boeDone
      ? "IN_PROGRESS"
      : "PENDING";

  const stockType = computeImportTransferStockType({
    boeDone,
    outcomeType: collection.outcome_type,
    deliveredToWarehouse: collection.cargo_delivered_to_zaxon && !!collection.dropoff_date,
  });

  return {
    statuses,
    docsDone: mandatoryDocsDone,
    boeDone,
    collectionDone,
    stockType,
    pendingCollection,
    pendingCollectionReasonMissing,
    jobNumberMissing: !hasJobNumber,
    importedQuantity: parties.quantity,
    importedWeight: parties.total_weight,
  };
}
