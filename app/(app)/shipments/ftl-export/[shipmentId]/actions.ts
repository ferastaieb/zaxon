"use server";

import { redirect } from "next/navigation";

import { assertCanWrite, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data/activities";
import {
  addDocument,
  createDocumentRequest,
  listDocuments,
} from "@/lib/data/documents";
import { listShipmentSteps } from "@/lib/data/shipments";
import { updateShipmentStep } from "@/lib/data/steps";
import { stepStatusLabel } from "@/lib/domain";
import { nowIso, scanAll, tableName } from "@/lib/db";
import {
  FTL_EXPORT_STEP_NAMES,
  FTL_EXPORT_TRACKING_STEPS,
} from "@/lib/ftlExport/constants";
import {
  getString,
  normalizeLoadingOrigin,
  parseImportShipmentRows,
  parseTruckBookingRows,
  parseLoadingRows,
  toRecord,
  isTruthy,
} from "@/lib/ftlExport/helpers";
import { listFtlImportCandidates } from "@/lib/ftlExport/importCandidates";
import { computeFtlExportStatuses } from "@/lib/ftlExport/status";
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

function hasDocType(docTypes: Set<string>, stepId: number, path: string[]) {
  const docType = stepFieldDocType(stepId, encodeFieldPath(path));
  return docTypes.has(docType);
}

function validateTruckBookingRows(values: Record<string, unknown>) {
  const rows = parseTruckBookingRows(toRecord(values));
  for (const row of rows) {
    const booked = row.booking_status === "BOOKED" || row.truck_booked;
    if (booked && !row.booking_date) {
      return { ok: false, truckIndex: row.index + 1 };
    }
  }
  return { ok: true as const };
}

function validateLoadingRows(input: {
  stepId: number;
  values: Record<string, unknown>;
  docTypes: Set<string>;
}) {
  const rows = parseLoadingRows(toRecord(input.values));
  for (const row of rows) {
    if (!row.truck_loaded) continue;
    if (!row.raw_loading_origin) {
      return { ok: false, truckIndex: row.index + 1 };
    }
    const origin = normalizeLoadingOrigin(row.raw_loading_origin);
    if (!origin) {
      return { ok: false, truckIndex: row.index + 1 };
    }

    if (origin === "MIXED") {
      if (!row.mixed_supplier_loading_date || !row.mixed_zaxon_loading_date) {
        return { ok: false, truckIndex: row.index + 1 };
      }
      if (
        row.mixed_supplier_cargo_weight <= 0 ||
        row.mixed_supplier_cargo_quantity <= 0 ||
        !row.mixed_supplier_cargo_unit_type
      ) {
        return { ok: false, truckIndex: row.index + 1 };
      }
      if (
        row.mixed_supplier_cargo_unit_type.toLowerCase() === "other" &&
        !row.mixed_supplier_cargo_unit_type_other.trim()
      ) {
        return { ok: false, truckIndex: row.index + 1 };
      }
      if (
        row.mixed_zaxon_cargo_weight <= 0 ||
        row.mixed_zaxon_cargo_quantity <= 0 ||
        !row.mixed_zaxon_cargo_unit_type
      ) {
        return { ok: false, truckIndex: row.index + 1 };
      }
      if (
        row.mixed_zaxon_cargo_unit_type.toLowerCase() === "other" &&
        !row.mixed_zaxon_cargo_unit_type_other.trim()
      ) {
        return { ok: false, truckIndex: row.index + 1 };
      }
      const totalWeight = row.mixed_supplier_cargo_weight + row.mixed_zaxon_cargo_weight;
      const totalQuantity = row.mixed_supplier_cargo_quantity + row.mixed_zaxon_cargo_quantity;
      if (totalWeight <= 0 || totalQuantity <= 0) {
        return { ok: false, truckIndex: row.index + 1 };
      }
    } else {
      if (row.cargo_weight <= 0 || row.cargo_quantity <= 0 || !row.cargo_unit_type) {
        return { ok: false, truckIndex: row.index + 1 };
      }
      if (
        row.cargo_unit_type.toLowerCase() === "other" &&
        !row.cargo_unit_type_other.trim()
      ) {
        return { ok: false, truckIndex: row.index + 1 };
      }
    }

    if (origin === "EXTERNAL_SUPPLIER" && !row.external_loading_date) {
      return { ok: false, truckIndex: row.index + 1 };
    }
    if (origin === "ZAXON_WAREHOUSE" && !row.zaxon_actual_loading_date) {
      return { ok: false, truckIndex: row.index + 1 };
    }

    if (
      (origin === "ZAXON_WAREHOUSE" || origin === "MIXED") &&
      !hasDocType(input.docTypes, input.stepId, [
        "trucks",
        String(row.index),
        "loading_photo",
      ])
    ) {
      return { ok: false, truckIndex: row.index + 1 };
    }
  }
  return { ok: true as const };
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

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim() || null : undefined;

  const invoiceStep = steps.find((row) => row.name === FTL_EXPORT_STEP_NAMES.exportInvoice);
  const invoiceValues = invoiceStep
    ? invoiceStep.id === stepId
      ? (mergedValues as Record<string, unknown>)
      : parseStepFieldValues(invoiceStep.field_values_json)
    : {};
  const invoiceFinalized = isTruthy((invoiceValues as Record<string, unknown>).invoice_finalized);
  if (step.name === FTL_EXPORT_STEP_NAMES.trucksDetails && invoiceFinalized) {
    redirect(appendParam(returnBase, "error", "truck_locked"));
  }
  const trackingSteps = new Set<string>(FTL_EXPORT_TRACKING_STEPS);
  if (trackingSteps.has(step.name)) {
    const loadingStep = steps.find((row) => row.name === FTL_EXPORT_STEP_NAMES.loadingDetails);
    const invoiceStatusStep = steps.find((row) => row.name === FTL_EXPORT_STEP_NAMES.exportInvoice);
    const agentsStep = steps.find(
      (row) => row.name === FTL_EXPORT_STEP_NAMES.customsAgentsAllocation,
    );
    if (
      loadingStep?.status !== "DONE" ||
      invoiceStatusStep?.status !== "DONE" ||
      agentsStep?.status !== "DONE"
    ) {
      redirect(appendParam(returnBase, "error", "tracking_locked"));
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

  if (step.name === FTL_EXPORT_STEP_NAMES.trucksDetails) {
    const bookingValidation = validateTruckBookingRows(
      mergedValues as Record<string, unknown>,
    );
    if (!bookingValidation.ok) {
      redirect(
        appendParam(
          appendParam(returnBase, "error", "truck_booking_required"),
          "truck",
          String(bookingValidation.truckIndex),
        ),
      );
    }
  }

  if (step.name === FTL_EXPORT_STEP_NAMES.loadingDetails) {
    const loadingValidation = validateLoadingRows({
      stepId,
      values: mergedValues as Record<string, unknown>,
      docTypes,
    });
    if (!loadingValidation.ok) {
      redirect(
        appendParam(
          appendParam(returnBase, "error", "loading_required"),
          "truck",
          String(loadingValidation.truckIndex),
        ),
      );
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
  });

  if (trackingSteps.has(step.name)) {
    const loadingDone = computed.statuses[FTL_EXPORT_STEP_NAMES.loadingDetails] === "DONE";
    const invoiceDone = computed.statuses[FTL_EXPORT_STEP_NAMES.exportInvoice] === "DONE";
    const agentsDone =
      computed.statuses[FTL_EXPORT_STEP_NAMES.customsAgentsAllocation] === "DONE";
    if (!loadingDone || !invoiceDone || !agentsDone) {
      redirect(appendParam(returnBase, "error", "tracking_locked"));
    }
  }

  if (
    step.name === FTL_EXPORT_STEP_NAMES.exportInvoice &&
    isTruthy((mergedValues as Record<string, unknown>).invoice_finalized) &&
    !computed.canFinalizeInvoice
  ) {
    redirect(appendParam(returnBase, "error", "invoice_prereq"));
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
