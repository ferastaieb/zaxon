
"use server";

import { redirect } from "next/navigation";

import { assertCanWrite, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data/activities";
import { addDocument, listDocuments } from "@/lib/data/documents";
import { listParties } from "@/lib/data/parties";
import { createShipmentLink } from "@/lib/data/shipmentLinks";
import {
  createShipment,
  getShipment,
  listShipmentSteps,
  listSubshipmentsForMaster,
  type MasterSubshipmentRow,
  type ShipmentStepRow,
} from "@/lib/data/shipments";
import { updateShipmentStep } from "@/lib/data/steps";
import type { StepStatus } from "@/lib/domain";
import { nowIso } from "@/lib/db";
import { listFtlImportCandidates } from "@/lib/ftlExport/importCandidates";
import type { FtlImportCandidate } from "@/lib/ftlExport/importCandidateTypes";
import {
  LTL_MASTER_JAFZA_SYRIA_SERVICE_TYPE,
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES,
  LTL_SUBSHIPMENT_HANDOVER_METHODS,
  LTL_SUBSHIPMENT_STEP_NAMES,
} from "@/lib/ltlMasterJafzaSyria/constants";
import {
  getNumber,
  getString,
  parseMasterWarehouse,
  parseSubshipmentImportRows,
  parseSubshipmentLoading,
  parseSubshipmentHandover,
  toRecord,
} from "@/lib/ltlMasterJafzaSyria/helpers";
import {
  computeLtlMasterStatuses,
  computeLtlSubshipmentStatuses,
} from "@/lib/ltlMasterJafzaSyria/status";
import { ensureLtlSubshipmentTemplate } from "@/lib/ltlMasterJafzaSyria/template";
import { requireShipmentAccess } from "@/lib/permissions";
import { refreshShipmentDerivedState } from "@/lib/services/shipmentDerived";
import { saveUpload } from "@/lib/storage";
import {
  applyStepFieldRemovals,
  applyStepFieldUpdates,
  encodeFieldPath,
  extractStepFieldRemovals,
  extractStepFieldUpdates,
  extractStepFieldUploads,
  parseStepFieldValues,
  stepFieldDocType,
} from "@/lib/stepFields";

type StepLite = Pick<
  ShipmentStepRow,
  "id" | "shipment_id" | "name" | "status" | "notes" | "field_values_json" | "is_external"
>;

type SubshipmentRuntime = {
  shipment: MasterSubshipmentRow;
  steps: StepLite[];
  stepByName: Record<string, { id: number; values: Record<string, unknown> } | undefined>;
  docTypes: Set<string>;
  computed: ReturnType<typeof computeLtlSubshipmentStatuses>;
};

type MasterRuntime = {
  masterSteps: StepLite[];
  masterStepByName: Record<string, { id: number; values: Record<string, unknown> } | undefined>;
  masterDocTypes: Set<string>;
  subshipments: SubshipmentRuntime[];
};

type DraftImportRow = {
  sourceShipmentId: string;
  allocatedWeight: number;
  allocatedQuantity: number;
};

function appendParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function buildReturnBase(masterShipmentId: number, returnToRaw: FormDataEntryValue | null) {
  const fallback = `/shipments/master/${masterShipmentId}`;
  if (typeof returnToRaw !== "string") return fallback;
  const trimmed = returnToRaw.trim();
  if (!trimmed.startsWith(fallback)) return fallback;
  return trimmed;
}

function toStepValues(step: StepLite): Record<string, unknown> {
  return toRecord(parseStepFieldValues(step.field_values_json));
}

function buildStepByName(
  steps: StepLite[],
  override?: { stepId: number; values: Record<string, unknown> },
) {
  const out: Record<string, { id: number; values: Record<string, unknown> } | undefined> = {};
  for (const step of steps) {
    out[step.name] = {
      id: step.id,
      values: step.id === override?.stepId ? override.values : toStepValues(step),
    };
  }
  return out;
}

function parseDraftImportRows(raw: string): DraftImportRow[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        const sourceShipmentId = getString((row as Record<string, unknown>)?.sourceShipmentId);
        const allocatedWeight = getNumber((row as Record<string, unknown>)?.allocatedWeight);
        const allocatedQuantity = getNumber((row as Record<string, unknown>)?.allocatedQuantity);
        return {
          sourceShipmentId,
          allocatedWeight,
          allocatedQuantity,
        };
      })
      .filter((row) => row.sourceShipmentId);
  } catch {
    return [];
  }
}

