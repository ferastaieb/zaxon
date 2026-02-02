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
  listDocuments,
  markDocumentRequestFulfilled,
  updateDocumentFlags,
} from "@/lib/data/documents";
import {
  createShipmentException,
  getExceptionType,
  listExceptionPlaybookTasks,
  listShipmentExceptions,
  resolveShipmentException,
} from "@/lib/data/exceptions";
import {
  deleteShipment,
  getShipment,
  getShipmentByCode,
  grantShipmentAccess,
  listShipmentJobIds,
  listShipmentCustomers,
  listShipmentSteps,
  updateShipmentWorkflowGlobals,
} from "@/lib/data/shipments";
import { createShipmentLink, deleteShipmentLink } from "@/lib/data/shipmentLinks";
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
import {
  deleteItem,
  getItem,
  nextId,
  nowIso,
  putItem,
  scanAll,
  tableName,
  updateItem,
} from "@/lib/db";
import { canUserAccessShipment, requireShipmentAccess } from "@/lib/permissions";
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
  parseStopCountdownPath,
  parseStepFieldSchema,
  parseStepFieldValues,
  schemaFromLegacyFields,
  stepFieldDocType,
  type StepFieldDefinition,
  type StepFieldSchema,
} from "@/lib/stepFields";
import {
  parseWorkflowGlobalValues,
  parseWorkflowGlobalVariables,
} from "@/lib/workflowGlobals";
import { jsonParse } from "@/lib/sql";
import { removeShipmentUploads, saveUpload } from "@/lib/storage";

