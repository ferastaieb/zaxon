"use server";

import { redirect } from "next/navigation";

import { assertCanWrite, requireAdmin, requireUser } from "@/lib/auth";
import {
  checklistDateKey,
  checklistDocType,
  checklistFileKey,
  getFinalChecklistItem,
  parseChecklistGroupsJson,
} from "@/lib/checklists";
import { logActivity } from "@/lib/data/activities";
import {
  addDocument,
  createDocumentRequest,
  markDocumentRequestFulfilled,
  updateDocumentFlags,
} from "@/lib/data/documents";
import {
  createShipmentException,
  getExceptionType,
  listExceptionPlaybookTasks,
  resolveShipmentException,
} from "@/lib/data/exceptions";
import {
  deleteShipment,
  getShipment,
  grantShipmentAccess,
  listShipmentCustomers,
  updateShipmentWorkflowGlobals,
} from "@/lib/data/shipments";
import {
  addShipmentGood,
  applyShipmentGoodsAllocations,
  createGood,
  deleteShipmentGood,
  getGoodForUser,
} from "@/lib/data/goods";
import { getShipmentStep, updateShipmentStep } from "@/lib/data/steps";
import { createTask, updateTask } from "@/lib/data/tasks";
import { listActiveUserIdsByRole } from "@/lib/data/users";
import { getWorkflowTemplate } from "@/lib/data/workflows";
import {
  StepStatuses,
  TaskStatuses,
  stepStatusLabel,
  taskStatusLabel,
  type DocumentType,
  type StepStatus,
  type TaskStatus,
} from "@/lib/domain";
import { getDb, inTransaction, nowIso } from "@/lib/db";
import { requireShipmentAccess } from "@/lib/permissions";
import { refreshShipmentDerivedState } from "@/lib/services/shipmentDerived";
import {
  applyStepFieldRemovals,
  applyStepFieldUpdates,
  collectFlatFieldValues,
  collectMissingFieldPaths,
  encodeFieldPath,
  extractStepFieldRemovals,
  extractStepFieldUpdates,
  extractStepFieldUploads,
  parseStepFieldSchema,
  parseStepFieldValues,
  schemaFromLegacyFields,
  stepFieldDocType,
  type StepFieldDefinition,
  type StepFieldSchema,
} from "@/lib/stepFields";
import { parseWorkflowGlobalVariables } from "@/lib/workflowGlobals";
import { execute, jsonParse, queryAll, queryOne } from "@/lib/sql";
import { removeShipmentUploads, saveUpload } from "@/lib/storage";