function isTrackingStep(name: string) {
  return (
    name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingUae ||
    name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingKsa ||
    name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingJordan ||
    name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingSyria
  );
}

function hasTrackingAgentPrerequisite(
  stepName: string,
  agentsValues: Record<string, unknown>,
  touchedFieldKeys: Set<string>,
) {
  const hasPrefix = (prefix: string) => {
    for (const key of touchedFieldKeys) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  };

  if (stepName === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingUae) {
    const requiresJebel = hasPrefix("jebel_ali_");
    const requiresSila = hasPrefix("sila_");
    const jebelReady = !!getString(agentsValues.jebel_ali_agent_name);
    const silaReady = !!getString(agentsValues.sila_agent_name);
    return (!requiresJebel || jebelReady) && (!requiresSila || silaReady);
  }
  if (stepName === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingKsa) {
    const requiresBatha = hasPrefix("batha_");
    return !requiresBatha || !!getString(agentsValues.batha_agent_name);
  }
  if (stepName === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingJordan) {
    const requiresOmari = hasPrefix("omari_");
    return !requiresOmari || !!getString(agentsValues.omari_agent_name);
  }
  if (stepName === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingSyria) {
    if (!hasPrefix("syria_")) return true;
    return !!getString(agentsValues.naseeb_agent_name);
  }
  return true;
}

async function ensureMasterShipment(shipmentId: number) {
  const shipment = await getShipment(shipmentId);
  if (!shipment || shipment.shipment_kind !== "MASTER") {
    return null;
  }
  return shipment;
}

async function loadSubshipmentRuntime(subshipment: MasterSubshipmentRow): Promise<SubshipmentRuntime> {
  const [steps, docs] = await Promise.all([
    listShipmentSteps(subshipment.id),
    listDocuments(subshipment.id),
  ]);
  const liteSteps: StepLite[] = steps.map((step) => ({
    id: step.id,
    shipment_id: step.shipment_id,
    name: step.name,
    status: step.status,
    notes: step.notes,
    field_values_json: step.field_values_json,
    is_external: step.is_external,
  }));

  const docTypes = new Set(
    docs
      .filter((doc) => doc.is_received)
      .map((doc) => String(doc.document_type)),
  );

  const stepByName = buildStepByName(liteSteps);
  const computed = computeLtlSubshipmentStatuses({
    stepsByName: stepByName,
    docTypes,
  });

  return {
    shipment: subshipment,
    steps: liteSteps,
    stepByName,
    docTypes,
    computed,
  };
}

async function loadMasterRuntime(input: {
  masterShipmentId: number;
  masterStepOverride?: { stepId: number; values: Record<string, unknown> };
}) {
  const [masterStepsRaw, masterDocs, subshipments] = await Promise.all([
    listShipmentSteps(input.masterShipmentId),
    listDocuments(input.masterShipmentId),
    listSubshipmentsForMaster(input.masterShipmentId),
  ]);

  const masterSteps: StepLite[] = masterStepsRaw.map((step) => ({
    id: step.id,
    shipment_id: step.shipment_id,
    name: step.name,
    status: step.status,
    notes: step.notes,
    field_values_json: step.field_values_json,
    is_external: step.is_external,
  }));
  const masterDocTypes = new Set(
    masterDocs
      .filter((doc) => doc.is_received)
      .map((doc) => String(doc.document_type)),
  );

  const subshipmentsRuntime = await Promise.all(
    subshipments.map(async (subshipment) => await loadSubshipmentRuntime(subshipment)),
  );

  const masterStepByName = buildStepByName(masterSteps, input.masterStepOverride);

  return {
    masterSteps,
    masterStepByName,
    masterDocTypes,
    subshipments: subshipmentsRuntime,
  } as MasterRuntime;
}
async function syncStepStatuses(steps: StepLite[], statuses: Record<string, StepStatus>) {
  for (const step of steps) {
    const nextStatus = statuses[step.name];
    if (!nextStatus || nextStatus === step.status) continue;
    await updateShipmentStep({
      stepId: step.id,
      status: nextStatus,
    });
  }
}

async function syncMasterStatuses(input: {
  masterShipmentId: number;
  masterStepOverride?: { stepId: number; values: Record<string, unknown> };
}) {
  const runtime = await loadMasterRuntime(input);
  const computed = computeLtlMasterStatuses({
    stepsByName: runtime.masterStepByName,
    docTypes: runtime.masterDocTypes,
    subshipments: runtime.subshipments.map((sub) => sub.computed),
  });
  await syncStepStatuses(runtime.masterSteps, computed.statuses);
  return { runtime, computed };
}

