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
import { FTL_EXPORT_STEP_NAMES } from "@/lib/ftlExport/constants";
import {
  getString,
  normalizeLoadingOrigin,
  parseLoadingRows,
  toRecord,
  isTruthy,
} from "@/lib/ftlExport/helpers";
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

function validateLoadingRows(input: {
  stepId: number;
  values: Record<string, unknown>;
  docTypes: Set<string>;
}) {
  const rows = parseLoadingRows(toRecord(input.values));
  for (const row of rows) {
    if (!row.truck_loaded) continue;
    if (row.cargo_weight <= 0 || row.cargo_quantity <= 0 || !row.cargo_unit_type) {
      return { ok: false, truckIndex: row.index + 1 };
    }
    if (
      row.cargo_unit_type.toLowerCase() === "other" &&
      !row.cargo_unit_type_other.trim()
    ) {
      return { ok: false, truckIndex: row.index + 1 };
    }

    const origin = normalizeLoadingOrigin(row.loading_origin);
    if (origin === "EXTERNAL_SUPPLIER" && !row.external_loading_date) {
      return { ok: false, truckIndex: row.index + 1 };
    }
    if (origin === "ZAXON_WAREHOUSE" && !row.zaxon_actual_loading_date) {
      return { ok: false, truckIndex: row.index + 1 };
    }
    if (
      origin === "MIXED" &&
      (!row.mixed_supplier_loading_date || !row.mixed_zaxon_loading_date)
    ) {
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

  await updateShipmentStep({
    stepId,
    notes,
    fieldValuesJson: JSON.stringify(mergedValues),
  });

  const docs = await listDocuments(shipmentId);
  const docTypes = new Set(
    docs.filter((doc) => doc.is_received).map((doc) => String(doc.document_type)),
  );

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

  if (
    step.name === FTL_EXPORT_STEP_NAMES.exportInvoice &&
    isTruthy((mergedValues as Record<string, unknown>).invoice_finalized) &&
    !computed.canFinalizeInvoice
  ) {
    redirect(appendParam(returnBase, "error", "invoice_prereq"));
  }

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
