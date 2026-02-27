"use server";

import { redirect } from "next/navigation";

import { assertCanWrite, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data/activities";
import {
  addDocument,
  createDocumentRequest,
  listDocuments,
} from "@/lib/data/documents";
import { getShipment, listShipmentSteps } from "@/lib/data/shipments";
import { updateShipmentStep } from "@/lib/data/steps";
import { stepStatusLabel } from "@/lib/domain";
import { nowIso, scanAll, tableName } from "@/lib/db";
import {
  FTL_EXPORT_STEP_NAMES,
  FTL_EXPORT_TRACKING_STEPS,
} from "@/lib/ftlExport/constants";
import {
  getString,
  parseImportShipmentRows,
  toRecord,
  isTruthy,
} from "@/lib/ftlExport/helpers";
import { listFtlImportCandidates } from "@/lib/ftlExport/importCandidates";
import { computeFtlExportStatuses } from "@/lib/ftlExport/status";
import { requireShipmentAccess } from "@/lib/permissions";
import {
  resolveJafzaLandRoute,
  type JafzaLandRouteId,
} from "@/lib/routes/jafzaLandRoutes";
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
import {
  trackingRegionFlowForRoute,
  trackingStagesForRegion,
  type TrackingRegion,
} from "@/components/shipments/ftl-export/forms/trackingTimelineConfig";

type ShipmentStepLite = {
  id: number;
  shipment_id: number;
  name: string;
  status: "PENDING" | "IN_PROGRESS" | "DONE" | "BLOCKED";
  notes: string | null;
  field_values_json: string;
  is_external: 0 | 1;
};

function appendParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function buildReturnBase(shipmentId: number, returnToRaw: FormDataEntryValue | null) {
  const fallback = `/shipments/ftl-export/${shipmentId}`;
  if (typeof returnToRaw !== "string") return fallback;
  const trimmed = returnToRaw.trim();
  if (!trimmed.startsWith(`/shipments/ftl-export/${shipmentId}`)) return fallback;
  return trimmed;
}

function hasAnyImportRowData(row: {
  source_shipment_id: string;
  import_shipment_reference: string;
  import_boe_number: string;
  allocated_quantity: number;
  allocated_weight: number;
  remarks: string;
}) {
  return (
    !!row.source_shipment_id ||
    !!row.import_shipment_reference ||
    !!row.import_boe_number ||
    row.allocated_quantity > 0 ||
    row.allocated_weight > 0 ||
    !!row.remarks
  );
}

function hasTrackingAgentPrerequisite(input: {
  stepName: string;
  rawAgentsValues: Record<string, unknown>;
  touchedFieldKeys: Set<string>;
  routeId: "JAFZA_TO_SYRIA" | "JAFZA_TO_KSA" | "JAFZA_TO_MUSHTARAKAH";
}) {
  const { stepName, rawAgentsValues, touchedFieldKeys, routeId } = input;
  const agentsValues = toRecord(rawAgentsValues);
  const hasPrefix = (prefix: string) => {
    for (const key of touchedFieldKeys) {
      if (key.startsWith(prefix)) return true;
    }
    return false;
  };
  const modeDone = (prefix: "batha" | "masnaa") => {
    const mode = getString(agentsValues[`${prefix}_clearance_mode`]).toUpperCase();
    if (mode === "ZAXON") {
      return (
        !!getString(agentsValues[`${prefix}_agent_name`]) &&
        !!getString(agentsValues[`${prefix}_consignee_name`]) &&
        !!getString(agentsValues[`show_${prefix}_consignee_to_client`])
      );
    }
    if (mode === "CLIENT") {
      return !!getString(agentsValues[`${prefix}_client_final_choice`]);
    }
    return false;
  };

  if (stepName === FTL_EXPORT_STEP_NAMES.trackingUae) {
    const requiresJebel = hasPrefix("jebel_ali_");
    const requiresSila = hasPrefix("sila_");
    const jebelReady = !!getString(agentsValues.jebel_ali_agent_name);
    const silaReady = !!getString(agentsValues.sila_agent_name);
    return (!requiresJebel || jebelReady) && (!requiresSila || silaReady);
  }
  if (stepName === FTL_EXPORT_STEP_NAMES.trackingKsa) {
    const requiresBatha = hasPrefix("batha_");
    if (!requiresBatha) return true;
    if (routeId === "JAFZA_TO_KSA") return modeDone("batha");
    return !!getString(agentsValues.batha_agent_name);
  }
  if (stepName === FTL_EXPORT_STEP_NAMES.trackingJordan) {
    const requiresOmari = hasPrefix("omari_");
    return !requiresOmari || !!getString(agentsValues.omari_agent_name);
  }
  if (stepName === FTL_EXPORT_STEP_NAMES.trackingSyria) {
    if (routeId === "JAFZA_TO_MUSHTARAKAH") {
      const touchesMushtarakah = hasPrefix("mushtarakah_");
      const touchesMasnaa = hasPrefix("masnaa_");
      if (touchesMushtarakah) {
        return (
          !!getString(agentsValues.mushtarakah_agent_name) &&
          !!getString(agentsValues.mushtarakah_consignee_name)
        );
      }
      if (touchesMasnaa) {
        return modeDone("masnaa");
      }
      return true;
    }
    if (!hasPrefix("syria_")) return true;
    const mode = getString(agentsValues.naseeb_clearance_mode).toUpperCase();
    if (mode === "ZAXON") {
      return !!getString(agentsValues.naseeb_agent_name);
    }
    if (mode === "CLIENT") {
      return !!getString(agentsValues.naseeb_client_final_choice);
    }
    return false;
  }
  return true;
}

function resolveSyriaModeForTracking(input: {
  agentsValues: Record<string, unknown>;
  trackingValues: Record<string, unknown>;
}) {
  const fromTracking = getString(input.trackingValues.syria_clearance_mode).toUpperCase();
  if (fromTracking === "ZAXON" || fromTracking === "CLIENT") {
    return fromTracking as "ZAXON" | "CLIENT";
  }
  const fromAgents = getString(input.agentsValues.naseeb_clearance_mode).toUpperCase();
  if (fromAgents === "ZAXON" || fromAgents === "CLIENT") {
    return fromAgents as "ZAXON" | "CLIENT";
  }
  return "CLIENT" as const;
}

function trackingRegionsForStepName(
  stepName: string,
  routeId: JafzaLandRouteId,
): TrackingRegion[] {
  if (stepName === FTL_EXPORT_STEP_NAMES.trackingUae) return ["uae"];
  if (stepName === FTL_EXPORT_STEP_NAMES.trackingKsa) return ["ksa"];
  if (stepName === FTL_EXPORT_STEP_NAMES.trackingJordan) {
    return routeId === "JAFZA_TO_KSA" ? [] : ["jordan"];
  }
  if (stepName === FTL_EXPORT_STEP_NAMES.trackingSyria) {
    if (routeId === "JAFZA_TO_KSA") return [];
    if (routeId === "JAFZA_TO_MUSHTARAKAH") return ["mushtarakah", "lebanon"];
    return ["syria"];
  }
  return [];
}

function trackingStepNameForRegion(region: TrackingRegion) {
  if (region === "uae") return FTL_EXPORT_STEP_NAMES.trackingUae;
  if (region === "ksa") return FTL_EXPORT_STEP_NAMES.trackingKsa;
  if (region === "jordan") return FTL_EXPORT_STEP_NAMES.trackingJordan;
  return FTL_EXPORT_STEP_NAMES.trackingSyria;
}

function trackingStepOrderForRoute(routeId: JafzaLandRouteId) {
  return trackingRegionFlowForRoute(routeId)
    .map((entry) => trackingStepNameForRegion(entry.id))
    .filter((stepName, index, all) => all.indexOf(stepName) === index) as string[];
}

function checkpointFieldKeysForStep(input: {
  stepName: string;
  routeId: JafzaLandRouteId;
  stepValues: Record<string, unknown>;
  agentsValues: Record<string, unknown>;
}) {
  const fieldKeys = new Set<string>();
  const regions = trackingRegionsForStepName(input.stepName, input.routeId);
  if (!regions.length) return fieldKeys;

  const syriaMode = resolveSyriaModeForTracking({
    agentsValues: input.agentsValues,
    trackingValues: input.stepValues,
  });

  for (const region of regions) {
    const stages = trackingStagesForRegion({
      region,
      routeId: input.routeId,
      syriaMode,
    });
    for (const stage of stages) {
      if (stage.type !== "checkpoint") continue;
      fieldKeys.add(stage.dateKey);
      if (stage.flagKey) {
        fieldKeys.add(stage.flagKey);
      }
    }
  }

  return fieldKeys;
}

async function ensureInvoiceNumberUnique(input: {
  shipmentId: number;
  currentStepId: number;
  invoiceNumber: string;
}) {
  const allSteps = await scanAll<ShipmentStepLite>(tableName("shipment_steps"));
  const normalizedInvoice = input.invoiceNumber.trim().toLowerCase();
  if (!normalizedInvoice) return true;

  for (const row of allSteps) {
    if (row.id === input.currentStepId) continue;
    if (row.shipment_id === input.shipmentId) continue;
    if (row.name !== FTL_EXPORT_STEP_NAMES.exportInvoice) continue;
    const values = parseStepFieldValues(row.field_values_json);
    const invoice = getString(values.invoice_number).toLowerCase();
    if (invoice && invoice === normalizedInvoice) {
      return false;
    }
  }
  return true;
}

export async function updateFtlStepAction(shipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);
  const shipment = await getShipment(shipmentId);
  if (!shipment) redirect(`/shipments/ftl-export/${shipmentId}?error=invalid`);
  const routeId = resolveJafzaLandRoute(shipment.origin, shipment.destination);

  const stepId = Number(formData.get("stepId") ?? 0);
  if (!stepId) redirect(`/shipments/ftl-export/${shipmentId}?error=invalid`);
  const returnBase = buildReturnBase(shipmentId, formData.get("returnTo"));

  const steps = await listShipmentSteps(shipmentId);
  const step = steps.find((row) => row.id === stepId);
  if (!step) redirect(appendParam(returnBase, "error", "invalid"));

  const existingValues = parseStepFieldValues(step.field_values_json);
  const fieldUpdates = extractStepFieldUpdates(formData);
  const fieldRemovals = extractStepFieldRemovals(formData);
  let mergedValues = applyStepFieldUpdates(existingValues, fieldUpdates);
  mergedValues = applyStepFieldRemovals(mergedValues, fieldRemovals);
  const touchedFieldKeys = new Set(
    fieldUpdates.map((update) => (update.path.length ? update.path[0] : "")),
  );

  const finalizeInvoice =
    String(formData.get("finalizeInvoice") ?? "").trim() === "1";
  if (step.name === FTL_EXPORT_STEP_NAMES.exportInvoice && finalizeInvoice) {
    mergedValues = {
      ...toRecord(mergedValues),
      invoice_finalized: "1",
    } as typeof mergedValues;
  }

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim() || null : undefined;

  const invoiceStep = steps.find((row) => row.name === FTL_EXPORT_STEP_NAMES.exportInvoice);
  const invoiceValues = invoiceStep
    ? invoiceStep.id === stepId
      ? (mergedValues as Record<string, unknown>)
      : parseStepFieldValues(invoiceStep.field_values_json)
    : {};
  const invoiceFinalized = isTruthy((invoiceValues as Record<string, unknown>).invoice_finalized);
  if (
    step.name === FTL_EXPORT_STEP_NAMES.trucksDetails &&
    invoiceFinalized &&
    user.role !== "ADMIN"
  ) {
    redirect(appendParam(returnBase, "error", "truck_locked"));
  }
  const trackingSteps = new Set<string>(FTL_EXPORT_TRACKING_STEPS);
  if (trackingSteps.has(step.name)) {
    if (
      routeId === "JAFZA_TO_KSA" &&
      (step.name === FTL_EXPORT_STEP_NAMES.trackingJordan ||
        step.name === FTL_EXPORT_STEP_NAMES.trackingSyria)
    ) {
      redirect(appendParam(returnBase, "error", "invalid"));
    }
    const loadingStep = steps.find((row) => row.name === FTL_EXPORT_STEP_NAMES.loadingDetails);
    const invoiceStatusStep = steps.find((row) => row.name === FTL_EXPORT_STEP_NAMES.exportInvoice);
    const agentsStep = steps.find(
      (row) => row.name === FTL_EXPORT_STEP_NAMES.customsAgentsAllocation,
    );
    const agentsValues = agentsStep
      ? parseStepFieldValues(agentsStep.field_values_json)
      : {};
    if (
      loadingStep?.status !== "DONE" ||
      invoiceStatusStep?.status !== "DONE"
    ) {
      redirect(appendParam(returnBase, "error", "tracking_locked"));
    }
    if (
      !hasTrackingAgentPrerequisite({
        stepName: step.name,
        rawAgentsValues: agentsValues,
        touchedFieldKeys,
        routeId,
      })
    ) {
      redirect(appendParam(returnBase, "error", "tracking_agent_required"));
    }

    const checkpointFieldKeys = checkpointFieldKeysForStep({
      stepName: step.name,
      routeId,
      stepValues: toRecord(mergedValues),
      agentsValues: toRecord(agentsValues),
    });
    const touchedTrackingSection = [...touchedFieldKeys].some((key) =>
      checkpointFieldKeys.has(key),
    );
    if (touchedTrackingSection) {
      const trackingStepOrder = trackingStepOrderForRoute(routeId);
      const currentStepIndex = trackingStepOrder.indexOf(step.name);
      if (currentStepIndex > 0) {
        const previousSteps = trackingStepOrder.slice(0, currentStepIndex);
        const docsBeforeSave = await listDocuments(shipmentId);
        const docTypesBeforeSave = new Set(
          docsBeforeSave
            .filter((doc) => doc.is_received)
            .map((doc) => String(doc.document_type)),
        );
        const previewStepsByName: Record<
          string,
          { id: number; values: Record<string, unknown> } | undefined
        > = {};
        for (const row of steps) {
          previewStepsByName[row.name] = {
            id: row.id,
            values:
              row.id === stepId
                ? (mergedValues as Record<string, unknown>)
                : (parseStepFieldValues(row.field_values_json) as Record<string, unknown>),
          };
        }
        const previewStatus = computeFtlExportStatuses({
          stepsByName: previewStepsByName,
          docTypes: docTypesBeforeSave,
          routeId,
        });
        const hasIncompletePrevious = previousSteps.some(
          (previousStepName) => previewStatus.statuses[previousStepName] !== "DONE",
        );
        if (hasIncompletePrevious) {
          redirect(appendParam(returnBase, "error", "tracking_sequence"));
        }
      }
    }
  }

  const fieldUploads = extractStepFieldUploads(formData).map((upload) => ({
    file: upload.file,
    documentType: stepFieldDocType(stepId, encodeFieldPath(upload.path)),
  }));

  for (const upload of fieldUploads) {
    const saved = await saveUpload({
      shipmentId,
      file: upload.file,
      filePrefix: upload.documentType,
    });

    const docId = await addDocument({
      shipmentId,
      documentType: upload.documentType,
      fileName: saved.fileName,
      storagePath: saved.storagePath,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
      isRequired: false,
      isReceived: true,
      shareWithCustomer: step.is_external === 1,
      source: "STAFF",
      uploadedByUserId: user.id,
    });

    await logActivity({
      shipmentId,
      type: "DOCUMENT_UPLOADED",
      message: `Field document uploaded: ${upload.documentType}`,
      actorUserId: user.id,
      data: { docId, stepId, documentType: upload.documentType },
    });
  }

  const docs = await listDocuments(shipmentId);
  const docTypes = new Set(
    docs.filter((doc) => doc.is_received).map((doc) => String(doc.document_type)),
  );

  if (step.name === FTL_EXPORT_STEP_NAMES.exportInvoice && finalizeInvoice) {
    const invoiceRecord = toRecord(mergedValues);
    const invoiceNumber = getString(invoiceRecord.invoice_number);
    const invoiceDate = getString(invoiceRecord.invoice_date);
    const invoiceDocType = stepFieldDocType(stepId, encodeFieldPath(["invoice_upload"]));
    const hasInvoiceFile = docTypes.has(invoiceDocType);
    if (!invoiceNumber || !invoiceDate || !hasInvoiceFile) {
      redirect(appendParam(returnBase, "error", "invoice_required_fields"));
    }
  }

  if (step.name === FTL_EXPORT_STEP_NAMES.exportInvoice) {
    const invoiceNumber = getString((mergedValues as Record<string, unknown>).invoice_number);
    if (invoiceNumber) {
      const unique = await ensureInvoiceNumberUnique({
        shipmentId,
        currentStepId: stepId,
        invoiceNumber,
      });
      if (!unique) {
        redirect(appendParam(returnBase, "error", "invoice_duplicate"));
      }
    }
  }

  if (step.name === FTL_EXPORT_STEP_NAMES.importShipmentSelection) {
    const importRows = parseImportShipmentRows(toRecord(mergedValues));
    const candidates = await listFtlImportCandidates({
      userId: user.id,
      role: user.role,
      currentShipmentId: shipmentId,
    });
    const candidateById = new Map(
      candidates.map((candidate) => [String(candidate.shipmentId), candidate]),
    );

    const normalizedRows: Array<Record<string, unknown>> = [];
    for (const row of importRows) {
      if (!hasAnyImportRowData(row)) continue;
      const candidate = candidateById.get(row.source_shipment_id);
      if (!candidate) {
        redirect(appendParam(returnBase, "error", "import_reference_invalid"));
      }

      normalizedRows.push({
        source_shipment_id: String(candidate.shipmentId),
        import_shipment_reference: candidate.shipmentCode,
        client_number: candidate.clientNumber,
        import_boe_number: candidate.importBoeNumber,
        processed_available: candidate.processedAvailable ? "1" : "",
        non_physical_stock: candidate.nonPhysicalStock ? "1" : "",
        imported_weight: candidate.importedWeight,
        imported_quantity: candidate.importedQuantity,
        already_allocated_weight: candidate.alreadyAllocatedWeight,
        already_allocated_quantity: candidate.alreadyAllocatedQuantity,
        package_type: candidate.packageType,
        cargo_description: candidate.cargoDescription,
        allocated_weight: row.allocated_weight,
        allocated_quantity: row.allocated_quantity,
        remarks: row.remarks,
      });
    }

    mergedValues = {
      ...toRecord(mergedValues),
      import_shipments: normalizedRows as unknown as Array<unknown>,
    } as typeof mergedValues;
  }

  const stepsByName: Record<string, { id: number; values: Record<string, unknown> }> = {};
  for (const row of steps) {
    stepsByName[row.name] = {
      id: row.id,
      values:
        row.id === stepId
          ? (mergedValues as Record<string, unknown>)
          : (parseStepFieldValues(row.field_values_json) as Record<string, unknown>),
    };
  }

  const computed = computeFtlExportStatuses({
    stepsByName,
    docTypes,
    routeId,
  });

  if (trackingSteps.has(step.name)) {
    const loadingDone = computed.statuses[FTL_EXPORT_STEP_NAMES.loadingDetails] === "DONE";
    const invoiceDone = computed.statuses[FTL_EXPORT_STEP_NAMES.exportInvoice] === "DONE";
    if (!loadingDone || !invoiceDone) {
      redirect(appendParam(returnBase, "error", "tracking_locked"));
    }
  }

  if (step.name === FTL_EXPORT_STEP_NAMES.exportInvoice && !computed.canFinalizeInvoice) {
    const errorCode = computed.invoiceTruckDetailsComplete
      ? "invoice_prereq"
      : "invoice_truck_details_required";
    redirect(appendParam(returnBase, "error", errorCode));
  }

  await updateShipmentStep({
    stepId,
    notes,
    fieldValuesJson: JSON.stringify(mergedValues),
  });

  for (const row of steps) {
    const nextStatus = computed.statuses[row.name];
    if (!nextStatus || nextStatus === row.status) continue;
    await updateShipmentStep({
      stepId: row.id,
      status: nextStatus,
    });
  }

  await logActivity({
    shipmentId,
    type: "STEP_UPDATED",
    message: `Step "${step.name}" saved`,
    actorUserId: user.id,
    data: {
      stepId,
      savedAt: nowIso(),
      statusAfter: computed.statuses[step.name] ?? step.status,
    },
  });

  await refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  const statusLabel = stepStatusLabel(computed.statuses[step.name] ?? step.status);
  redirect(appendParam(appendParam(returnBase, "saved", String(stepId)), "status", statusLabel));
}

export async function requestFtlDocumentAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);

  const documentType = String(formData.get("documentType") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim() || null;
  const returnBase = buildReturnBase(shipmentId, formData.get("returnTo"));

  if (!documentType) {
    redirect(appendParam(returnBase, "error", "invalid"));
  }

  const requestId = await createDocumentRequest({
    shipmentId,
    documentType,
    message,
    requestedByUserId: user.id,
  });

  await logActivity({
    shipmentId,
    type: "DOCUMENT_REQUESTED",
    message: `Customer document requested: ${documentType}`,
    actorUserId: user.id,
    data: { requestId, documentType },
  });

  await refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(appendParam(returnBase, "requested", String(requestId)));
}
