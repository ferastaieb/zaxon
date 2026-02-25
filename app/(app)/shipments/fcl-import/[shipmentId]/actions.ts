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
  isTruthy,
  normalizeContainerRows,
  normalizeContainerNumbers,
} from "@/lib/fclImport/helpers";
import { computeFclStatuses } from "@/lib/fclImport/status";

function normalizeStatus(raw: string): StepStatus | null {
  if (!StepStatuses.includes(raw as StepStatus)) return null;
  return raw as StepStatus;
}

function appendParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function withError(returnTo: string, shipmentId: number, error: string) {
  const fallback = `/shipments/fcl-import/${shipmentId}`;
  const allowedPrefixes = [
    `/shipments/fcl-import/${shipmentId}`,
    `/shipments/${shipmentId}`,
  ];
  const base =
    returnTo && allowedPrefixes.some((prefix) => returnTo.startsWith(prefix))
      ? returnTo
      : fallback;
  return appendParam(base, "error", error);
}

function normalizeReturnTo(returnToRaw: FormDataEntryValue | null, shipmentId: number) {
  if (typeof returnToRaw !== "string") return "";
  const trimmed = returnToRaw.trim();
  const allowedPrefixes = [
    `/shipments/fcl-import/${shipmentId}`,
    `/shipments/${shipmentId}`,
  ];
  return allowedPrefixes.some((prefix) => trimmed.startsWith(prefix)) ? trimmed : "";
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  if (Object.getPrototypeOf(value) !== Object.prototype) return {};
  return value as Record<string, unknown>;
}

function hasPullOutData(row: Record<string, string>) {
  return (
    isTruthy(row.pulled_out) ||
    !!row.pull_out_token_date?.trim() ||
    !!row.pull_out_date?.trim() ||
    !!row.pull_out_token_slot?.trim() ||
    !!row.pull_out_destination?.trim()
  );
}

function isDischargeDone(row: Record<string, string>) {
  return isTruthy(row.container_discharged) || !!row.container_discharged_date?.trim();
}

function isPullOutDone(row: Record<string, string>) {
  return (
    isTruthy(row.pulled_out) ||
    !!row.pull_out_token_date?.trim() ||
    !!row.pull_out_date?.trim()
  );
}

function hasDeliveryData(row: Record<string, string>) {
  return (
    isTruthy(row.delivered_offloaded) ||
    !!row.delivered_offloaded_date?.trim() ||
    !!row.offload_location?.trim() ||
    isTruthy(row.empty_returned) ||
    !!row.empty_returned_date?.trim()
  );
}

function hasTokenData(row: Record<string, string>) {
  return !!row.token_date?.trim();
}

function hasReturnTokenData(row: Record<string, string>) {
  return !!row.return_token_date?.trim();
}

export async function updateFclStepAction(shipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);

  const stepId = Number(formData.get("stepId") ?? 0);
  const returnTo = normalizeReturnTo(formData.get("returnTo"), shipmentId);
  if (!stepId) redirect(withError(returnTo, shipmentId, "invalid"));

  const steps = await listShipmentSteps(shipmentId);
  const step = steps.find((row) => row.id === stepId);
  if (!step) redirect(withError(returnTo, shipmentId, "invalid"));

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

  const stepsByNameForValidation: Record<
    string,
    { id: number; values: Record<string, unknown> }
  > = {};
  for (const row of steps) {
    stepsByNameForValidation[row.name] = {
      id: row.id,
      values:
        row.id === stepId
          ? toRecord(mergedValues)
          : toRecord(parseStepFieldValues(row.field_values_json)),
    };
  }

  let containerNumbers = extractContainerNumbers(
    stepsByNameForValidation[FCL_IMPORT_STEP_NAMES.shipmentCreation]?.values ?? {},
  );
  if (!containerNumbers.length) {
    const shipment = await getShipment(shipmentId);
    containerNumbers = normalizeContainerNumbers([shipment?.container_number ?? ""]);
  }

  if (step.name === FCL_IMPORT_STEP_NAMES.containerPullOut) {
    const dischargeRows = normalizeContainerRows(
      containerNumbers,
      stepsByNameForValidation[FCL_IMPORT_STEP_NAMES.containersDischarge]?.values ?? {},
    );
    const pullOutRows = normalizeContainerRows(
      containerNumbers,
      stepsByNameForValidation[FCL_IMPORT_STEP_NAMES.containerPullOut]?.values ?? {},
    );
    for (let index = 0; index < pullOutRows.length; index += 1) {
      if (hasPullOutData(pullOutRows[index]) && !isDischargeDone(dischargeRows[index])) {
        redirect(withError(returnTo, shipmentId, "tracking_sequence"));
      }
    }
  }

  if (step.name === FCL_IMPORT_STEP_NAMES.containerDelivery) {
    const pullOutRows = normalizeContainerRows(
      containerNumbers,
      stepsByNameForValidation[FCL_IMPORT_STEP_NAMES.containerPullOut]?.values ?? {},
    );
    const deliveryRows = normalizeContainerRows(
      containerNumbers,
      stepsByNameForValidation[FCL_IMPORT_STEP_NAMES.containerDelivery]?.values ?? {},
    );
    for (let index = 0; index < deliveryRows.length; index += 1) {
      if (hasDeliveryData(deliveryRows[index]) && !isPullOutDone(pullOutRows[index])) {
        redirect(withError(returnTo, shipmentId, "tracking_sequence"));
      }
    }
  }

  if (step.name === FCL_IMPORT_STEP_NAMES.tokenBooking) {
    const dischargeRows = normalizeContainerRows(
      containerNumbers,
      stepsByNameForValidation[FCL_IMPORT_STEP_NAMES.containersDischarge]?.values ?? {},
    );
    const tokenRows = normalizeContainerRows(
      containerNumbers,
      stepsByNameForValidation[FCL_IMPORT_STEP_NAMES.tokenBooking]?.values ?? {},
    );
    for (let index = 0; index < tokenRows.length; index += 1) {
      if (hasTokenData(tokenRows[index]) && !isDischargeDone(dischargeRows[index])) {
        redirect(withError(returnTo, shipmentId, "tracking_sequence"));
      }
    }
  }

  if (step.name === FCL_IMPORT_STEP_NAMES.returnTokenBooking) {
    const tokenRows = normalizeContainerRows(
      containerNumbers,
      stepsByNameForValidation[FCL_IMPORT_STEP_NAMES.tokenBooking]?.values ?? {},
    );
    const returnRows = normalizeContainerRows(
      containerNumbers,
      stepsByNameForValidation[FCL_IMPORT_STEP_NAMES.returnTokenBooking]?.values ?? {},
    );
    for (let index = 0; index < returnRows.length; index += 1) {
      if (hasReturnTokenData(returnRows[index]) && !hasTokenData(tokenRows[index])) {
        redirect(withError(returnTo, shipmentId, "tracking_sequence"));
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

  const stepsByName = stepsByNameForValidation;

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
    redirect(appendParam(returnTo, "saved", String(stepId)));
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
  const returnTo = normalizeReturnTo(formData.get("returnTo"), shipmentId);

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
    redirect(appendParam(returnTo, "requested", String(requestId)));
  }
  redirect(`/shipments/fcl-import/${shipmentId}?requested=${requestId}`);
}
