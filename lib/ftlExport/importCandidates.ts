import "server-only";

import { tableName, scanAll } from "@/lib/db";
import { listShipmentsForUser, type ShipmentRow } from "@/lib/data/shipments";
import { FCL_IMPORT_STEP_NAMES } from "@/lib/fclImport/constants";
import { isTruthy } from "@/lib/fclImport/helpers";
import { IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES } from "@/lib/importTransferOwnership/constants";
import { parseStepFieldValues } from "@/lib/stepFields";
import { FTL_EXPORT_STEP_NAMES } from "./constants";
import type {
  FtlImportAllocationHistoryRow,
  FtlImportCandidate,
} from "./importCandidateTypes";

type ShipmentStepLite = {
  id: number;
  shipment_id: number;
  name: string;
  status: "PENDING" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  field_values_json: string;
  updated_at?: string;
};

type ShipmentListLite = {
  id: number;
  shipment_code: string;
  job_ids: string | null;
  customer_names: string | null;
};

function asArray(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<Record<string, unknown>>;
  return value.filter((item) => !!item && typeof item === "object") as Array<Record<string, unknown>>;
}

function toString(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

type AllocationBucket = {
  weight: number;
  quantity: number;
  history: Map<string, FtlImportAllocationHistoryRow>;
};

function emptyAllocationBucket(): AllocationBucket {
  return {
    weight: 0,
    quantity: 0,
    history: new Map<string, FtlImportAllocationHistoryRow>(),
  };
}

function ensureAllocationBucket<K>(
  map: Map<K, AllocationBucket>,
  key: K,
) {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = emptyAllocationBucket();
    map.set(key, bucket);
  }
  return bucket;
}

function addAllocationToBucket(
  bucket: AllocationBucket,
  entry: FtlImportAllocationHistoryRow,
) {
  bucket.weight += entry.allocatedWeight;
  bucket.quantity += entry.allocatedQuantity;
  if (entry.allocatedWeight <= 0 && entry.allocatedQuantity <= 0) return;
  const historyKey =
    entry.exportShipmentId > 0
      ? `shipment:${entry.exportShipmentId}`
      : `legacy:${entry.exportShipmentCode}:${entry.exportDate}`;
  const current = bucket.history.get(historyKey);
  if (current) {
    current.allocatedWeight += entry.allocatedWeight;
    current.allocatedQuantity += entry.allocatedQuantity;
    if (!current.exportDate && entry.exportDate) {
      current.exportDate = entry.exportDate;
    }
    return;
  }
  bucket.history.set(historyKey, { ...entry });
}

function mergeAllocationHistories(
  buckets: Array<AllocationBucket | undefined>,
): FtlImportAllocationHistoryRow[] {
  const merged = new Map<string, FtlImportAllocationHistoryRow>();
  for (const bucket of buckets) {
    if (!bucket) continue;
    for (const entry of bucket.history.values()) {
      const key =
        entry.exportShipmentId > 0
          ? `shipment:${entry.exportShipmentId}`
          : `legacy:${entry.exportShipmentCode}:${entry.exportDate}`;
      const current = merged.get(key);
      if (current) {
        current.allocatedWeight += entry.allocatedWeight;
        current.allocatedQuantity += entry.allocatedQuantity;
        continue;
      }
      merged.set(key, { ...entry });
    }
  }
  return Array.from(merged.values()).sort((a, b) => {
    const left = a.exportDate || "";
    const right = b.exportDate || "";
    if (left && right && left !== right) return left.localeCompare(right);
    if (left && !right) return -1;
    if (!left && right) return 1;
    return a.exportShipmentCode.localeCompare(b.exportShipmentCode);
  });
}

function findBoeNumber(steps: ShipmentStepLite[]) {
  const boeStep = steps.find((step) => step.name === FCL_IMPORT_STEP_NAMES.billOfEntry);
  if (!boeStep) return "";
  const values = parseStepFieldValues(boeStep.field_values_json);
  return toString(values.boe_number);
}