async function syncSingleSubshipmentStatuses(input: {
  subshipmentId: number;
  stepOverride?: { stepId: number; values: Record<string, unknown> };
}) {
  const [stepsRaw, docs] = await Promise.all([
    listShipmentSteps(input.subshipmentId),
    listDocuments(input.subshipmentId),
  ]);
  const steps: StepLite[] = stepsRaw.map((step) => ({
    id: step.id,
    shipment_id: step.shipment_id,
    name: step.name,
    status: step.status,
    notes: step.notes,
    field_values_json: step.field_values_json,
    is_external: step.is_external,
  }));

  const docTypes = new Set(
    docs
      .filter((doc) => doc.is_received)
      .map((doc) => String(doc.document_type)),
  );
  const stepByName = buildStepByName(steps, input.stepOverride);
  const computed = computeLtlSubshipmentStatuses({
    stepsByName: stepByName,
    docTypes,
  });
  await syncStepStatuses(steps, computed.statuses);
  return { steps, computed };
}

function normalizeNaseebZaxonOnly(values: Record<string, unknown>) {
  return {
    ...values,
    naseeb_clearance_mode: "ZAXON",
    naseeb_client_final_choice: "",
  };
}

function normalizeTrackingSyriaMode(values: Record<string, unknown>) {
  return {
    ...values,
    syria_clearance_mode: "ZAXON",
  };
}

async function uploadStepFiles(input: {
  shipmentId: number;
  stepId: number;
  isExternal: boolean;
  formData: FormData;
  actorUserId: number;
}) {
  const uploads = extractStepFieldUploads(input.formData).map((upload) => ({
    file: upload.file,
    documentType: stepFieldDocType(input.stepId, encodeFieldPath(upload.path)),
  }));

  for (const upload of uploads) {
    const saved = await saveUpload({
      shipmentId: input.shipmentId,
      file: upload.file,
      filePrefix: upload.documentType,
    });

    const docId = await addDocument({
      shipmentId: input.shipmentId,
      documentType: upload.documentType,
      fileName: saved.fileName,
      storagePath: saved.storagePath,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      isRequired: false,
      isReceived: true,
      shareWithCustomer: input.isExternal,
      source: "STAFF",
      uploadedByUserId: input.actorUserId,
    });

    await logActivity({
      shipmentId: input.shipmentId,
      type: "DOCUMENT_UPLOADED",
      message: `Field document uploaded: ${upload.documentType}`,
      actorUserId: input.actorUserId,
      data: { docId, stepId: input.stepId, documentType: upload.documentType },
    });
  }
}

async function buildImportCandidateMapForMaster(input: {
  masterShipmentId: number;
  userId: number;
  role: string;
  excludeSubshipmentId?: number;
}) {
  const [candidates, subshipments] = await Promise.all([
    listFtlImportCandidates({
      userId: input.userId,
      role: input.role,
      currentShipmentId: input.masterShipmentId,
    }),
    listSubshipmentsForMaster(input.masterShipmentId),
  ]);

  const allocationBySource = new Map<string, { weight: number; quantity: number }>();

  const subshipmentDetailsSteps = await Promise.all(
    subshipments
      .filter((subshipment) => subshipment.id !== input.excludeSubshipmentId)
      .map(async (subshipment) => {
        const steps = await listShipmentSteps(subshipment.id);
        return steps.find((step) => step.name === LTL_SUBSHIPMENT_STEP_NAMES.detailsAndImports);
      }),
  );

  for (const detailsStep of subshipmentDetailsSteps) {
    if (!detailsStep) continue;
    const values = toRecord(parseStepFieldValues(detailsStep.field_values_json));
    const importRows = parseSubshipmentImportRows(values);
    for (const row of importRows) {
      const sourceId = row.source_shipment_id.trim();
      if (!sourceId) continue;
      const current = allocationBySource.get(sourceId) ?? { weight: 0, quantity: 0 };
      current.weight += row.allocated_weight;
      current.quantity += row.allocated_quantity;
      allocationBySource.set(sourceId, current);
    }
  }

  const map = new Map<
    string,
    {
      candidate: FtlImportCandidate;
      effectiveAlreadyAllocatedWeight: number;
      effectiveAlreadyAllocatedQuantity: number;
      effectiveRemainingWeight: number;
      effectiveRemainingQuantity: number;
    }
  >();

  for (const candidate of candidates) {
    const sourceId = String(candidate.shipmentId);
    const extra = allocationBySource.get(sourceId) ?? { weight: 0, quantity: 0 };
    const effectiveAlreadyAllocatedWeight = candidate.alreadyAllocatedWeight + extra.weight;
    const effectiveAlreadyAllocatedQuantity =
      candidate.alreadyAllocatedQuantity + extra.quantity;
    const effectiveRemainingWeight = candidate.importedWeight - effectiveAlreadyAllocatedWeight;
    const effectiveRemainingQuantity =
      candidate.importedQuantity - effectiveAlreadyAllocatedQuantity;

    map.set(sourceId, {
      candidate,
      effectiveAlreadyAllocatedWeight,
      effectiveAlreadyAllocatedQuantity,
      effectiveRemainingWeight,
      effectiveRemainingQuantity,
    });
  }

  return map;
}