function normalizeFieldLabel(label: string) {
  return label
    .toLowerCase()
    .replace(/[_/\\-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractShipmentIdentifiers(fieldValues: Record<string, string>) {
  let containerNumber: string | null = null;
  let blNumber: string | null = null;

  for (const [label, rawValue] of Object.entries(fieldValues)) {
    const value = rawValue.trim();
    if (!value) continue;

    const key = normalizeFieldLabel(label);
    if (
      !containerNumber &&
      (key === "container" ||
        key === "container number" ||
        key === "container no" ||
        key === "container #")
    ) {
      containerNumber = value;
      continue;
    }

    if (
      !blNumber &&
      (key === "bl" ||
        key === "b l" ||
        key === "bl number" ||
        key === "b l number" ||
        key === "bill of lading" ||
        key === "bill of lading number" ||
        key === "bol" ||
        key === "bol number")
    ) {
      blNumber = value;
    }
  }

  return { containerNumber, blNumber };
}

function isFileFieldRequired(schema: StepFieldSchema, path: string[]): boolean {
  let fields = schema.fields;
  for (let i = 0; i < path.length; i += 1) {
    const segment = path[i];
    if (isNumeric(segment)) continue;
    const field = fields.find((f) => f.id === segment);
    if (!field) return false;
    if (i === path.length - 1) {
      return field.type === "file" && !!field.required;
    }
    if (field.type === "group") {
      fields = field.fields;
      continue;
    }
    if (field.type === "choice") {
      const optionId = path[i + 1];
      const option = field.options.find((o) => o.id === optionId);
      if (!option) return false;
      fields = option.fields;
      i += 1;
      continue;
    }
    return false;
  }
  return false;
}

function isNumeric(value: string | undefined): boolean {
  if (!value) return false;
  return /^[0-9]+$/.test(value);
}

function collectShipmentGoodsAllocations(
  schema: StepFieldSchema,
  values: Record<string, unknown>,
) {
  const allocations = new Map<number, number>();

  const walk = (fields: StepFieldDefinition[], current: Record<string, unknown>) => {
    for (const field of fields) {
      const fieldValue = current[field.id];
      if (field.type === "shipment_goods") {
        if (fieldValue && typeof fieldValue === "object" && !Array.isArray(fieldValue)) {
          for (const [key, entry] of Object.entries(fieldValue)) {
            const match = /^good-(\d+)$/.exec(key);
            if (!match) continue;
            const shipmentGoodId = Number(match[1]);
            if (!Number.isFinite(shipmentGoodId)) continue;
            if (typeof entry !== "string") continue;
            const parsed = Number(entry);
            if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) continue;
            allocations.set(shipmentGoodId, parsed);
          }
        }
        continue;
      }
      if (field.type === "group") {
        if (field.repeatable) {
          const items = Array.isArray(fieldValue) ? fieldValue : [];
          for (const item of items) {
            if (item && typeof item === "object" && !Array.isArray(item)) {
              walk(field.fields, item as Record<string, unknown>);
            }
          }
        } else if (fieldValue && typeof fieldValue === "object" && !Array.isArray(fieldValue)) {
          walk(field.fields, fieldValue as Record<string, unknown>);
        }
        continue;
      }
      if (field.type === "choice") {
        if (fieldValue && typeof fieldValue === "object" && !Array.isArray(fieldValue)) {
          const choiceValues = fieldValue as Record<string, unknown>;
          for (const option of field.options) {
            const optionValue = choiceValues[option.id];
            if (optionValue && typeof optionValue === "object" && !Array.isArray(optionValue)) {
              walk(option.fields, optionValue as Record<string, unknown>);
            }
          }
        }
        continue;
      }
    }
  };

  walk(schema.fields, values);
  return Array.from(allocations.entries()).map(([shipmentGoodId, takenQuantity]) => ({
    shipmentGoodId,
    takenQuantity,
  }));
}

export async function updateStepAction(shipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const stepId = Number(formData.get("stepId") ?? 0);
  const status = String(formData.get("status") ?? "") as StepStatus;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  let relatedPartyId: number | null | undefined = undefined;
  const relatedPartyEntry = formData.get("relatedPartyId");
  if (relatedPartyEntry !== null) {
    const relatedPartyIdRaw = String(relatedPartyEntry).trim();
    if (!relatedPartyIdRaw) {
      relatedPartyId = null;
    } else {
      const parsed = Number(relatedPartyIdRaw);
      if (!Number.isFinite(parsed)) redirect(`/shipments/${shipmentId}?error=invalid`);
      relatedPartyId = parsed;
    }
  }

  if (!stepId || !StepStatuses.includes(status)) {
    redirect(`/shipments/${shipmentId}?error=invalid`);
  }

  const current = getShipmentStep(stepId);
  if (!current || current.shipment_id !== shipmentId) {
    redirect(`/shipments/${shipmentId}?error=invalid`);
  }

  const requiredDocs = jsonParse(
    current.required_document_types_json,
    [] as string[],
  );
  const schemaFromStep = parseStepFieldSchema(current.field_schema_json);
  const legacyRequiredFields = jsonParse(
    current.required_fields_json,
    [] as string[],
  );
  const fieldSchema =
    schemaFromStep.fields.length > 0
      ? schemaFromStep
      : schemaFromLegacyFields(legacyRequiredFields);
  const existingValues = parseStepFieldValues(current.field_values_json);
  const fieldUpdates = extractStepFieldUpdates(formData);
  const fieldRemovals = extractStepFieldRemovals(formData);
  let mergedValues = applyStepFieldUpdates(existingValues, fieldUpdates);
  mergedValues = applyStepFieldRemovals(mergedValues, fieldRemovals);

  const checklistGroups = parseChecklistGroupsJson(current.checklist_groups_json);

  for (const group of checklistGroups) {
    for (const item of group.items ?? []) {
      const dateKey = checklistDateKey(group.name, item.label);
      const raw = formData.get(dateKey);
      if (typeof raw === "string") {
        (mergedValues as Record<string, unknown>)[dateKey] = raw.trim();
      }
    }
  }

  const shipmentGoodsAllocations = collectShipmentGoodsAllocations(
    fieldSchema,
    mergedValues as Record<string, unknown>,
  );

  const checklistUploads: Array<{ documentType: string; file: File }> = [];
  for (const group of checklistGroups) {
    for (const item of group.items ?? []) {
      const fileEntry = formData.get(checklistFileKey(group.name, item.label));
      if (fileEntry instanceof File && fileEntry.size > 0) {
        checklistUploads.push({
          documentType: checklistDocType(group.name, item.label),
          file: fileEntry,
        });
      }
    }
  }

  const fieldUploads = extractStepFieldUploads(formData).map((upload) => {
    const encodedPath = encodeFieldPath(upload.path);
    return {
      file: upload.file,
      documentType: stepFieldDocType(stepId, encodedPath),
      path: upload.path,
    };
  });

  let statusToApply: StepStatus | undefined = status;
  let missingRequirements = false;
  let blockedByException = false;

  const blockingException = queryOne<{ id: number }>(
    `
      SELECT se.id AS id
      FROM shipment_exceptions se
      JOIN exception_types et ON et.id = se.exception_type_id
      WHERE se.shipment_id = ? AND se.status = 'OPEN' AND et.default_risk = 'BLOCKED'
      ORDER BY se.created_at DESC
      LIMIT 1
    `,
    [shipmentId],
  );

  if (blockingException && status !== current.status) {
    blockedByException = true;
    statusToApply = undefined;
  }

  if (statusToApply === "DONE" && status !== current.status) {
    const docs = queryAll<{ document_type: string; is_received: 0 | 1 }>(
      "SELECT document_type, is_received FROM documents WHERE shipment_id = ?",
      [shipmentId],
    );
    const receivedDocTypes = new Set(
      docs.filter((d) => d.is_received).map((d) => String(d.document_type)),
    );
    for (const upload of checklistUploads) {
      receivedDocTypes.add(upload.documentType);
    }
    for (const upload of fieldUploads) {
      receivedDocTypes.add(upload.documentType);
    }
    const missingDocs = requiredDocs.filter((dt) => !receivedDocTypes.has(dt));

    const missingFieldPaths = collectMissingFieldPaths(fieldSchema, {
      stepId,
      values: mergedValues,
      docTypes: receivedDocTypes,
    });

    const missingChecklistGroups = checklistGroups.filter((group) => {
      const items = group.items ?? [];
      if (!items.length) return false;
      const finalItem = getFinalChecklistItem(items);
      const isComplete = (item: { label: string }) => {
        const dateKey = checklistDateKey(group.name, item.label);
        const dateValue = String((mergedValues as Record<string, unknown>)[dateKey] ?? "").trim();
        const docType = checklistDocType(group.name, item.label);
        return !!dateValue && receivedDocTypes.has(docType);
      };
      if (finalItem && isComplete(finalItem)) return false;
      return !items.some((item) => isComplete(item));
    });

    if (missingFieldPaths.size || missingDocs.length || missingChecklistGroups.length) {
      missingRequirements = true;
      statusToApply = undefined;
    }
  }

  const shouldApplyGoodsAllocations =
    statusToApply === "DONE" &&
    status !== current.status &&
    shipmentGoodsAllocations.length > 0;

  const identifiers = extractShipmentIdentifiers(
    collectFlatFieldValues(fieldSchema, mergedValues),
  );
  const checklistUploadResults: Array<{
    documentType: string;
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    sizeBytes: number | null;
  }> = [];
  for (const upload of checklistUploads) {
    const saved = await saveUpload({
      shipmentId,
      file: upload.file,
      filePrefix: upload.documentType,
    });
    checklistUploadResults.push({
      documentType: upload.documentType,
      fileName: saved.fileName,
      storagePath: saved.storagePath,
      mimeType: saved.mimeType ?? null,
      sizeBytes: saved.sizeBytes ?? null,
    });
  }

  const fieldUploadResults: Array<{
    documentType: string;
    fileName: string;
    storagePath: string;
    mimeType: string | null;
    sizeBytes: number | null;
    isRequired: boolean;
  }> = [];
  for (const upload of fieldUploads) {
    const saved = await saveUpload({
      shipmentId,
      file: upload.file,
      filePrefix: upload.documentType,
    });
    fieldUploadResults.push({
      documentType: upload.documentType,
      fileName: saved.fileName,
      storagePath: saved.storagePath,
      mimeType: saved.mimeType ?? null,
      sizeBytes: saved.sizeBytes ?? null,
      isRequired: isFileFieldRequired(fieldSchema, upload.path),
    });
  }

  const db = getDb();
  const updated = inTransaction(db, () => {
    const updatedStep = updateShipmentStep({
      stepId,
      status: statusToApply,
      notes,
      fieldValuesJson: JSON.stringify(mergedValues),
      relatedPartyId,
    });
    if (!updatedStep) return null;

    if (shouldApplyGoodsAllocations) {
      applyShipmentGoodsAllocations(
        {
          shipmentId,
          stepId,
          ownerUserId: user.id,
          allocations: shipmentGoodsAllocations,
        },
        db,
      );
    }

    if (identifiers.containerNumber || identifiers.blNumber) {
      execute(
        `
          UPDATE shipments
          SET
            container_number = COALESCE(?, container_number),
            bl_number = COALESCE(?, bl_number)
          WHERE id = ?
        `,
        [
          identifiers.containerNumber ?? null,
          identifiers.blNumber ?? null,
          shipmentId,
        ],
      );
    }

    const shareChecklistDocs = current.customer_visible === 1 || current.is_external === 1;
    for (const upload of checklistUploadResults) {
      const docId = addDocument({
        shipmentId,
        documentType: upload.documentType,
        fileName: upload.fileName,
        storagePath: upload.storagePath,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        isRequired: true,
        isReceived: true,
        shareWithCustomer: shareChecklistDocs,
        source: "STAFF",
        uploadedByUserId: user.id,
      });

      logActivity({
        shipmentId,
        type: "DOCUMENT_UPLOADED",
        message: `Checklist document uploaded: ${upload.documentType}`,
        actorUserId: user.id,
        data: { docId, documentType: upload.documentType },
      });
    }

    for (const upload of fieldUploadResults) {
      const docId = addDocument({
        shipmentId,
        documentType: upload.documentType,
        fileName: upload.fileName,
        storagePath: upload.storagePath,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
        isRequired: upload.isRequired,
        isReceived: true,
        shareWithCustomer: shareChecklistDocs,
        source: "STAFF",
        uploadedByUserId: user.id,
      });

      logActivity({
        shipmentId,
        type: "DOCUMENT_UPLOADED",
        message: `Field document uploaded: ${upload.documentType}`,
        actorUserId: user.id,
        data: { docId, documentType: upload.documentType },
      });
    }

    logActivity({
      shipmentId,
      type: "STEP_UPDATED",
      message: statusToApply
        ? `Step "${updatedStep.name}" → ${stepStatusLabel(statusToApply)}`
        : blockedByException
          ? `Step "${updatedStep.name}" saved (blocked by exception)`
          : `Step "${updatedStep.name}" requirements saved`,
      actorUserId: user.id,
      data: {
        stepId,
        statusRequested: status,
        statusApplied: statusToApply ?? null,
      },
    });

    return updatedStep;
  });
  if (!updated) redirect(`/shipments/${shipmentId}?error=invalid`);

  refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  if (blockedByException) {
    redirect(`/shipments/${shipmentId}?error=blocked_by_exception&stepId=${stepId}`);
  }

  if (missingRequirements) {
    redirect(
      `/shipments/${shipmentId}?error=missing_requirements&stepId=${stepId}`,
    );
  }

  redirect(`/shipments/${shipmentId}`);
}

export async function updateWorkflowGlobalsAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const shipment = getShipment(shipmentId);
  if (!shipment) redirect(`/shipments/${shipmentId}?error=invalid`);

  const template = shipment.workflow_template_id
    ? getWorkflowTemplate(shipment.workflow_template_id)
    : null;
  const globals = template
    ? parseWorkflowGlobalVariables(template.global_variables_json)
    : [];

  const nextValues: Record<string, string> = {};
  for (const variable of globals) {
    const raw = formData.get(`global:${variable.id}`);
    if (typeof raw === "string") {
      nextValues[variable.id] = raw.trim();
    }
  }

  updateShipmentWorkflowGlobals({
    shipmentId,
    valuesJson: JSON.stringify(nextValues),
    updatedByUserId: user.id,
  });

  refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function addShipmentJobIdsAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const raw = String(formData.get("jobIds") ?? "").trim();
  const jobIds = raw
    ? Array.from(
        new Set(
          raw
            .split(/[,\n\r]+/)
            .map((v) => v.trim())
            .filter(Boolean),
        ),
      ).slice(0, 20)
    : [];
  if (!jobIds.length) redirect(`/shipments/${shipmentId}`);

  const db = getDb();
  const ts = nowIso();
  const inserted: string[] = [];

  inTransaction(db, () => {
    for (const jobId of jobIds) {
      const result = execute(
        `
          INSERT OR IGNORE INTO shipment_job_ids (
            shipment_id, job_id, created_at, created_by_user_id
          ) VALUES (?, ?, ?, ?)
        `,
        [shipmentId, jobId, ts, user.id],
        db,
      );
      if (result.changes > 0) inserted.push(jobId);
    }

    if (inserted.length) {
      logActivity({
        shipmentId,
        type: "JOB_IDS_ADDED",
        message:
          inserted.length === 1
            ? `Job ID added: ${inserted[0]}`
            : `Job IDs added: ${inserted.join(", ")}`,
        actorUserId: user.id,
        data: { jobIds: inserted },
      });
    }
  });

  if (inserted.length) {
    refreshShipmentDerivedState({
      shipmentId,
      actorUserId: user.id,
      updateLastUpdate: true,
    });
  }

  redirect(`/shipments/${shipmentId}`);
}

export async function removeShipmentJobIdAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const jobIdId = Number(formData.get("jobIdId") ?? 0);
  if (!jobIdId) redirect(`/shipments/${shipmentId}?error=invalid`);

  const db = getDb();
  const row = queryOne<{ job_id: string }>(
    "SELECT job_id FROM shipment_job_ids WHERE id = ? AND shipment_id = ? LIMIT 1",
    [jobIdId, shipmentId],
    db,
  );
  if (!row) redirect(`/shipments/${shipmentId}?error=invalid`);

  inTransaction(db, () => {
    execute(
      "DELETE FROM shipment_job_ids WHERE id = ? AND shipment_id = ?",
      [jobIdId, shipmentId],
      db,
    );
    logActivity({
      shipmentId,
      type: "JOB_ID_REMOVED",
      message: `Job ID removed: ${row.job_id}`,
      actorUserId: user.id,
      data: { jobId: row.job_id },
    });
  });

  refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function createGoodAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const name = String(formData.get("name") ?? "").trim();
  const origin = String(formData.get("origin") ?? "").trim();
  const unitType = String(formData.get("unitType") ?? "").trim();
  if (!name || !origin || !unitType) redirect(`/shipments/${shipmentId}?error=invalid`);

  createGood({
    ownerUserId: user.id,
    name,
    origin,
    unitType,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function addShipmentGoodAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const goodId = Number(formData.get("goodId") ?? 0);
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const quantity = quantityRaw ? Number(quantityRaw) : 0;
  const appliesToAllCustomers = String(formData.get("appliesToAllCustomers") ?? "") === "1";
  const customerPartyIdRaw = String(formData.get("customerPartyId") ?? "").trim();
  const customerPartyId =
    appliesToAllCustomers || !customerPartyIdRaw ? null : Number(customerPartyIdRaw);

  if (!goodId || !Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
    redirect(`/shipments/${shipmentId}?error=invalid`);
  }

  const good = getGoodForUser(user.id, goodId);
  if (!good) redirect(`/shipments/${shipmentId}?error=invalid`);

  if (!appliesToAllCustomers && !customerPartyId) {
    redirect(`/shipments/${shipmentId}?error=invalid`);
  }

  if (customerPartyId) {
    const shipmentCustomers = listShipmentCustomers(shipmentId);
    const isShipmentCustomer = shipmentCustomers.some((c) => c.id === customerPartyId);
    if (!isShipmentCustomer) redirect(`/shipments/${shipmentId}?error=invalid`);
  }

  addShipmentGood({
    shipmentId,
    ownerUserId: user.id,
    goodId,
    quantity,
    customerPartyId,
    appliesToAllCustomers,
    createdByUserId: user.id,
  });

  refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function deleteShipmentGoodAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const shipmentGoodId = Number(formData.get("shipmentGoodId") ?? 0);
  if (!shipmentGoodId) redirect(`/shipments/${shipmentId}?error=invalid`);

  const existing = queryOne<{ id: number }>(
    "SELECT id FROM shipment_goods_allocations WHERE shipment_good_id = ? LIMIT 1",
    [shipmentGoodId],
  );
  if (existing) redirect(`/shipments/${shipmentId}?error=goods_allocated`);

  deleteShipmentGood({ shipmentGoodId, ownerUserId: user.id });

  refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function createTaskAction(shipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const title = String(formData.get("title") ?? "").trim();
  const assignee = String(formData.get("assignee") ?? "").trim();
  const dueAt = String(formData.get("dueAt") ?? "").trim() || null;

  let relatedPartyId: number | null = null;
  const relatedPartyIdRaw = String(formData.get("relatedPartyId") ?? "").trim();
  if (relatedPartyIdRaw) {
    const parsed = Number(relatedPartyIdRaw);
    if (!Number.isFinite(parsed)) redirect(`/shipments/${shipmentId}?error=invalid`);
    relatedPartyId = parsed;
  }

  if (!title) redirect(`/shipments/${shipmentId}?error=invalid`);

  inTransaction(getDb(), () => {
    let assigneeUserId: number | null = null;
    let assigneeRole: string | null = null;

    if (assignee.startsWith("user:")) {
      assigneeUserId = Number(assignee.slice("user:".length));
    } else if (assignee.startsWith("role:")) {
      assigneeRole = assignee.slice("role:".length);
    }

    const taskId = createTask({
      shipmentId,
      title,
      relatedPartyId,
      assigneeUserId: Number.isFinite(assigneeUserId) ? assigneeUserId : null,
      assigneeRole,
      dueAt,
      createdByUserId: user.id,
    });

    if (assigneeUserId) {
      grantShipmentAccess(getDb(), {
        shipmentId,
        userId: assigneeUserId,
        grantedByUserId: user.id,
      });
    }
    if (assigneeRole) {
      for (const uid of listActiveUserIdsByRole(assigneeRole as never)) {
        grantShipmentAccess(getDb(), {
          shipmentId,
          userId: uid,
          grantedByUserId: user.id,
        });
      }
    }

    logActivity({
      shipmentId,
      type: "TASK_CREATED",
      message: `Task created: ${title}`,
      actorUserId: user.id,
      data: { taskId },
    });
  });

  refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function updateTaskStatusAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const taskId = Number(formData.get("taskId") ?? 0);
  const status = String(formData.get("status") ?? "") as TaskStatus;

  let relatedPartyId: number | null | undefined = undefined;
  const relatedPartyEntry = formData.get("relatedPartyId");
  if (relatedPartyEntry !== null) {
    const relatedPartyIdRaw = String(relatedPartyEntry).trim();
    if (!relatedPartyIdRaw) {
      relatedPartyId = null;
    } else {
      const parsed = Number(relatedPartyIdRaw);
      if (!Number.isFinite(parsed)) redirect(`/shipments/${shipmentId}?error=invalid`);
      relatedPartyId = parsed;
    }
  }

  if (!taskId || !TaskStatuses.includes(status)) {
    redirect(`/shipments/${shipmentId}?error=invalid`);
  }

  updateTask({
    taskId,
    status,
    relatedPartyId,
  });

  logActivity({
    shipmentId,
    type: "TASK_UPDATED",
    message: `Task updated → ${taskStatusLabel(status)}`,
    actorUserId: user.id,
    data: { taskId, status },
  });

  refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function uploadDocumentAction(shipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const documentType = String(formData.get("documentType") ?? "") as DocumentType;
  const shareWithCustomer = String(formData.get("shareWithCustomer") ?? "") === "1";
  const isRequired = String(formData.get("isRequired") ?? "") === "1";
  const requestIdRaw = String(formData.get("documentRequestId") ?? "").trim();
  const documentRequestId = requestIdRaw ? Number(requestIdRaw) : null;
  const file = formData.get("file");

  if (!file || !(file instanceof File) || !documentType) {
    redirect(`/shipments/${shipmentId}?error=invalid`);
  }

  const upload = await saveUpload({
    shipmentId,
    file,
    filePrefix: documentType,
  });

  inTransaction(getDb(), () => {
    const docId = addDocument({
      shipmentId,
      documentType,
      fileName: upload.fileName,
      storagePath: upload.storagePath,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      isRequired,
      shareWithCustomer,
      source: "STAFF",
      documentRequestId,
      uploadedByUserId: user.id,
    });

    if (documentRequestId) markDocumentRequestFulfilled(documentRequestId);

    logActivity({
      shipmentId,
      type: "DOCUMENT_UPLOADED",
      message: `Document uploaded: ${documentType}`,
      actorUserId: user.id,
      data: { docId, documentType },
    });
  });

  refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function updateDocumentFlagsAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const documentId = Number(formData.get("documentId") ?? 0);
  if (!documentId) redirect(`/shipments/${shipmentId}?error=invalid`);

  const isRequired = String(formData.get("isRequired") ?? "") === "1";
  const shareWithCustomer = String(formData.get("shareWithCustomer") ?? "") === "1";
  const isReceived = String(formData.get("isReceived") ?? "") === "1";

  updateDocumentFlags({
    documentId,
    isRequired,
    isReceived,
    shareWithCustomer,
  });

  logActivity({
    shipmentId,
    type: "DOCUMENT_UPDATED",
    message: "Document flags updated",
    actorUserId: user.id,
    data: { documentId },
  });

  refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function requestDocumentAction(shipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const documentType = String(formData.get("documentType") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim() || null;
  if (!documentType) redirect(`/shipments/${shipmentId}?error=invalid`);

  const requestId = createDocumentRequest({
    shipmentId,
    documentType,
    message,
    requestedByUserId: user.id,
  });

  logActivity({
    shipmentId,
    type: "DOCUMENT_REQUESTED",
    message: `Customer document requested: ${documentType}`,
    actorUserId: user.id,
    data: { requestId, documentType },
  });

  refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function addCommentAction(shipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const message = String(formData.get("message") ?? "").trim();
  if (!message) redirect(`/shipments/${shipmentId}`);

  logActivity({
    shipmentId,
    type: "COMMENT",
    message,
    actorUserId: user.id,
  });

  refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function logExceptionAction(shipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const exceptionTypeId = Number(formData.get("exceptionTypeId") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const customerMessageRaw = String(formData.get("customerMessage") ?? "").trim();
  const informCustomer = String(formData.get("informCustomer") ?? "") === "1";
  if (!exceptionTypeId) redirect(`/shipments/${shipmentId}?error=invalid`);

  inTransaction(getDb(), () => {
    const type = getExceptionType(exceptionTypeId);
    if (!type) return;

    const customerMessage = customerMessageRaw || type.customer_message_template || null;

    const exceptionId = createShipmentException(getDb(), {
      shipmentId,
      exceptionTypeId,
      notes,
      customerMessage,
      shareWithCustomer: informCustomer,
      createdByUserId: user.id,
    });

    const playbookTasks = listExceptionPlaybookTasks(exceptionTypeId);
    for (const pt of playbookTasks) {
      const dueAt =
        pt.due_hours && pt.due_hours > 0
          ? new Date(Date.now() + pt.due_hours * 3600 * 1000).toISOString()
          : null;
      const taskId = createTask({
        shipmentId,
        title: pt.title,
        assigneeRole: pt.owner_role,
        dueAt,
        status: "OPEN",
        linkedExceptionId: exceptionId,
        createdByUserId: user.id,
      });

      for (const uid of listActiveUserIdsByRole(pt.owner_role as never)) {
        grantShipmentAccess(getDb(), {
          shipmentId,
          userId: uid,
          grantedByUserId: user.id,
        });
      }

      logActivity({
        shipmentId,
        type: "TASK_CREATED",
        message: `Exception task created: ${pt.title}`,
        actorUserId: user.id,
        data: { taskId, exceptionId },
      });
    }

    logActivity({
      shipmentId,
      type: "EXCEPTION_LOGGED",
      message: `Exception logged: ${type.name}`,
      actorUserId: user.id,
      data: { exceptionId, exceptionTypeId },
    });
  });

  refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function resolveExceptionAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  requireShipmentAccess(user, shipmentId);

  const exceptionId = Number(formData.get("exceptionId") ?? 0);
  if (!exceptionId) redirect(`/shipments/${shipmentId}?error=invalid`);

  const ex = queryOne<{ shipment_id: number }>(
    "SELECT shipment_id FROM shipment_exceptions WHERE id = ? LIMIT 1",
    [exceptionId],
  );
  if (!ex || ex.shipment_id !== shipmentId) {
    redirect(`/shipments/${shipmentId}?error=invalid`);
  }

  const remaining = queryOne<{ remaining: number }>(
    `
      SELECT COUNT(1) AS remaining
      FROM tasks
      WHERE shipment_id = ? AND linked_exception_id = ? AND status <> 'DONE'
    `,
    [shipmentId, exceptionId],
  );
  if ((remaining?.remaining ?? 0) > 0) {
    redirect(
      `/shipments/${shipmentId}?error=exception_tasks_open&exceptionId=${exceptionId}`,
    );
  }

  resolveShipmentException({ exceptionId, resolvedByUserId: user.id });

  logActivity({
    shipmentId,
    type: "EXCEPTION_RESOLVED",
    message: "Exception resolved",
    actorUserId: user.id,
    data: { exceptionId },
  });

  refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function deleteShipmentAction(shipmentId: number) {
  const user = await requireAdmin();
  requireShipmentAccess(user, shipmentId);

  const existing = getShipment(shipmentId);
  if (!existing) redirect("/shipments?error=invalid");

  deleteShipment(shipmentId);
  try {
    removeShipmentUploads(shipmentId);
  } catch {
    // best-effort cleanup
  }

  redirect("/shipments");
}
