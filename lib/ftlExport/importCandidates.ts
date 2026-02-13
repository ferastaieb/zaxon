import "server-only";

import { tableName, scanAll } from "@/lib/db";
import { listShipmentsForUser, type ShipmentRow } from "@/lib/data/shipments";
import { listWorkflowTemplates } from "@/lib/data/workflows";
import { FCL_IMPORT_STEP_NAMES } from "@/lib/fclImport/constants";
import { isTruthy } from "@/lib/fclImport/helpers";
import { parseStepFieldValues } from "@/lib/stepFields";
import { FTL_EXPORT_STEP_NAMES } from "./constants";
import type { FtlImportCandidate } from "./importCandidateTypes";

type ShipmentStepLite = {
  id: number;
  shipment_id: number;
  name: string;
  status: "PENDING" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  field_values_json: string;
};

type ShipmentListLite = {
  id: number;
  shipment_code: string;
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

function findBoeNumber(steps: ShipmentStepLite[]) {
  const boeStep = steps.find((step) => step.name === FCL_IMPORT_STEP_NAMES.billOfEntry);
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

function isLikelyProcessedStepName(name: string) {
  const normalized = name.trim().toLowerCase();
  return (
    normalized.includes("bill of entry") ||
    normalized.includes("processed") ||
    normalized.includes("available")
  );
}

function normalizeImportTemplateName(name: string) {
  return name.trim().toLowerCase();
}

function buildAllocationMap(
  allSteps: ShipmentStepLite[],
  currentShipmentId: number,
) {
  const byShipmentId = new Map<number, { weight: number; quantity: number }>();
  const byReference = new Map<string, { weight: number; quantity: number }>();

  for (const step of allSteps) {
    if (step.shipment_id === currentShipmentId) continue;
    if (step.name !== FTL_EXPORT_STEP_NAMES.importShipmentSelection) continue;
    const values = parseStepFieldValues(step.field_values_json);
    const importRows = asArray(values.import_shipments);
    for (const row of importRows) {
      const sourceShipmentId = Number(toString(row.source_shipment_id) || "0");
      const reference = toString(row.import_shipment_reference).toUpperCase();
      const boe = toString(row.import_boe_number).toUpperCase();
      const quantity = toNumber(row.allocated_quantity);
      const weight = toNumber(row.allocated_weight);

      if (sourceShipmentId > 0) {
        const current = byShipmentId.get(sourceShipmentId) ?? { weight: 0, quantity: 0 };
        current.weight += weight;
        current.quantity += quantity;
        byShipmentId.set(sourceShipmentId, current);
        continue;
      }

      const fallbackKey = reference || boe;
      if (fallbackKey) {
        const current = byReference.get(fallbackKey) ?? { weight: 0, quantity: 0 };
        current.weight += weight;
        current.quantity += quantity;
        byReference.set(fallbackKey, current);
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

  const [shipments, templates, allSteps] = await Promise.all([
    scanAll<ShipmentRow>(tableName("shipments")),
    listWorkflowTemplates({ includeArchived: true }),
    scanAll<ShipmentStepLite>(tableName("shipment_steps")),
  ]);

  const templateNameById = new Map(
    templates.map((template) => [template.id, normalizeImportTemplateName(template.name)]),
  );
  const stepsByShipmentId = new Map<number, ShipmentStepLite[]>();
  for (const step of allSteps) {
    if (!stepsByShipmentId.has(step.shipment_id)) stepsByShipmentId.set(step.shipment_id, []);
    stepsByShipmentId.get(step.shipment_id)?.push(step);
  }
  const allocationMap = buildAllocationMap(allSteps, input.currentShipmentId);

  const candidates: FtlImportCandidate[] = [];
  for (const shipment of shipments) {
    if (shipment.id === input.currentShipmentId) continue;
    if (!visibleIds.has(shipment.id)) continue;

    const templateName = shipment.workflow_template_id
      ? templateNameById.get(shipment.workflow_template_id) ?? ""
      : "";
    const isImportTemplate = templateName.includes("import");
    if (!isImportTemplate) continue;

    const steps = stepsByShipmentId.get(shipment.id) ?? [];
    const boeNumber = findBoeNumber(steps);
    const fclSnapshot = computeFclStockSnapshot(steps);
    const importedWeight =
      fclSnapshot.totalWeight > 0 ? fclSnapshot.totalWeight : Number(shipment.weight_kg ?? 0);
    const importedQuantity =
      fclSnapshot.totalQuantity > 0
        ? fclSnapshot.totalQuantity
        : Number(shipment.packages_count ?? 0);
    const packageType = fclSnapshot.packageType || "";
    const cargoDescription = fclSnapshot.cargoDescription || shipment.cargo_description || "";
    const isFclImport =
      steps.some((step) => step.name === FCL_IMPORT_STEP_NAMES.containerDelivery) ||
      steps.some((step) => step.name === FCL_IMPORT_STEP_NAMES.containerPullOut);
    const processedAvailable =
      steps.some(
        (step) => step.name === FCL_IMPORT_STEP_NAMES.billOfEntry && step.status === "DONE",
      ) ||
      steps.some((step) => step.status === "DONE" && isLikelyProcessedStepName(step.name)) ||
      shipment.overall_status === "COMPLETED";
    const nonPhysicalStock = isFclImport ? !fclSnapshot.hasPhysicalRows : false;

    const sourceAllocation = allocationMap.byShipmentId.get(shipment.id) ?? {
      weight: 0,
      quantity: 0,
    };
    const referenceAllocation =
      allocationMap.byReference.get(shipment.shipment_code.toUpperCase()) ?? {
        weight: 0,
        quantity: 0,
      };
    const boeAllocation = boeNumber
      ? allocationMap.byReference.get(boeNumber.toUpperCase()) ?? {
          weight: 0,
          quantity: 0,
        }
      : { weight: 0, quantity: 0 };

    const alreadyAllocatedWeight =
      sourceAllocation.weight + referenceAllocation.weight + boeAllocation.weight;
    const alreadyAllocatedQuantity =
      sourceAllocation.quantity + referenceAllocation.quantity + boeAllocation.quantity;

    const meta = visibleById.get(shipment.id);
    candidates.push({
      shipmentId: shipment.id,
      shipmentCode: shipment.shipment_code,
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
      overallStatus: shipment.overall_status,
    });
  }

  return candidates.sort((a, b) => b.shipmentId - a.shipmentId);
}