function findImportTransferBoeNumber(steps: ShipmentStepLite[]) {
  const boeStep = steps.find(
    (step) => step.name === IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.documentsBoe,
  );
  if (!boeStep) return "";
  const values = parseStepFieldValues(boeStep.field_values_json);
  return toString(values.boe_number);
}

function computeFclStockSnapshot(steps: ShipmentStepLite[]) {
  const pullOutStep = steps.find((step) => step.name === FCL_IMPORT_STEP_NAMES.containerPullOut);
  const deliveryStep = steps.find((step) => step.name === FCL_IMPORT_STEP_NAMES.containerDelivery);
  if (!deliveryStep) {
    return {
      totalWeight: 0,
      totalQuantity: 0,
      packageType: "",
      cargoDescription: "",
      hasPhysicalRows: false,
    };
  }

  const pullOutValues = parseStepFieldValues(pullOutStep?.field_values_json ?? "{}");
  const deliveryValues = parseStepFieldValues(deliveryStep.field_values_json);
  const pullOutRows = asArray(pullOutValues.containers);
  const deliveryRows = asArray(deliveryValues.containers);
  const pullOutByContainer = new Map<string, Record<string, unknown>>();
  for (const row of pullOutRows) {
    const number = toString(row.container_number);
    if (number) pullOutByContainer.set(number, row);
  }

  let totalWeight = 0;
  let totalQuantity = 0;
  let packageType = "";
  let cargoDescription = "";
  let hasPhysicalRows = false;
  for (const row of deliveryRows) {
    const number = toString(row.container_number);
    const pullOut = pullOutByContainer.get(number);
    const enabled = isTruthy(pullOut?.stock_tracking_enabled);
    const rowWeight = toNumber(row.total_weight_kg);
    const rowQuantity = toNumber(row.total_packages);
    const rowPackageType = toString(row.package_type);
    const rowCargoDescription = toString(row.cargo_description);
    const hasAnyRowData =
      rowWeight > 0 || rowQuantity > 0 || !!rowPackageType || !!rowCargoDescription;
    if (!enabled && !hasAnyRowData) continue;

    hasPhysicalRows = true;
    totalWeight += rowWeight;
    totalQuantity += rowQuantity;
    if (!packageType && rowPackageType) packageType = rowPackageType;
    if (!cargoDescription && rowCargoDescription) cargoDescription = rowCargoDescription;
  }

  return { totalWeight, totalQuantity, packageType, cargoDescription, hasPhysicalRows };
}

function computeImportTransferStockSnapshot(steps: ShipmentStepLite[]) {
  const partiesStep = steps.find(
    (step) => step.name === IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.partiesCargo,
  );
  const docsStep = steps.find(
    (step) => step.name === IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.documentsBoe,
  );
  const collectionStep = steps.find(
    (step) => step.name === IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.collectionOutcome,
  );
  if (!partiesStep) {
    return {
      totalWeight: 0,
      totalQuantity: 0,
      packageType: "",
      cargoDescription: "",
      processedAvailable: false,
      nonPhysicalStock: true,
    };
  }

  const partiesValues = parseStepFieldValues(partiesStep.field_values_json);
  const collectionValues = parseStepFieldValues(collectionStep?.field_values_json ?? "{}");
  const outcomeType = toString(collectionValues.outcome_type).toUpperCase();
  const deliveredToWarehouse =
    isTruthy(collectionValues.cargo_delivered_to_zaxon) &&
    !!toString(collectionValues.dropoff_date);
  const boeDone = docsStep?.status === "DONE";
  const nonPhysicalStock = !boeDone
    ? true
    : outcomeType === "DELIVER_TO_ZAXON_WAREHOUSE"
      ? !deliveredToWarehouse
      : true;

  return {
    totalWeight: toNumber(partiesValues.total_weight),
    totalQuantity: toNumber(partiesValues.quantity),
    packageType: toString(partiesValues.package_type),
    cargoDescription: toString(partiesValues.cargo_description),
    processedAvailable: boeDone,
    nonPhysicalStock,
  };
}