export async function updateMasterStepAction(masterShipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, masterShipmentId);

  const master = await ensureMasterShipment(masterShipmentId);
  if (!master) redirect("/shipments");

  const returnBase = buildReturnBase(masterShipmentId, formData.get("returnTo"));
  const stepId = Number(formData.get("stepId") ?? 0);
  if (!stepId) {
    redirect(appendParam(returnBase, "error", "invalid"));
  }

  const steps = await listShipmentSteps(masterShipmentId);
  const step = steps.find((entry) => entry.id === stepId);
  if (!step) {
    redirect(appendParam(returnBase, "error", "invalid"));
  }

  const existingValues = parseStepFieldValues(step.field_values_json);
  const fieldUpdates = extractStepFieldUpdates(formData);
  const fieldRemovals = extractStepFieldRemovals(formData);
  const touchedFieldKeys = new Set(
    fieldUpdates.map((update) => (update.path.length ? update.path[0] : "")),
  );

  let mergedValues = applyStepFieldUpdates(existingValues, fieldUpdates);
  mergedValues = applyStepFieldRemovals(mergedValues, fieldRemovals);
  let mergedRecord = toRecord(mergedValues);

  if (step.name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.shipmentCreation) {
    mergedRecord = {
      ...mergedRecord,
      service_type: LTL_MASTER_JAFZA_SYRIA_SERVICE_TYPE,
    };
  }

  if (step.name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.customsAgentsAllocation) {
    mergedRecord = normalizeNaseebZaxonOnly(mergedRecord);
  }

  if (step.name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingSyria) {
    mergedRecord = normalizeTrackingSyriaMode(mergedRecord);
  }

  const finalizeInvoice = String(formData.get("finalizeInvoice") ?? "").trim() === "1";
  if (step.name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.exportInvoice && finalizeInvoice) {
    mergedRecord = {
      ...mergedRecord,
      invoice_finalized: "1",
    };
  }

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim() || null : undefined;

  await uploadStepFiles({
    shipmentId: masterShipmentId,
    stepId,
    isExternal: step.is_external === 1,
    formData,
    actorUserId: user.id,
  });

  const runtime = await loadMasterRuntime({
    masterShipmentId,
    masterStepOverride: { stepId, values: mergedRecord },
  });
  const computed = computeLtlMasterStatuses({
    stepsByName: runtime.masterStepByName,
    docTypes: runtime.masterDocTypes,
    subshipments: runtime.subshipments.map((sub) => sub.computed),
  });

  if (isTrackingStep(step.name) && !computed.trackingUnlocked) {
    redirect(appendParam(returnBase, "error", "tracking_locked"));
  }

  if (step.name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.exportInvoice && !computed.canFinalizeInvoice) {
    redirect(appendParam(returnBase, "error", "invoice_prereq"));
  }

  if (step.name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.customsAgentsAllocation) {
    const mode = getString(mergedRecord.naseeb_clearance_mode).toUpperCase();
    if (mode !== "ZAXON") {
      redirect(appendParam(returnBase, "error", "customs_naseeb_locked"));
    }
  }

  if (isTrackingStep(step.name)) {
    const agentsValues =
      runtime.masterStepByName[LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.customsAgentsAllocation]?.values ??
      {};
    if (!hasTrackingAgentPrerequisite(step.name, agentsValues, touchedFieldKeys)) {
      redirect(appendParam(returnBase, "error", "tracking_agent_required"));
    }
  }

  if (step.name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.syriaWarehouseFinalDelivery) {
    const warehouse = parseMasterWarehouse(mergedRecord);
    if (warehouse.arrived && !warehouse.arrivalDate) {
      redirect(appendParam(returnBase, "error", "arrival_date_required"));
    }
    if (warehouse.offloaded && !warehouse.offloadDate) {
      redirect(appendParam(returnBase, "error", "offload_date_required"));
    }
  }

  await updateShipmentStep({
    stepId,
    notes,
    fieldValuesJson: JSON.stringify(mergedRecord),
  });

  await syncStepStatuses(runtime.masterSteps, computed.statuses);

  await logActivity({
    shipmentId: masterShipmentId,
    type: "STEP_UPDATED",
    message: `Master step "${step.name}" saved`,
    actorUserId: user.id,
    data: {
      stepId,
      savedAt: nowIso(),
      statusAfter: computed.statuses[step.name] ?? step.status,
    },
  });

  await refreshShipmentDerivedState({
    shipmentId: masterShipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(appendParam(returnBase, "saved", String(stepId)));
}
export async function closeMasterLoadingAction(masterShipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, masterShipmentId);

  const master = await ensureMasterShipment(masterShipmentId);
  if (!master) redirect("/shipments");

  const returnBase = buildReturnBase(masterShipmentId, formData.get("returnTo"));
  const steps = await listShipmentSteps(masterShipmentId);
  const loadingStep = steps.find(
    (step) => step.name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.loadingExecution,
  );
  if (!loadingStep) {
    redirect(appendParam(returnBase, "error", "invalid"));
  }

  const merged = {
    ...toRecord(parseStepFieldValues(loadingStep.field_values_json)),
    close_loading: "1",
    close_loading_at: nowIso().slice(0, 10),
  };

  await updateShipmentStep({
    stepId: loadingStep.id,
    fieldValuesJson: JSON.stringify(merged),
  });

  const { computed } = await syncMasterStatuses({
    masterShipmentId,
    masterStepOverride: {
      stepId: loadingStep.id,
      values: merged,
    },
  });

  await logActivity({
    shipmentId: masterShipmentId,
    type: "STEP_UPDATED",
    message: "Loading closed",
    actorUserId: user.id,
    data: {
      stepId: loadingStep.id,
      tripLoadingStatus: computed.tripLoadingStatus,
    },
  });

  await refreshShipmentDerivedState({
    shipmentId: masterShipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(appendParam(returnBase, "saved", String(loadingStep.id)));
}

export async function createSubshipmentAction(masterShipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, masterShipmentId);

  const master = await ensureMasterShipment(masterShipmentId);
  if (!master) redirect("/shipments");

  const returnBase = buildReturnBase(masterShipmentId, formData.get("returnTo"));

  const customerPartyId = Number(formData.get("customerPartyId") ?? 0);
  if (!customerPartyId) {
    redirect(appendParam(returnBase, "error", "customer_required"));
  }

  const customers = await listParties({ type: "CUSTOMER" });
  const customer = customers.find((row) => row.id === customerPartyId);
  if (!customer) {
    redirect(appendParam(returnBase, "error", "customer_required"));
  }

  const importRowsRaw = String(formData.get("importRowsJson") ?? "").trim();
  const draftRows = parseDraftImportRows(importRowsRaw);
  if (!draftRows.length) {
    redirect(appendParam(returnBase, "error", "import_reference_required"));
  }

  const candidateMap = await buildImportCandidateMapForMaster({
    masterShipmentId,
    userId: user.id,
    role: user.role,
  });

  const requestedBySource = new Map<string, { weight: number; quantity: number }>();
  const normalizedImportRows: Array<Record<string, unknown>> = [];
  let sumAllocatedWeight = 0;
  let sumAllocatedVolume = 0;

  for (const draftRow of draftRows) {
    const candidateRow = candidateMap.get(draftRow.sourceShipmentId);
    if (!candidateRow) {
      redirect(appendParam(returnBase, "error", "import_reference_invalid"));
    }

    if (
      candidateRow.effectiveRemainingWeight <= 0.0001 &&
      candidateRow.effectiveRemainingQuantity <= 0.0001
    ) {
      redirect(appendParam(returnBase, "error", "import_reference_invalid"));
    }

    if (draftRow.allocatedWeight <= 0 && draftRow.allocatedQuantity <= 0) {
      redirect(appendParam(returnBase, "error", "import_reference_invalid"));
    }

    const requested = requestedBySource.get(draftRow.sourceShipmentId) ?? {
      weight: 0,
      quantity: 0,
    };
    requested.weight += draftRow.allocatedWeight;
    requested.quantity += draftRow.allocatedQuantity;
    requestedBySource.set(draftRow.sourceShipmentId, requested);

    if (requested.weight > candidateRow.effectiveRemainingWeight + 0.0001) {
      redirect(appendParam(returnBase, "error", "import_reference_invalid"));
    }
    if (requested.quantity > candidateRow.effectiveRemainingQuantity + 0.0001) {
      redirect(appendParam(returnBase, "error", "import_reference_invalid"));
    }

    sumAllocatedWeight += draftRow.allocatedWeight;
    sumAllocatedVolume += draftRow.allocatedQuantity;

    normalizedImportRows.push({
      source_shipment_id: String(candidateRow.candidate.shipmentId),
      import_shipment_reference: candidateRow.candidate.shipmentCode,
      client_number: candidateRow.candidate.clientNumber,
      import_boe_number: candidateRow.candidate.importBoeNumber,
      processed_available: candidateRow.candidate.processedAvailable ? "1" : "",
      non_physical_stock: candidateRow.candidate.nonPhysicalStock ? "1" : "",
      imported_weight: candidateRow.candidate.importedWeight,
      imported_quantity: candidateRow.candidate.importedQuantity,
      already_allocated_weight: candidateRow.effectiveAlreadyAllocatedWeight,
      already_allocated_quantity: candidateRow.effectiveAlreadyAllocatedQuantity,
      package_type: candidateRow.candidate.packageType,
      cargo_description: candidateRow.candidate.cargoDescription,
      allocated_weight: draftRow.allocatedWeight,
      allocated_quantity: draftRow.allocatedQuantity,
    });
  }

  const submittedTotalCargoWeightRaw = String(formData.get("totalCargoWeight") ?? "").trim();
  const submittedTotalCargoVolumeRaw = String(formData.get("totalCargoVolume") ?? "").trim();
  const submittedTotalCargoWeight = getNumber(submittedTotalCargoWeightRaw);
  const submittedTotalCargoVolume = getNumber(submittedTotalCargoVolumeRaw);
  const totalCargoWeight =
    submittedTotalCargoWeightRaw.length > 0 ? submittedTotalCargoWeight : sumAllocatedWeight;
  const totalCargoVolume =
    submittedTotalCargoVolumeRaw.length > 0 ? submittedTotalCargoVolume : sumAllocatedVolume;

  const subshipmentTemplateId = await ensureLtlSubshipmentTemplate({
    createdByUserId: user.id,
  });

  const created = await createShipment({
    customerPartyIds: [customerPartyId],
    transportMode: "LAND",
    origin: master.origin,
    destination: master.destination,
    shipmentType: "LAND",
    cargoDescription: `LTL customer shipment under ${master.shipment_code}`,
    workflowTemplateId: subshipmentTemplateId,
    shipmentKind: "SUBSHIPMENT",
    masterShipmentId,
    createdByUserId: user.id,
  });

  await createShipmentLink({
    shipmentId: masterShipmentId,
    connectedShipmentId: created.shipmentId,
    shipmentLabel: "Master shipment",
    connectedLabel: "Customer subshipment",
    createdByUserId: user.id,
  });

  const subshipmentSteps = await listShipmentSteps(created.shipmentId);
  const detailsStep = subshipmentSteps.find(
    (step) => step.name === LTL_SUBSHIPMENT_STEP_NAMES.detailsAndImports,
  );
  if (detailsStep) {
    await updateShipmentStep({
      stepId: detailsStep.id,
      fieldValuesJson: JSON.stringify({
        client_name: customer.name,
        client_party_id: String(customer.id),
        total_cargo_weight: totalCargoWeight > 0 ? totalCargoWeight : "",
        total_cargo_volume: totalCargoVolume > 0 ? totalCargoVolume : "",
        import_shipments: normalizedImportRows,
      }),
    });
  }

  await syncSingleSubshipmentStatuses({ subshipmentId: created.shipmentId });

  const masterAddStep = (await listShipmentSteps(masterShipmentId)).find(
    (step) => step.name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.addCustomerShipments,
  );
  if (masterAddStep) {
    await updateShipmentStep({
      stepId: masterAddStep.id,
      fieldValuesJson: JSON.stringify({
        ...toRecord(parseStepFieldValues(masterAddStep.field_values_json)),
        last_subshipment_at: nowIso().slice(0, 10),
      }),
    });
  }

  await syncMasterStatuses({ masterShipmentId });

  await logActivity({
    shipmentId: masterShipmentId,
    type: "STEP_UPDATED",
    message: `Subshipment created (${created.shipmentCode})`,
    actorUserId: user.id,
    data: {
      subshipmentId: created.shipmentId,
      subshipmentCode: created.shipmentCode,
      customerPartyId,
      importRows: normalizedImportRows.length,
    },
  });

  await Promise.all([
    refreshShipmentDerivedState({
      shipmentId: created.shipmentId,
      actorUserId: user.id,
      updateLastUpdate: true,
    }),
    refreshShipmentDerivedState({
      shipmentId: masterShipmentId,
      actorUserId: user.id,
      updateLastUpdate: true,
    }),
  ]);

  redirect(appendParam(returnBase, "created", String(created.shipmentId)));
}
export async function updateSubshipmentLoadingAction(
  masterShipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, masterShipmentId);

  const master = await ensureMasterShipment(masterShipmentId);
  if (!master) redirect("/shipments");

  const returnBase = buildReturnBase(masterShipmentId, formData.get("returnTo"));
  const subshipmentId = Number(formData.get("subshipmentId") ?? 0);
  if (!subshipmentId) {
    redirect(appendParam(returnBase, "error", "subshipment_invalid"));
  }

  const subshipment = await getShipment(subshipmentId);
  if (
    !subshipment ||
    subshipment.shipment_kind !== "SUBSHIPMENT" ||
    subshipment.master_shipment_id !== masterShipmentId
  ) {
    redirect(appendParam(returnBase, "error", "subshipment_invalid"));
  }

  const steps = await listShipmentSteps(subshipmentId);
  const loadingStep = steps.find(
    (step) => step.name === LTL_SUBSHIPMENT_STEP_NAMES.loadingExecution,
  );
  if (!loadingStep) {
    redirect(appendParam(returnBase, "error", "subshipment_invalid"));
  }

  const existingValues = parseStepFieldValues(loadingStep.field_values_json);
  const fieldUpdates = extractStepFieldUpdates(formData);
  const fieldRemovals = extractStepFieldRemovals(formData);
  let mergedValues = applyStepFieldUpdates(existingValues, fieldUpdates);
  mergedValues = applyStepFieldRemovals(mergedValues, fieldRemovals);
  const mergedRecord = toRecord(mergedValues);

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim() || null : undefined;

  await uploadStepFiles({
    shipmentId: subshipmentId,
    stepId: loadingStep.id,
    isExternal: false,
    formData,
    actorUserId: user.id,
  });

  const docs = await listDocuments(subshipmentId);
  const docTypes = new Set(
    docs
      .filter((doc) => doc.is_received)
      .map((doc) => String(doc.document_type)),
  );
  const loading = parseSubshipmentLoading(mergedRecord);
  const loadingPhoto = docTypes.has(
    stepFieldDocType(loadingStep.id, encodeFieldPath(["loading_photos"])),
  );

  if (
    loading.loadedIntoTruck &&
    (loading.confirmedWeight <= 0 || loading.confirmedVolume <= 0 || !loadingPhoto)
  ) {
    redirect(appendParam(returnBase, "error", "loading_required"));
  }

  await updateShipmentStep({
    stepId: loadingStep.id,
    notes,
    fieldValuesJson: JSON.stringify(mergedRecord),
  });

  await syncSingleSubshipmentStatuses({
    subshipmentId,
    stepOverride: {
      stepId: loadingStep.id,
      values: mergedRecord,
    },
  });

  await syncMasterStatuses({ masterShipmentId });

  await Promise.all([
    refreshShipmentDerivedState({
      shipmentId: subshipmentId,
      actorUserId: user.id,
      updateLastUpdate: true,
    }),
    refreshShipmentDerivedState({
      shipmentId: masterShipmentId,
      actorUserId: user.id,
      updateLastUpdate: true,
    }),
  ]);

  redirect(appendParam(returnBase, "savedSub", String(subshipmentId)));
}