function normalizeFieldLabel(label: string) {
  return label
    .toLowerCase()
    .replace(/[_/\\-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SHIPMENT_TAB_IDS = new Set([
  "overview",
  "connections",
  "tracking-steps",
  "operations-steps",
  "container-steps",
  "goods",
  "tasks",
  "documents",
  "exceptions",
  "activity",
]);

function normalizeShipmentTab(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const normalized =
    trimmed === "workflow"
      ? "operations-steps"
      : trimmed === "tracking"
        ? "tracking-steps"
        : trimmed;
  return SHIPMENT_TAB_IDS.has(normalized) ? normalized : null;
}

function appendTabParam(url: string, tab: string | null) {
  if (!tab) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}tab=${encodeURIComponent(tab)}`;
}

async function resolveShipmentId(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  const numericId = Number(trimmed);
  if (Number.isFinite(numericId) && numericId > 0) {
    return numericId;
  }
  const byCode = await getShipmentByCode(trimmed.toUpperCase());
  return byCode?.id ?? null;
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

const COUNTDOWN_FREEZE_KEY = "__countdown_freeze__";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function getValueAtPath(values: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = values;
  for (const segment of path) {
    if (!current) return undefined;
    if (Array.isArray(current)) {
      if (!isNumeric(segment)) return undefined;
      current = current[Number(segment)];
      continue;
    }
    if (!isPlainObject(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function isTruthyBooleanValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function getFreezeMap(values: Record<string, unknown>): Record<string, string> {
  const raw = values[COUNTDOWN_FREEZE_KEY];
  if (!isPlainObject(raw)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (typeof entry === "string") {
      result[key] = entry;
    }
  }
  return result;
}

function applyCountdownFreezeMap(
  fields: StepFieldDefinition[],
  values: Record<string, unknown>,
  freezeMap: Record<string, string>,
  basePath: string[],
  resolveStopValue: (stopPath: string) => unknown,
) {
  const now = nowIso();
  for (const field of fields) {
    const fieldPath = [...basePath, field.id];

    if (
      field.type === "number" &&
      field.linkToGlobal &&
      field.stopCountdownPath
    ) {
      const encodedPath = encodeFieldPath(fieldPath);
      const stopValue = resolveStopValue(field.stopCountdownPath);
      if (isTruthyBooleanValue(stopValue)) {
        if (!freezeMap[encodedPath]) {
          freezeMap[encodedPath] = now;
        }
      } else if (freezeMap[encodedPath]) {
        delete freezeMap[encodedPath];
      }
    }

    if (field.type === "group") {
      const groupValue = values[field.id];
      if (field.repeatable) {
        const items = Array.isArray(groupValue) ? groupValue : [];
        items.forEach((item, index) => {
          if (!isPlainObject(item)) return;
          applyCountdownFreezeMap(
            field.fields,
            item as Record<string, unknown>,
            freezeMap,
            [...fieldPath, String(index)],
            resolveStopValue,
          );
        });
      } else if (isPlainObject(groupValue)) {
        applyCountdownFreezeMap(
          field.fields,
          groupValue as Record<string, unknown>,
          freezeMap,
          fieldPath,
          resolveStopValue,
        );
      }
      continue;
    }

    if (field.type === "choice") {
      const choiceValue = values[field.id];
      if (!isPlainObject(choiceValue)) continue;
      const choiceValues = choiceValue as Record<string, unknown>;
      for (const option of field.options) {
        const optionValue = choiceValues[option.id];
        if (!isPlainObject(optionValue)) continue;
        applyCountdownFreezeMap(
          option.fields,
          optionValue as Record<string, unknown>,
          freezeMap,
          [...fieldPath, option.id],
          resolveStopValue,
        );
      }
    }
  }
}

function applyLinkedGlobalUpdates(
  fields: StepFieldDefinition[],
  values: Record<string, unknown>,
  globals: Record<string, string>,
  allowedGlobalIds: Set<string>,
) {
  const walk = (items: StepFieldDefinition[], current: Record<string, unknown>) => {
    for (const field of items) {
      if (field.type === "date" && field.linkToGlobal) {
        const raw = current[field.id];
        if (typeof raw === "string") {
          const trimmed = raw.trim();
          if (trimmed && allowedGlobalIds.has(field.linkToGlobal)) {
            globals[field.linkToGlobal] = trimmed;
          }
        }
        continue;
      }
      if (field.type === "group") {
        const groupValue = current[field.id];
        if (field.repeatable) {
          const itemsValue = Array.isArray(groupValue) ? groupValue : [];
          for (const item of itemsValue) {
            if (isPlainObject(item)) {
              walk(field.fields, item as Record<string, unknown>);
            }
          }
        } else if (isPlainObject(groupValue)) {
          walk(field.fields, groupValue as Record<string, unknown>);
        }
        continue;
      }
      if (field.type === "choice") {
        const choiceValue = current[field.id];
        if (isPlainObject(choiceValue)) {
          const choiceValues = choiceValue as Record<string, unknown>;
          for (const option of field.options) {
            const optionValue = choiceValues[option.id];
            if (isPlainObject(optionValue)) {
              walk(option.fields, optionValue as Record<string, unknown>);
            }
          }
        }
      }
    }
  };

  walk(fields, values);
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
  await requireShipmentAccess(user, shipmentId);
  const returnTab =
    normalizeShipmentTab(formData.get("tab")) ?? "operations-steps";

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
      if (!Number.isFinite(parsed)) {
        redirect(
          appendTabParam(`/shipments/${shipmentId}?error=invalid`, returnTab),
        );
      }
      relatedPartyId = parsed;
    }
  }

  if (!stepId || !StepStatuses.includes(status)) {
    redirect(appendTabParam(`/shipments/${shipmentId}?error=invalid`, returnTab));
  }

  const current = await getShipmentStep(stepId);
  if (!current || current.shipment_id !== shipmentId) {
    redirect(appendTabParam(`/shipments/${shipmentId}?error=invalid`, returnTab));
  }

  const shipmentRow = await getShipment(shipmentId);
  if (!shipmentRow) {
    redirect(appendTabParam(`/shipments/${shipmentId}?error=invalid`, returnTab));
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
  const freezeMap = getFreezeMap(mergedValues as Record<string, unknown>);
  const allSteps = await listShipmentSteps(shipmentId);
  const stepValuesById = new Map<number, Record<string, unknown>>(
    allSteps.map((step) => [
      step.id,
      parseStepFieldValues(step.field_values_json) as Record<string, unknown>,
    ]),
  );
  const stopValueCache = new Map<number, Record<string, unknown>>([
    [stepId, mergedValues as Record<string, unknown>],
  ]);
  const resolveStopValue = (stopPath: string) => {
    const parsed = parseStopCountdownPath(stopPath);
    if (!parsed) return null;
    const targetStepId = parsed.stepId ?? stepId;
    let source = stopValueCache.get(targetStepId);
    if (!source) {
      source = stepValuesById.get(targetStepId) ?? {};
      stopValueCache.set(targetStepId, source);
    }
    return getValueAtPath(source, parsed.path);
  };
  applyCountdownFreezeMap(
    fieldSchema.fields,
    mergedValues as Record<string, unknown>,
    freezeMap,
    [],
    resolveStopValue,
  );
  (mergedValues as Record<string, unknown>)[COUNTDOWN_FREEZE_KEY] = freezeMap;

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
  let blockedByDependencies = false;

  const blockingException = (await listShipmentExceptions(shipmentId)).find(
    (exception) =>
      exception.status === "OPEN" && exception.default_risk === "BLOCKED",
  );

  if (blockingException && status !== current.status) {
    blockedByException = true;
    statusToApply = undefined;
  }

  const dependencyIds = jsonParse(current.depends_on_step_ids_json, [] as number[]);
  if (dependencyIds.length && status !== current.status) {
    const deps = allSteps.filter((step) => dependencyIds.includes(step.id));
    const unmet = new Set(dependencyIds);
    for (const dep of deps) {
      if (dep.status === "DONE") {
        unmet.delete(dep.id);
      }
    }
    if (unmet.size > 0) {
      blockedByDependencies = true;
      statusToApply = undefined;
    }
  }

  if (statusToApply === "DONE" && status !== current.status) {
    const docs = await listDocuments(shipmentId);
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

  const updatedStep = await updateShipmentStep({
    stepId,
    status: statusToApply,
    notes,
    fieldValuesJson: JSON.stringify(mergedValues),
    relatedPartyId,
  });
  if (!updatedStep) {
    redirect(appendTabParam(`/shipments/${shipmentId}?error=invalid`, returnTab));
  }

  if (allSteps.length) {
    const valuesCache = new Map<number, Record<string, unknown>>();
    for (const row of allSteps) {
      valuesCache.set(
        row.id,
        row.id === stepId
          ? (mergedValues as Record<string, unknown>)
          : (parseStepFieldValues(row.field_values_json) as Record<string, unknown>),
      );
    }
    const resolveStopValue = (stopPath: string) => {
      const parsed = parseStopCountdownPath(stopPath);
      if (!parsed) return null;
      const targetStepId = parsed.stepId ?? stepId;
      const source = valuesCache.get(targetStepId) ?? {};
      return getValueAtPath(source, parsed.path);
    };

    for (const row of allSteps) {
      if (row.id === stepId) continue;
      const schema = parseStepFieldSchema(row.field_schema_json);
      if (!schema.fields.length) continue;
      const values = valuesCache.get(row.id) ?? {};
      const existingFreezeMap = getFreezeMap(values);
      const nextFreezeMap = { ...existingFreezeMap };
      applyCountdownFreezeMap(schema.fields, values, nextFreezeMap, [], resolveStopValue);
      if (JSON.stringify(existingFreezeMap) !== JSON.stringify(nextFreezeMap)) {
        values[COUNTDOWN_FREEZE_KEY] = nextFreezeMap;
        await updateShipmentStep({
          stepId: row.id,
          fieldValuesJson: JSON.stringify(values),
        });
      }
    }
  }

  if (shipmentRow?.workflow_template_id) {
    const template = await getWorkflowTemplate(shipmentRow.workflow_template_id);
    if (template) {
      const globals = parseWorkflowGlobalVariables(template.global_variables_json);
      const allowedGlobalIds = new Set(globals.map((g) => g.id));
      const existingGlobals = parseWorkflowGlobalValues(
        shipmentRow.workflow_global_values_json,
      );
      const nextGlobals = { ...existingGlobals };

      applyLinkedGlobalUpdates(fieldSchema.fields, mergedValues, nextGlobals, allowedGlobalIds);

      if (JSON.stringify(existingGlobals) !== JSON.stringify(nextGlobals)) {
        await updateShipmentWorkflowGlobals({
          shipmentId,
          valuesJson: JSON.stringify(nextGlobals),
          updatedByUserId: user.id,
        });
      }
    }
  }

  if (shouldApplyGoodsAllocations) {
    await applyShipmentGoodsAllocations({
      shipmentId,
      stepId,
      ownerUserId: user.id,
      allocations: shipmentGoodsAllocations,
    });
  }

  if (identifiers.containerNumber || identifiers.blNumber) {
    const updates: string[] = [];
    const values: Record<string, unknown> = {};
    if (identifiers.containerNumber) {
      updates.push("container_number = :container_number");
      values[":container_number"] = identifiers.containerNumber;
    }
    if (identifiers.blNumber) {
      updates.push("bl_number = :bl_number");
      values[":bl_number"] = identifiers.blNumber;
    }
    if (updates.length) {
      await updateItem(
        tableName("shipments"),
        { id: shipmentId },
        `SET ${updates.join(", ")}`,
        values,
      );
    }
  }

  const shareChecklistDocs = current.customer_visible === 1 || current.is_external === 1;
  for (const upload of checklistUploadResults) {
    const docId = await addDocument({
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

    await logActivity({
      shipmentId,
      type: "DOCUMENT_UPLOADED",
      message: `Checklist document uploaded: ${upload.documentType}`,
      actorUserId: user.id,
      data: { docId, documentType: upload.documentType },
    });
  }

  for (const upload of fieldUploadResults) {
    const docId = await addDocument({
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

    await logActivity({
      shipmentId,
      type: "DOCUMENT_UPLOADED",
      message: `Field document uploaded: ${upload.documentType}`,
      actorUserId: user.id,
      data: { docId, documentType: upload.documentType },
    });
  }

  await logActivity({
    shipmentId,
    type: "STEP_UPDATED",
    message: statusToApply
      ? `Step "${updatedStep.name}" -> ${stepStatusLabel(statusToApply)}`
      : blockedByException
        ? `Step "${updatedStep.name}" saved (blocked by exception)`
        : blockedByDependencies
          ? `Step "${updatedStep.name}" saved (blocked by dependencies)`
          : `Step "${updatedStep.name}" requirements saved`,
    actorUserId: user.id,
    data: {
      stepId,
      statusRequested: status,
      statusApplied: statusToApply ?? null,
    },
  });

  await refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  if (blockedByException) {
    redirect(
      appendTabParam(
        `/shipments/${shipmentId}?error=blocked_by_exception&stepId=${stepId}`,
        returnTab,
      ),
    );
  }

  if (blockedByDependencies) {
    redirect(
      appendTabParam(
        `/shipments/${shipmentId}?error=blocked_by_dependencies&stepId=${stepId}`,
        returnTab,
      ),
    );
  }

  if (missingRequirements) {
    redirect(
      appendTabParam(
        `/shipments/${shipmentId}?error=missing_requirements&stepId=${stepId}`,
        returnTab,
      ),
    );
  }

  redirect(appendTabParam(`/shipments/${shipmentId}`, returnTab));
}

export async function updateWorkflowGlobalsAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);
  const returnTab =
    normalizeShipmentTab(formData.get("tab")) ?? "operations-steps";

  const shipment = await getShipment(shipmentId);
  if (!shipment) {
    redirect(appendTabParam(`/shipments/${shipmentId}?error=invalid`, returnTab));
  }

  const template = shipment.workflow_template_id
    ? await getWorkflowTemplate(shipment.workflow_template_id)
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

  await updateShipmentWorkflowGlobals({
    shipmentId,
    valuesJson: JSON.stringify(nextValues),
    updatedByUserId: user.id,
  });

  await refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(appendTabParam(`/shipments/${shipmentId}`, returnTab));
}

export async function addShipmentJobIdsAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);

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

  const existing = await listShipmentJobIds(shipmentId);
  const existingSet = new Set(existing.map((row) => row.job_id));
  const inserted: string[] = [];

  for (const jobId of jobIds) {
    if (existingSet.has(jobId)) continue;
    const id = await nextId("shipment_job_ids");
    await putItem(tableName("shipment_job_ids"), {
      id,
      shipment_id: shipmentId,
      job_id: jobId,
      created_at: nowIso(),
      created_by_user_id: user.id,
    });
    inserted.push(jobId);
  }

  if (inserted.length) {
    await logActivity({
      shipmentId,
      type: "JOB_IDS_ADDED",
      message:
        inserted.length === 1
          ? `Job ID added: ${inserted[0]}`
          : `Job IDs added: ${inserted.join(", ")}`,
      actorUserId: user.id,
      data: { jobIds: inserted },
    });

    await refreshShipmentDerivedState({
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
  await requireShipmentAccess(user, shipmentId);

  const jobIdId = Number(formData.get("jobIdId") ?? 0);
  if (!jobIdId) redirect(`/shipments/${shipmentId}?error=invalid`);

  const row = await getItem<{ job_id: string; shipment_id: number }>(
    tableName("shipment_job_ids"),
    { id: jobIdId },
  );
  if (!row || row.shipment_id !== shipmentId) {
    redirect(`/shipments/${shipmentId}?error=invalid`);
  }

  await deleteItem(tableName("shipment_job_ids"), { id: jobIdId });
  await logActivity({
    shipmentId,
    type: "JOB_ID_REMOVED",
    message: `Job ID removed: ${row.job_id}`,
    actorUserId: user.id,
    data: { jobId: row.job_id },
  });

  await refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}
export async function createShipmentLinkAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);
  const connectedRaw = String(formData.get("connectedShipment") ?? "");
  const connectedShipmentId = await resolveShipmentId(connectedRaw);
  if (!connectedShipmentId || connectedShipmentId === shipmentId) {
    redirect(`/shipments/${shipmentId}?error=invalid`);
  }
  if (!(await canUserAccessShipment(user, connectedShipmentId))) {
    redirect("/forbidden");
  }
  const currentCustomers = (await listShipmentCustomers(shipmentId)).map((c) => c.id);
  const otherCustomers = (await listShipmentCustomers(connectedShipmentId)).map((c) => c.id);
  const hasSharedCustomer = currentCustomers.some((id) =>
    otherCustomers.includes(id),
  );
  if (!hasSharedCustomer) {
    redirect(`/shipments/${shipmentId}?error=invalid`);
  }

  const shipmentLabel = String(formData.get("shipmentLabel") ?? "").trim();
  const connectedLabel = String(formData.get("connectedLabel") ?? "").trim();

  await createShipmentLink({
    shipmentId,
    connectedShipmentId,
    shipmentLabel: shipmentLabel || null,
    connectedLabel: connectedLabel || null,
    createdByUserId: user.id,
  });
  await refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: false,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function deleteShipmentLinkAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);

  const connectedShipmentId = Number(formData.get("connectedShipmentId") ?? 0);
  if (!connectedShipmentId) redirect(`/shipments/${shipmentId}?error=invalid`);

  if (!(await canUserAccessShipment(user, connectedShipmentId))) {
    redirect("/forbidden");
  }
  await deleteShipmentLink({ shipmentId, connectedShipmentId });
  await refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: false,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function createGoodAction(
  shipmentId: number,
  formData: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);

  const name = String(formData.get("name") ?? "").trim();
  const origin = String(formData.get("origin") ?? "").trim();
  const unitType = String(formData.get("unitType") ?? "").trim();
  if (!name || !origin || !unitType) redirect(`/shipments/${shipmentId}?error=invalid`);

  await createGood({
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
  await requireShipmentAccess(user, shipmentId);

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

  const good = await getGoodForUser(user.id, goodId);
  if (!good) redirect(`/shipments/${shipmentId}?error=invalid`);

  if (!appliesToAllCustomers && !customerPartyId) {
    redirect(`/shipments/${shipmentId}?error=invalid`);
  }

  if (customerPartyId) {
    const shipmentCustomers = await listShipmentCustomers(shipmentId);
    const isShipmentCustomer = shipmentCustomers.some((c) => c.id === customerPartyId);
    if (!isShipmentCustomer) redirect(`/shipments/${shipmentId}?error=invalid`);
  }
  await addShipmentGood({
    shipmentId,
    ownerUserId: user.id,
    goodId,
    quantity,
    customerPartyId,
    appliesToAllCustomers,
    createdByUserId: user.id,
  });
  await refreshShipmentDerivedState({
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
  await requireShipmentAccess(user, shipmentId);

  const shipmentGoodId = Number(formData.get("shipmentGoodId") ?? 0);
  if (!shipmentGoodId) redirect(`/shipments/${shipmentId}?error=invalid`);

  const allocations = await scanAll<{ shipment_good_id: number }>(
    tableName("shipment_goods_allocations"),
    {
      filterExpression: "shipment_good_id = :shipment_good_id",
      expressionValues: { ":shipment_good_id": shipmentGoodId },
      limit: 1,
    },
  );
  if (allocations.length) redirect(`/shipments/${shipmentId}?error=goods_allocated`);
  await deleteShipmentGood({ shipmentGoodId, ownerUserId: user.id });
  await refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function createTaskAction(shipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);

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
  let assigneeUserId: number | null = null;
  let assigneeRole: string | null = null;
  if (assignee.startsWith("user:")) {
    const parsed = Number(assignee.slice("user:".length));
    assigneeUserId = Number.isFinite(parsed) ? parsed : null;
  } else if (assignee.startsWith("role:")) {
    assigneeRole = assignee.slice("role:".length);
  }
  const taskId = await createTask({
    shipmentId,
    title,
    relatedPartyId,
    assigneeUserId,
    assigneeRole,
    dueAt,
    createdByUserId: user.id,
  });
  if (assigneeUserId) {
    await grantShipmentAccess({
      shipmentId,
      userId: assigneeUserId,
      grantedByUserId: user.id,
    });
  }
  if (assigneeRole) {
    for (const uid of await listActiveUserIdsByRole(assigneeRole as never)) {
      await grantShipmentAccess({
        shipmentId,
        userId: uid,
        grantedByUserId: user.id,
      });
    }
  }
  await logActivity({
    shipmentId,
    type: "TASK_CREATED",
    message: `Task created: ${title}`,
    actorUserId: user.id,
    data: { taskId },
  });
  await refreshShipmentDerivedState({
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
  await requireShipmentAccess(user, shipmentId);

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

  await updateTask({
    taskId,
    status,
    relatedPartyId,
  });

  await logActivity({
    shipmentId,
    type: "TASK_UPDATED",
    message: `Task updated → ${taskStatusLabel(status)}`,
    actorUserId: user.id,
    data: { taskId, status },
  });

  await refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function uploadDocumentAction(shipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);

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

  const docId = await addDocument({
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

  if (documentRequestId) {
    await markDocumentRequestFulfilled(documentRequestId);
  }

  await logActivity({
    shipmentId,
    type: "DOCUMENT_UPLOADED",
    message: `Document uploaded: ${documentType}`,
    actorUserId: user.id,
    data: { docId, documentType },
  });

  await refreshShipmentDerivedState({
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
  await requireShipmentAccess(user, shipmentId);

  const documentId = Number(formData.get("documentId") ?? 0);
  if (!documentId) redirect(`/shipments/${shipmentId}?error=invalid`);

  const isRequired = String(formData.get("isRequired") ?? "") === "1";
  const shareWithCustomer = String(formData.get("shareWithCustomer") ?? "") === "1";
  const isReceived = String(formData.get("isReceived") ?? "") === "1";

  await updateDocumentFlags({
    documentId,
    isRequired,
    isReceived,
    shareWithCustomer,
  });

  await logActivity({
    shipmentId,
    type: "DOCUMENT_UPDATED",
    message: "Document flags updated",
    actorUserId: user.id,
    data: { documentId },
  });

  await refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function requestDocumentAction(
  shipmentId: number,
  documentTypeOrFormData: string | FormData,
  maybeFormData?: FormData,
) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);
  const formData =
    documentTypeOrFormData instanceof FormData
      ? documentTypeOrFormData
      : maybeFormData instanceof FormData
        ? maybeFormData
        : null;
  let documentType =
    typeof documentTypeOrFormData === "string"
      ? documentTypeOrFormData.trim()
      : "";
  const message = formData
    ? String(formData.get("message") ?? "").trim() || null
    : null;
  if (formData && !documentType) {
    documentType = String(formData.get("documentType") ?? "").trim();
  }
  if (!documentType) redirect(`/shipments/${shipmentId}?error=invalid`);

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

  redirect(`/shipments/${shipmentId}`);
}

export async function addCommentAction(shipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);

  const message = String(formData.get("message") ?? "").trim();
  if (!message) redirect(`/shipments/${shipmentId}`);

  await logActivity({
    shipmentId,
    type: "COMMENT",
    message,
    actorUserId: user.id,
  });

  await refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function logExceptionAction(shipmentId: number, formData: FormData) {
  const user = await requireUser();
  assertCanWrite(user);
  await requireShipmentAccess(user, shipmentId);

  const exceptionTypeId = Number(formData.get("exceptionTypeId") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const customerMessageRaw = String(formData.get("customerMessage") ?? "").trim();
  const informCustomer = String(formData.get("informCustomer") ?? "") === "1";
  if (!exceptionTypeId) redirect(`/shipments/${shipmentId}?error=invalid`);

  const type = await getExceptionType(exceptionTypeId);
  if (!type) {
    redirect(`/shipments/${shipmentId}?error=invalid`);
  }

  const customerMessage = customerMessageRaw || type.customer_message_template || null;

  const exceptionId = await createShipmentException({
    shipmentId,
    exceptionTypeId,
    notes,
    customerMessage,
    shareWithCustomer: informCustomer,
    createdByUserId: user.id,
  });

  const playbookTasks = await listExceptionPlaybookTasks(exceptionTypeId);
  for (const pt of playbookTasks) {
    const dueAt =
      pt.due_hours && pt.due_hours > 0
        ? new Date(Date.now() + pt.due_hours * 3600 * 1000).toISOString()
        : null;
    const taskId = await createTask({
      shipmentId,
      title: pt.title,
      assigneeRole: pt.owner_role,
      dueAt,
      status: "OPEN",
      linkedExceptionId: exceptionId,
      createdByUserId: user.id,
    });

    for (const uid of await listActiveUserIdsByRole(pt.owner_role as never)) {
      await grantShipmentAccess({
        shipmentId,
        userId: uid,
        grantedByUserId: user.id,
      });
    }

    await logActivity({
      shipmentId,
      type: "TASK_CREATED",
      message: `Exception task created: ${pt.title}`,
      actorUserId: user.id,
      data: { taskId, exceptionId },
    });
  }

  await logActivity({
    shipmentId,
    type: "EXCEPTION_LOGGED",
    message: `Exception logged: ${type.name}`,
    actorUserId: user.id,
    data: { exceptionId, exceptionTypeId },
  });

  await refreshShipmentDerivedState({
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
  await requireShipmentAccess(user, shipmentId);

  const exceptionId = Number(formData.get("exceptionId") ?? 0);
  if (!exceptionId) redirect(`/shipments/${shipmentId}?error=invalid`);

  const ex = await getItem<{ shipment_id: number }>(
    tableName("shipment_exceptions"),
    { id: exceptionId },
  );
  if (!ex || ex.shipment_id !== shipmentId) {
    redirect(`/shipments/${shipmentId}?error=invalid`);
  }

  const remaining = await scanAll<{ id: number }>(tableName("tasks"), {
    filterExpression:
      "shipment_id = :shipment_id AND linked_exception_id = :exception_id AND #status <> :done",
    expressionNames: { "#status": "status" },
    expressionValues: {
      ":shipment_id": shipmentId,
      ":exception_id": exceptionId,
      ":done": "DONE",
    },
    limit: 1,
  });
  if (remaining.length > 0) {
    redirect(
      `/shipments/${shipmentId}?error=exception_tasks_open&exceptionId=${exceptionId}`,
    );
  }

  await resolveShipmentException({ exceptionId, resolvedByUserId: user.id });

  await logActivity({
    shipmentId,
    type: "EXCEPTION_RESOLVED",
    message: "Exception resolved",
    actorUserId: user.id,
    data: { exceptionId },
  });

  await refreshShipmentDerivedState({
    shipmentId,
    actorUserId: user.id,
    updateLastUpdate: true,
  });

  redirect(`/shipments/${shipmentId}`);
}

export async function deleteShipmentAction(shipmentId: number) {
  const user = await requireAdmin();
  await requireShipmentAccess(user, shipmentId);

  const existing = await getShipment(shipmentId);
  if (!existing) redirect("/shipments?error=invalid");

  await deleteShipment(shipmentId);
  try {
    await removeShipmentUploads(shipmentId);
  } catch {
    // best-effort cleanup
  }

  redirect("/shipments");
}
