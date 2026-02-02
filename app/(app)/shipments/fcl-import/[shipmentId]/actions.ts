"use server";

import { redirect } from "next/navigation";

import { assertCanWrite, requireUser } from "@/lib/auth";
import {
  addDocument,
  createDocumentRequest,
  listDocuments,
} from "@/lib/data/documents";
import { logActivity } from "@/lib/data/activities";
import { getShipment, listShipmentSteps } from "@/lib/data/shipments";
import { updateShipmentStep } from "@/lib/data/steps";
import { StepStatuses, stepStatusLabel, type StepStatus } from "@/lib/domain";
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
import { FCL_IMPORT_STEP_NAMES } from "@/lib/fclImport/constants";
import {
  extractContainerNumbers,
  normalizeContainerNumbers,
} from "@/lib/fclImport/helpers";
import { computeFclStatuses } from "@/lib/fclImport/status";

function normalizeStatus(raw: string): StepStatus | null {
  if (!StepStatuses.includes(raw as StepStatus)) return null;
  return raw as StepStatus;
}

export async function updateFclStepAction(shipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);

  const stepId = Number(formData.get("stepId") ?? 0);
  const returnToRaw = formData.get("returnTo");
  const returnTo = typeof returnToRaw === "string" ? returnToRaw.trim() : "";
  if (!stepId) redirect(`/shipments/fcl-import/${shipmentId}?error=invalid`);

  const steps = await listShipmentSteps(shipmentId);
  const step = steps.find((row) => row.id === stepId);
  if (!step) redirect(`/shipments/fcl-import/${shipmentId}?error=invalid`);

  const existingValues = parseStepFieldValues(step.field_values_json);
  const fieldUpdates = extractStepFieldUpdates(formData);
  const fieldRemovals = extractStepFieldRemovals(formData);

  let mergedValues = applyStepFieldUpdates(existingValues, fieldUpdates);
  mergedValues = applyStepFieldRemovals(mergedValues, fieldRemovals);

  const notesRaw = formData.get("notes");
  const notes = typeof notesRaw === "string" ? notesRaw.trim() || null : undefined;
  const manualStatusRaw = formData.get("status");
  const manualStatus =
    typeof manualStatusRaw === "string" ? normalizeStatus(manualStatusRaw) : null;

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
      source: "STAFF",
      uploadedByUserId: user.id,
    });

    await logActivity({
      shipmentId,
      type: "DOCUMENT_UPLOADED",
      message: `Field document uploaded: ${upload.documentType}`,
      actorUserId: user.id,
      data: { docId, documentType: upload.documentType, stepId },
    });
  }

  await updateShipmentStep({
    stepId,
    notes,
    fieldValuesJson: JSON.stringify(mergedValues),
  });

  const docTypes = new Set(
    (await listDocuments(shipmentId))
      .filter((doc) => doc.is_received)
      .map((doc) => String(doc.document_type)),
  );

  const stepsByName: Record<string, { id: number; values: Record<string, unknown> }> =
    {};
  for (const row of steps) {
    stepsByName[row.name] = {
      id: row.id,
      values:
        row.id === stepId
          ? (mergedValues as Record<string, unknown>)
          : (parseStepFieldValues(row.field_values_json) as Record<string, unknown>),
    };
  }

  let containerNumbers = extractContainerNumbers(
    stepsByName[FCL_IMPORT_STEP_NAMES.shipmentCreation]?.values ?? {},
  );
  if (!containerNumbers.length) {
    const shipment = await getShipment(shipmentId);
    containerNumbers = normalizeContainerNumbers([shipment?.container_number ?? ""]);
  }

  const computed = computeFclStatuses({
    stepsByName,
    containerNumbers,
    docTypes,
  });

  for (const row of steps) {
    const nextStatus = computed[row.name];
    const statusOverride =
      row.id === stepId && manualStatus ? manualStatus : nextStatus;
    if (!statusOverride || statusOverride === row.status) continue;
    await updateShipmentStep({ stepId: row.id, status: statusOverride });
  }

  await logActivity({
    shipmentId,
    type: "STEP_UPDATED",
    message: manualStatus
      ? `Step "${step.name}" -> ${stepStatusLabel(manualStatus)}`
      : `Step "${step.name}" saved`,
    actorUserId: user.id,
    data: {
      stepId,
      statusRequested: manualStatus,
      fieldUpdates: Object.keys(fieldUpdates),
      fieldRemovals,
      uploads: fieldUploads.map((upload) => upload.documentType),
    },
  });

  await refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  if (returnTo) {
    redirect(returnTo);
  }
  redirect(`/shipments/fcl-import/${shipmentId}?saved=${stepId}`);
}

export async function requestFclDocumentAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);

  const documentType = String(formData.get("documentType") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim() || null;
  const returnToRaw = formData.get("returnTo");
  const returnTo = typeof returnToRaw === "string" ? returnToRaw.trim() : "";

  if (!documentType) {
    redirect(`/shipments/fcl-import/${shipmentId}?error=invalid`);
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

  if (returnTo) {
    redirect(returnTo);
  }
  redirect(`/shipments/fcl-import/${shipmentId}?requested=${requestId}`);
}