function isLikelyProcessedStepName(name: string) {
  const normalized = name.trim().toLowerCase();
  return (
    normalized.includes("bill of entry") ||
    normalized.includes("processed") ||
    normalized.includes("available") ||
    normalized.includes("documents and boe")
  );
}

function buildAllocationMap(
  allSteps: ShipmentStepLite[],
  shipmentMetaById: Map<number, { shipmentCode: string; exportDate: string }>,
  currentShipmentId: number,
) {
  const byShipmentId = new Map<number, AllocationBucket>();
  const byReference = new Map<string, AllocationBucket>();

  for (const step of allSteps) {
    if (step.shipment_id === currentShipmentId) continue;
    if (step.name !== FTL_EXPORT_STEP_NAMES.importShipmentSelection) continue;
    const values = parseStepFieldValues(step.field_values_json);
    const importRows = asArray(values.import_shipments);
    const exportMeta = shipmentMetaById.get(step.shipment_id);
    for (const row of importRows) {
      const sourceShipmentId = Number(toString(row.source_shipment_id) || "0");
      const reference = toString(row.import_shipment_reference).toUpperCase();
      const boe = toString(row.import_boe_number).toUpperCase();
      const quantity = toNumber(row.allocated_quantity);
      const weight = toNumber(row.allocated_weight);
      const historyRow: FtlImportAllocationHistoryRow = {
        exportShipmentId: step.shipment_id,
        exportShipmentCode:
          exportMeta?.shipmentCode ||
          `SHP-${String(step.shipment_id).padStart(6, "0")}`,
        exportDate: exportMeta?.exportDate || step.updated_at || "",
        allocatedWeight: weight,
        allocatedQuantity: quantity,
      };

      if (sourceShipmentId > 0) {
        const bucket = ensureAllocationBucket(byShipmentId, sourceShipmentId);
        addAllocationToBucket(bucket, historyRow);
        continue;
      }

      const fallbackKey = reference || boe;
      if (fallbackKey) {
        const bucket = ensureAllocationBucket(byReference, fallbackKey);
        addAllocationToBucket(bucket, historyRow);
      }
    }
  }

  return { byShipmentId, byReference };
}

