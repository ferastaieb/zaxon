"use server";

import { redirect } from "next/navigation";

import { assertCanWrite, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/data/activities";
import { addDocument, listDocuments } from "@/lib/data/documents";
import { listShipmentSteps } from "@/lib/data/shipments";
import { updateShipmentStep } from "@/lib/data/steps";
import { stepStatusLabel } from "@/lib/domain";
import { nowIso } from "@/lib/db";
import { computeImportTransferOwnershipStatuses } from "@/lib/importTransferOwnership/status";
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

function appendParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function buildReturnBase(shipmentId: number, returnToRaw: FormDataEntryValue | null) {
  const fallback = `/shipments/import-transfer-ownership/${shipmentId}`;
  if (typeof returnToRaw !== "string") return fallback;
  const trimmed = returnToRaw.trim();
  if (!trimmed.startsWith(`/shipments/import-transfer-ownership/${shipmentId}`)) {
    return fallback;
  }
  return trimmed;
}

export async function updateImportTransferStepAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);

  const stepId = Number(formData.get("stepId") ?? 0);
  if (!stepId) {
    redirect(`/shipments/import-transfer-ownership/${shipmentId}?error=invalid`);
  }
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
      shareWithCustomer: false,
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

  const computed = computeImportTransferOwnershipStatuses({
    stepsByName,
    docTypes,
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