export async function updateSubshipmentHandoverAction(
  masterShipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, masterShipmentId);

  const master = await ensureMasterShipment(masterShipmentId);
  if (!master) redirect("/shipments");

  const returnBase = buildReturnBase(masterShipmentId, formData.get("returnTo"));
  const subshipmentId = Number(formData.get("subshipmentId") ?? 0);
  if (!subshipmentId) {
    redirect(appendParam(returnBase, "error", "subshipment_invalid"));
  }

  const subshipment = await getShipment(subshipmentId);
  if (
    !subshipment ||
    subshipment.shipment_kind !== "SUBSHIPMENT" ||
    subshipment.master_shipment_id !== masterShipmentId
  ) {
    redirect(appendParam(returnBase, "error", "subshipment_invalid"));
  }

  const masterSteps = await listShipmentSteps(masterShipmentId);
  const warehouseStep = masterSteps.find(
    (step) => step.name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.syriaWarehouseFinalDelivery,
  );
  const warehouseValues = toRecord(parseStepFieldValues(warehouseStep?.field_values_json ?? "{}"));
  const warehouse = parseMasterWarehouse(warehouseValues);
  if (!warehouse.offloaded || !warehouse.offloadDate) {
    redirect(appendParam(returnBase, "error", "offload_required"));
  }

  const steps = await listShipmentSteps(subshipmentId);
  const handoverStep = steps.find(
    (step) => step.name === LTL_SUBSHIPMENT_STEP_NAMES.finalHandover,
  );
  if (!handoverStep) {
    redirect(appendParam(returnBase, "error", "subshipment_invalid"));
  }

  const existingValues = parseStepFieldValues(handoverStep.field_values_json);
  const fieldUpdates = extractStepFieldUpdates(formData);
  const fieldRemovals = extractStepFieldRemovals(formData);
  let mergedValues = applyStepFieldUpdates(existingValues, fieldUpdates);
  mergedValues = applyStepFieldRemovals(mergedValues, fieldRemovals);
  const mergedRecord = toRecord(mergedValues);

  const handover = parseSubshipmentHandover(mergedRecord);

  if (!LTL_SUBSHIPMENT_HANDOVER_METHODS.includes(handover.method as never)) {
    redirect(appendParam(returnBase, "error", "handover_method_required"));
  }

  if (
    handover.method === "PICKUP" &&
    handover.collectedByCustomer &&
    !handover.collectionDate
  ) {
    redirect(appendParam(returnBase, "error", "handover_date_required"));
  }

  if (
    handover.method === "LOCAL_DELIVERY" &&
    handover.delivered &&
    !handover.deliveryDate
  ) {
    redirect(appendParam(returnBase, "error", "handover_date_required"));
  }

  await updateShipmentStep({
    stepId: handoverStep.id,
    fieldValuesJson: JSON.stringify(mergedRecord),
  });

  await syncSingleSubshipmentStatuses({
    subshipmentId,
    stepOverride: {
      stepId: handoverStep.id,
      values: mergedRecord,
    },
  });

  await syncMasterStatuses({ masterShipmentId });

  await Promise.all([
    refreshShipmentDerivedState({
      shipmentId: subshipmentId,
      actorUserId: user.id,
      updateLastUpdate: true,
    }),
    refreshShipmentDerivedState({
      shipmentId: masterShipmentId,
      actorUserId: user.id,
      updateLastUpdate: true,
    }),
  ]);

  redirect(appendParam(returnBase, "savedSub", String(subshipmentId)));
}
export async function saveMasterWarehouseArrivalAction(
  masterShipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, masterShipmentId);

  const master = await ensureMasterShipment(masterShipmentId);
  if (!master) redirect("/shipments");

  const returnBase = buildReturnBase(masterShipmentId, formData.get("returnTo"));
  const steps = await listShipmentSteps(masterShipmentId);
  const warehouseStep = steps.find(
    (step) => step.name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.syriaWarehouseFinalDelivery,
  );
  if (!warehouseStep) {
    redirect(appendParam(returnBase, "error", "invalid"));
  }

  const existingValues = parseStepFieldValues(warehouseStep.field_values_json);
  const fieldUpdates = extractStepFieldUpdates(formData);
  const fieldRemovals = extractStepFieldRemovals(formData);
  let mergedValues = applyStepFieldUpdates(existingValues, fieldUpdates);
  mergedValues = applyStepFieldRemovals(mergedValues, fieldRemovals);
  const mergedRecord = toRecord(mergedValues);

  await uploadStepFiles({
    shipmentId: masterShipmentId,
    stepId: warehouseStep.id,
    isExternal: false,
    formData,
    actorUserId: user.id,
  });

  const warehouse = parseMasterWarehouse(mergedRecord);
  if (warehouse.arrived && !warehouse.arrivalDate) {
    redirect(appendParam(returnBase, "error", "arrival_date_required"));
  }
  if (warehouse.offloaded && !warehouse.offloadDate) {
    redirect(appendParam(returnBase, "error", "offload_date_required"));
  }

  await updateShipmentStep({
    stepId: warehouseStep.id,
    fieldValuesJson: JSON.stringify(mergedRecord),
  });

  await syncMasterStatuses({
    masterShipmentId,
    masterStepOverride: {
      stepId: warehouseStep.id,
      values: mergedRecord,
    },
  });

  await refreshShipmentDerivedState({
    shipmentId: masterShipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(appendParam(returnBase, "saved", String(warehouseStep.id)));
}