export async function listFtlImportCandidates(input: {
  userId: number;
  role: string;
  currentShipmentId: number;
}) {
  const visibleShipments = (await listShipmentsForUser({
    userId: input.userId,
    role: input.role,
  })) as ShipmentListLite[];
  const visibleIds = new Set(visibleShipments.map((row) => row.id));
  const visibleById = new Map(visibleShipments.map((row) => [row.id, row]));

  const [shipments, allSteps] = await Promise.all([
    scanAll<ShipmentRow>(tableName("shipments")),
    scanAll<ShipmentStepLite>(tableName("shipment_steps")),
  ]);
  const shipmentMetaById = new Map(
    shipments.map((shipment) => [
      shipment.id,
      {
        shipmentCode: shipment.shipment_code,
        exportDate: shipment.last_update_at || shipment.created_at || "",
      },
    ]),
  );

  const stepsByShipmentId = new Map<number, ShipmentStepLite[]>();
  for (const step of allSteps) {
    if (!stepsByShipmentId.has(step.shipment_id)) stepsByShipmentId.set(step.shipment_id, []);
    stepsByShipmentId.get(step.shipment_id)?.push(step);
  }
  const allocationMap = buildAllocationMap(
    allSteps,
    shipmentMetaById,
    input.currentShipmentId,
  );

  const candidates: FtlImportCandidate[] = [];
  for (const shipment of shipments) {
    if (shipment.id === input.currentShipmentId) continue;
    if (!visibleIds.has(shipment.id)) continue;

    const steps = stepsByShipmentId.get(shipment.id) ?? [];
    const isImportTransferWorkflow = steps.some(
      (step) => step.name === IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.partiesCargo,
    );
    const isFclWorkflow = steps.some(
      (step) =>
        step.name === FCL_IMPORT_STEP_NAMES.shipmentCreation ||
        step.name === FCL_IMPORT_STEP_NAMES.billOfEntry ||
        step.name === FCL_IMPORT_STEP_NAMES.containerPullOut ||
        step.name === FCL_IMPORT_STEP_NAMES.containerDelivery,
    );
    if (!isImportTransferWorkflow && !isFclWorkflow) continue;

    const boeNumber = isImportTransferWorkflow
      ? findImportTransferBoeNumber(steps)
      : findBoeNumber(steps);
    const fclSnapshot = computeFclStockSnapshot(steps);
    const importTransferSnapshot = computeImportTransferStockSnapshot(steps);
    const importedWeight = isImportTransferWorkflow
      ? importTransferSnapshot.totalWeight > 0
        ? importTransferSnapshot.totalWeight
        : Number(shipment.weight_kg ?? 0)
      : fclSnapshot.totalWeight > 0
        ? fclSnapshot.totalWeight
        : Number(shipment.weight_kg ?? 0);
    const importedQuantity = isImportTransferWorkflow
      ? importTransferSnapshot.totalQuantity > 0
        ? importTransferSnapshot.totalQuantity
        : Number(shipment.packages_count ?? 0)
      : fclSnapshot.totalQuantity > 0
        ? fclSnapshot.totalQuantity
        : Number(shipment.packages_count ?? 0);
    const packageType = isImportTransferWorkflow
      ? importTransferSnapshot.packageType || ""
      : fclSnapshot.packageType || "";
    const cargoDescription = isImportTransferWorkflow
      ? importTransferSnapshot.cargoDescription || shipment.cargo_description || ""
      : fclSnapshot.cargoDescription || shipment.cargo_description || "";
    const isFclImport = isFclWorkflow;
    const processedAvailable =
      (isImportTransferWorkflow
        ? importTransferSnapshot.processedAvailable
        : steps.some(
            (step) => step.name === FCL_IMPORT_STEP_NAMES.billOfEntry && step.status === "DONE",
          )) ||
      steps.some((step) => step.status === "DONE" && isLikelyProcessedStepName(step.name)) ||
      shipment.overall_status === "COMPLETED";
    const nonPhysicalStock = isImportTransferWorkflow
      ? importTransferSnapshot.nonPhysicalStock
      : isFclImport
        ? !fclSnapshot.hasPhysicalRows
        : false;

    const sourceAllocation = allocationMap.byShipmentId.get(shipment.id);
    const referenceAllocation = allocationMap.byReference.get(
      shipment.shipment_code.toUpperCase(),
    );
    const boeAllocation = boeNumber
      ? allocationMap.byReference.get(boeNumber.toUpperCase())
      : undefined;
    const allocationBuckets = [sourceAllocation, referenceAllocation, boeAllocation]
      .filter((bucket): bucket is AllocationBucket => !!bucket)
      .filter((bucket, index, list) => list.indexOf(bucket) === index);

    const alreadyAllocatedWeight = allocationBuckets.reduce(
      (total, bucket) => total + bucket.weight,
      0,
    );
    const alreadyAllocatedQuantity = allocationBuckets.reduce(
      (total, bucket) => total + bucket.quantity,
      0,
    );
    const allocationHistory = mergeAllocationHistories(allocationBuckets);

    const meta = visibleById.get(shipment.id);
    candidates.push({
      shipmentId: shipment.id,
      shipmentCode: shipment.shipment_code,
      jobIds: meta?.job_ids ?? "",
      clientNumber: meta?.customer_names ?? "",
      importBoeNumber: boeNumber,
      processedAvailable,
      nonPhysicalStock,
      importedWeight,
      importedQuantity,
      packageType,
      cargoDescription,
      alreadyAllocatedWeight,
      alreadyAllocatedQuantity,
      remainingWeight: importedWeight - alreadyAllocatedWeight,
      remainingQuantity: importedQuantity - alreadyAllocatedQuantity,
      allocationHistory,
      overallStatus: shipment.overall_status,
    });
  }

  return candidates.sort((a, b) => b.shipmentId - a.shipmentId);
}
