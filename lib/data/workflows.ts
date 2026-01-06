import "server-only";

import type { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";

import type { Role, ShipmentType, TransportMode } from "@/lib/domain";
import { getDb, inTransaction, nowIso } from "@/lib/db";
import type { ChecklistGroup } from "@/lib/checklists";
import { execute, jsonParse, queryAll, queryOne } from "@/lib/sql";
import { mapStopCountdownPaths, parseStepFieldSchema } from "@/lib/stepFields";

export type WorkflowTemplateRow = {
  id: number;
  name: string;
  description: string | null;
  is_archived: 0 | 1;
  is_subworkflow: 0 | 1;
  global_variables_json: string;
  created_at: string;
  created_by_user_id: number | null;
  updated_at: string;
  updated_by_user_id: number | null;
};

export type WorkflowTemplateStepRow = {
  id: number;
  template_id: number;
  sort_order: number;
  name: string;
  owner_role: Role;
  required_fields_json: string;
  required_document_types_json: string;
  sla_hours: number | null;
  customer_visible: 0 | 1;
  is_external: 0 | 1;
  checklist_groups_json: string;
  field_schema_json: string;
  depends_on_step_ids_json: string;
  group_id: string | null;
  group_label: string | null;
  group_template_id: number | null;
  customer_completion_message_template: string | null;
  created_at: string;
  updated_at: string;
};

export type TemplateRuleRow = {
  id: number;
  template_id: number;
  transport_mode: TransportMode | null;
  origin: string | null;
  destination: string | null;
  shipment_type: ShipmentType | null;
  customer_party_id: number | null;
  created_at: string;
  created_by_user_id: number | null;
};

export function listWorkflowTemplates(input?: { includeArchived?: boolean; isSubworkflow?: boolean }) {
  const db = getDb();
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (!input?.includeArchived) {
    where.push("is_archived = 0");
  }
  if (input?.isSubworkflow !== undefined) {
    where.push("is_subworkflow = ?");
    params.push(input.isSubworkflow ? 1 : 0);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return queryAll<WorkflowTemplateRow>(
    `
      SELECT *
      FROM workflow_templates
      ${whereSql}
      ORDER BY updated_at DESC
    `,
    params,
    db,
  );
}

export function getWorkflowTemplate(
  templateId: number,
  db: DatabaseSync = getDb(),
) {
  return queryOne<WorkflowTemplateRow>(
    "SELECT * FROM workflow_templates WHERE id = ? LIMIT 1",
    [templateId],
    db,
  );
}

export function createWorkflowTemplate(input: {
  name: string;
  description?: string | null;
  isSubworkflow?: boolean;
  globalVariablesJson?: string;
  createdByUserId?: number | null;
}) {
  const db = getDb();
  const ts = nowIso();
  const result = execute(
    `
      INSERT INTO workflow_templates (
        name, description, is_archived, is_subworkflow, global_variables_json,
        created_at, created_by_user_id,
        updated_at, updated_by_user_id
      )
      VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.name,
      input.description ?? null,
      input.isSubworkflow ? 1 : 0,
      input.globalVariablesJson ?? "[]",
      ts,
      input.createdByUserId ?? null,
      ts,
      input.createdByUserId ?? null,
    ],
    db,
  );
  return result.lastInsertRowid;
}

export function updateWorkflowTemplate(input: {
  id: number;
  name: string;
  description?: string | null;
  isArchived?: boolean;
  isSubworkflow?: boolean;
  globalVariablesJson?: string;
  updatedByUserId?: number | null;
}) {
  const db = getDb();
  execute(
    `
      UPDATE workflow_templates
      SET name = ?,
          description = ?,
          is_archived = ?,
          is_subworkflow = ?,
          global_variables_json = ?,
          updated_at = ?,
          updated_by_user_id = ?
      WHERE id = ?
    `,
    [
      input.name,
      input.description ?? null,
      input.isArchived ? 1 : 0,
      input.isSubworkflow ? 1 : 0,
      input.globalVariablesJson ?? "[]",
      nowIso(),
      input.updatedByUserId ?? null,
      input.id,
    ],
    db,
  );
}

export function listTemplateSteps(templateId: number) {
  const db = getDb();
  return queryAll<WorkflowTemplateStepRow>(
    `
      SELECT *
      FROM workflow_template_steps
      WHERE template_id = ?
      ORDER BY sort_order ASC
    `,
    [templateId],
    db,
  );
}

export function addTemplateStep(input: {
  templateId: number;
  name: string;
  ownerRole: Role;
  requiredFields?: string[];
  requiredDocumentTypes?: string[];
  fieldSchemaJson?: string;
  slaHours?: number | null;
  customerVisible?: boolean;
  isExternal?: boolean;
  checklistGroups?: ChecklistGroup[];
  dependsOnStepIds?: number[];
  groupId?: string | null;
  groupLabel?: string | null;
  groupTemplateId?: number | null;
  customerCompletionMessageTemplate?: string | null;
}) {
  const db = getDb();
  const ts = nowIso();
  const row = queryOne<{ max_order: number | null }>(
    "SELECT MAX(sort_order) AS max_order FROM workflow_template_steps WHERE template_id = ?",
    [input.templateId],
    db,
  );
  const nextOrder = (row?.max_order ?? 0) + 1;

  const result = execute(
    `
      INSERT INTO workflow_template_steps (
        template_id, sort_order, name, owner_role,
        required_fields_json, required_document_types_json,
        sla_hours, customer_visible, is_external, checklist_groups_json,
        field_schema_json, depends_on_step_ids_json, group_id, group_label, group_template_id,
        customer_completion_message_template,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.templateId,
      nextOrder,
      input.name,
      input.ownerRole,
      JSON.stringify(input.requiredFields ?? []),
      JSON.stringify(input.requiredDocumentTypes ?? []),
      input.slaHours ?? null,
      input.customerVisible ? 1 : 0,
      input.isExternal ? 1 : 0,
      JSON.stringify(input.checklistGroups ?? []),
      input.fieldSchemaJson ?? "{}",
      JSON.stringify(input.dependsOnStepIds ?? []),
      input.groupId ?? null,
      input.groupLabel ?? null,
      input.groupTemplateId ?? null,
      input.customerCompletionMessageTemplate ?? null,
      ts,
      ts,
    ],
    db,
  );

  return result.lastInsertRowid;
}

export function updateTemplateStep(input: {
  stepId: number;
  name: string;
  ownerRole: Role;
  requiredFields?: string[];
  requiredDocumentTypes?: string[];
  fieldSchemaJson?: string;
  slaHours?: number | null;
  customerVisible?: boolean;
  isExternal?: boolean;
  checklistGroups?: ChecklistGroup[];
  dependsOnStepIds?: number[];
  customerCompletionMessageTemplate?: string | null;
}) {
  const db = getDb();
  execute(
    `
      UPDATE workflow_template_steps
      SET name = ?,
          owner_role = ?,
          required_fields_json = ?,
          required_document_types_json = ?,
          sla_hours = ?,
          customer_visible = ?,
          is_external = ?,
          checklist_groups_json = ?,
          field_schema_json = ?,
          depends_on_step_ids_json = ?,
          customer_completion_message_template = ?,
          updated_at = ?
      WHERE id = ?
    `,
    [
      input.name,
      input.ownerRole,
      JSON.stringify(input.requiredFields ?? []),
      JSON.stringify(input.requiredDocumentTypes ?? []),
      input.slaHours ?? null,
      input.customerVisible ? 1 : 0,
      input.isExternal ? 1 : 0,
      JSON.stringify(input.checklistGroups ?? []),
      input.fieldSchemaJson ?? "{}",
      JSON.stringify(input.dependsOnStepIds ?? []),
      input.customerCompletionMessageTemplate ?? null,
      nowIso(),
      input.stepId,
    ],
    db,
  );
}

export function addSubworkflowSteps(input: {
  templateId: number;
  subworkflowTemplateId: number;
  groupId?: string;
  groupLabel?: string;
}) {
  const db = getDb();
  const subworkflow = getWorkflowTemplate(input.subworkflowTemplateId, db);
  if (!subworkflow) return null;

  const steps = listTemplateSteps(input.subworkflowTemplateId);
  if (!steps.length) return null;

  const ts = nowIso();
  const groupId = input.groupId ?? crypto.randomUUID();
  const groupLabel = input.groupLabel ?? subworkflow.name;

  const row = queryOne<{ max_order: number | null }>(
    "SELECT MAX(sort_order) AS max_order FROM workflow_template_steps WHERE template_id = ?",
    [input.templateId],
    db,
  );
  let nextOrder = (row?.max_order ?? 0) + 1;
  const stepIdMap = new Map<number, number>();

  for (const step of steps) {
    const inserted = execute(
      `
        INSERT INTO workflow_template_steps (
          template_id, sort_order, name, owner_role,
          required_fields_json, required_document_types_json,
          sla_hours, customer_visible, is_external, checklist_groups_json,
          field_schema_json, depends_on_step_ids_json, group_id, group_label, group_template_id,
          customer_completion_message_template,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.templateId,
        nextOrder,
        step.name,
        step.owner_role,
        step.required_fields_json,
        step.required_document_types_json,
        step.sla_hours ?? null,
        step.customer_visible,
        step.is_external,
        step.checklist_groups_json,
        step.field_schema_json ?? "{}",
        step.depends_on_step_ids_json ?? "[]",
        groupId,
        groupLabel,
        input.subworkflowTemplateId,
        step.customer_completion_message_template ?? null,
        ts,
        ts,
      ],
      db,
    );
    const insertedId = inserted.lastInsertRowid;
    if (insertedId) {
      stepIdMap.set(step.id, insertedId);
    }
    nextOrder += 1;
  }

  if (stepIdMap.size) {
    for (const step of steps) {
      const mappedId = stepIdMap.get(step.id);
      if (!mappedId) continue;
      const rawDeps = jsonParse(step.depends_on_step_ids_json, [] as number[]);
      if (!rawDeps.length) continue;
      const mappedDeps = rawDeps
        .map((id) => stepIdMap.get(id))
        .filter((id): id is number => !!id);
      execute(
        "UPDATE workflow_template_steps SET depends_on_step_ids_json = ? WHERE id = ?",
        [JSON.stringify(mappedDeps), mappedId],
        db,
      );
    }
    for (const step of steps) {
      const mappedId = stepIdMap.get(step.id);
      if (!mappedId) continue;
      const schema = parseStepFieldSchema(step.field_schema_json);
      if (!schema.fields.length) continue;
      const mappedSchema = mapStopCountdownPaths(schema, (id) => stepIdMap.get(id) ?? null);
      if (JSON.stringify(schema) !== JSON.stringify(mappedSchema)) {
        execute(
          "UPDATE workflow_template_steps SET field_schema_json = ? WHERE id = ?",
          [JSON.stringify(mappedSchema), mappedId],
          db,
        );
      }
    }
  }

  return groupId;
}

export function deleteTemplateStepGroup(input: { templateId: number; groupId: string }) {
  const db = getDb();
  execute(
    "DELETE FROM workflow_template_steps WHERE template_id = ? AND group_id = ?",
    [input.templateId, input.groupId],
    db,
  );
}

export function deleteTemplateStep(stepId: number) {
  const db = getDb();
  execute("DELETE FROM workflow_template_steps WHERE id = ?", [stepId], db);
}

export function moveTemplateStep(input: { templateId: number; stepId: number; dir: "up" | "down" }) {
  const db = getDb();
  const steps = queryAll<{ id: number; sort_order: number }>(
    `
      SELECT id, sort_order
      FROM workflow_template_steps
      WHERE template_id = ?
      ORDER BY sort_order ASC
    `,
    [input.templateId],
    db,
  );
  const idx = steps.findIndex((s) => s.id === input.stepId);
  if (idx === -1) return;
  const swapWith = input.dir === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= steps.length) return;

  const a = steps[idx]!;
  const b = steps[swapWith]!;
  const maxOrder = steps.reduce((max, step) => Math.max(max, step.sort_order), 0);
  const tempOrder = maxOrder + 1000;

  inTransaction(db, () => {
    execute(
      "UPDATE workflow_template_steps SET sort_order = ?, updated_at = ? WHERE id = ?",
      [tempOrder, nowIso(), a.id],
      db,
    );
    execute(
      "UPDATE workflow_template_steps SET sort_order = ?, updated_at = ? WHERE id = ?",
      [a.sort_order, nowIso(), b.id],
      db,
    );
    execute(
      "UPDATE workflow_template_steps SET sort_order = ?, updated_at = ? WHERE id = ?",
      [b.sort_order, nowIso(), a.id],
      db,
    );
  });
}

export function listTemplateRules() {
  const db = getDb();
  return queryAll<
    TemplateRuleRow & {
      template_name: string;
      customer_name: string | null;
    }
  >(
    `
      SELECT
        r.*,
        t.name AS template_name,
        c.name AS customer_name
      FROM template_rules r
      JOIN workflow_templates t ON t.id = r.template_id
      LEFT JOIN parties c ON c.id = r.customer_party_id
      ORDER BY r.id DESC
    `,
    [],
    db,
  );
}

export function createTemplateRule(input: {
  templateId: number;
  transportMode?: TransportMode | null;
  origin?: string | null;
  destination?: string | null;
  shipmentType?: ShipmentType | null;
  customerPartyId?: number | null;
  createdByUserId?: number | null;
}) {
  const db = getDb();
  const result = execute(
    `
      INSERT INTO template_rules (
        template_id, transport_mode, origin, destination, shipment_type, customer_party_id,
        created_at, created_by_user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.templateId,
      input.transportMode ?? null,
      input.origin ?? null,
      input.destination ?? null,
      input.shipmentType ?? null,
      input.customerPartyId ?? null,
      nowIso(),
      input.createdByUserId ?? null,
    ],
    db,
  );
  return result.lastInsertRowid;
}

export function deleteTemplateRule(ruleId: number) {
  const db = getDb();
  execute("DELETE FROM template_rules WHERE id = ?", [ruleId], db);
}

export function getWorkflowTemplateUsage(templateId: number) {
  const db = getDb();
  const shipment = queryOne<{ id: number }>(
    "SELECT id FROM shipments WHERE workflow_template_id = ? LIMIT 1",
    [templateId],
    db,
  );
  const stepGroup = queryOne<{ id: number }>(
    "SELECT id FROM workflow_template_steps WHERE group_template_id = ? LIMIT 1",
    [templateId],
    db,
  );
  return {
    hasShipments: !!shipment,
    usedAsSubworkflow: !!stepGroup,
  };
}

export function deleteWorkflowTemplate(templateId: number) {
  const db = getDb();
  execute("DELETE FROM workflow_templates WHERE id = ?", [templateId], db);
}

export function suggestTemplate(input: {
  transportMode: TransportMode;
  origin: string;
  destination: string;
  shipmentType: ShipmentType;
  customerPartyId: number;
}) {
  const db = getDb();
  const match = queryOne<{ template_id: number }>(
    `
      SELECT
        r.template_id,
        (
          (CASE WHEN r.transport_mode IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN r.origin IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN r.destination IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN r.shipment_type IS NOT NULL THEN 1 ELSE 0 END) +
          (CASE WHEN r.customer_party_id IS NOT NULL THEN 1 ELSE 0 END)
        ) AS score
      FROM template_rules r
      JOIN workflow_templates t ON t.id = r.template_id AND t.is_archived = 0
      WHERE (r.transport_mode IS NULL OR r.transport_mode = ?)
        AND (r.origin IS NULL OR LOWER(r.origin) = LOWER(?))
        AND (r.destination IS NULL OR LOWER(r.destination) = LOWER(?))
        AND (r.shipment_type IS NULL OR r.shipment_type = ?)
        AND (r.customer_party_id IS NULL OR r.customer_party_id = ?)
      ORDER BY score DESC, r.id DESC
      LIMIT 1
    `,
    [
      input.transportMode,
      input.origin.trim(),
      input.destination.trim(),
      input.shipmentType,
      input.customerPartyId,
    ],
    db,
  );

  if (!match) return null;
  return getWorkflowTemplate(match.template_id, db);
}

export function parseRequiredFields(step: WorkflowTemplateStepRow): string[] {
  return jsonParse(step.required_fields_json, [] as string[]);
}

export function parseRequiredDocumentTypes(step: WorkflowTemplateStepRow): string[] {
  return jsonParse(step.required_document_types_json, [] as string[]);
}
