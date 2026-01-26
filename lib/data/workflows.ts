import "server-only";

import crypto from "node:crypto";

import type { Role, ShipmentType } from "@/lib/domain";
import type { ChecklistGroup } from "@/lib/checklists";
import { mapStopCountdownPaths, parseStepFieldSchema } from "@/lib/stepFields";
import { jsonParse } from "@/lib/sql";
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
  transport_mode: string | null;
  origin: string | null;
  destination: string | null;
  shipment_type: ShipmentType | null;
  customer_party_id: number | null;
  created_at: string;
  created_by_user_id: number | null;
};

const WORKFLOW_TEMPLATES_TABLE = tableName("workflow_templates");
const WORKFLOW_TEMPLATE_STEPS_TABLE = tableName("workflow_template_steps");
const TEMPLATE_RULES_TABLE = tableName("template_rules");
const SHIPMENTS_TABLE = tableName("shipments");
const PARTIES_TABLE = tableName("parties");

export async function listWorkflowTemplates(input?: {
  includeArchived?: boolean;
  isSubworkflow?: boolean;
}) {
  const rows = await scanAll<WorkflowTemplateRow>(WORKFLOW_TEMPLATES_TABLE);
  return rows
    .filter((row) => (input?.includeArchived ? true : row.is_archived === 0))
    .filter((row) =>
      input?.isSubworkflow === undefined
        ? true
        : row.is_subworkflow === (input.isSubworkflow ? 1 : 0),
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getWorkflowTemplate(templateId: number) {
  return await getItem<WorkflowTemplateRow>(WORKFLOW_TEMPLATES_TABLE, {
    id: templateId,
  });
}

export async function createWorkflowTemplate(input: {
  name: string;
  description?: string | null;
  isSubworkflow?: boolean;
  globalVariablesJson?: string;
  createdByUserId?: number | null;
}) {
  const ts = nowIso();
  const id = await nextId("workflow_templates");
  await putItem(WORKFLOW_TEMPLATES_TABLE, {
    id,
    name: input.name,
    description: input.description ?? null,
    is_archived: 0,
    is_subworkflow: input.isSubworkflow ? 1 : 0,
    global_variables_json: input.globalVariablesJson ?? "[]",
    created_at: ts,
    created_by_user_id: input.createdByUserId ?? null,
    updated_at: ts,
    updated_by_user_id: input.createdByUserId ?? null,
  });
  return id;
}

export async function updateWorkflowTemplate(input: {
  id: number;
  name: string;
  description?: string | null;
  isArchived?: boolean;
  isSubworkflow?: boolean;
  globalVariablesJson?: string;
  updatedByUserId?: number | null;
}) {
  await updateItem<WorkflowTemplateRow>(
    WORKFLOW_TEMPLATES_TABLE,
    { id: input.id },
    "SET #name = :name, description = :description, is_archived = :is_archived, is_subworkflow = :is_subworkflow, global_variables_json = :global_variables_json, updated_at = :updated_at, updated_by_user_id = :updated_by_user_id",
    {
      ":name": input.name,
      ":description": input.description ?? null,
      ":is_archived": input.isArchived ? 1 : 0,
      ":is_subworkflow": input.isSubworkflow ? 1 : 0,
      ":global_variables_json": input.globalVariablesJson ?? "[]",
      ":updated_at": nowIso(),
      ":updated_by_user_id": input.updatedByUserId ?? null,
    },
    { "#name": "name" },
  );
}

export async function listTemplateSteps(templateId: number) {
  const rows = await scanAll<WorkflowTemplateStepRow>(WORKFLOW_TEMPLATE_STEPS_TABLE);
  return rows
    .filter((row) => row.template_id === templateId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function addTemplateStep(input: {
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
  const rows = await listTemplateSteps(input.templateId);
  const maxOrder = rows.reduce((max, row) => Math.max(max, row.sort_order), 0);
  const nextOrder = maxOrder + 1;
  const ts = nowIso();
  const id = await nextId("workflow_template_steps");

  await putItem(WORKFLOW_TEMPLATE_STEPS_TABLE, {
    id,
    template_id: input.templateId,
    sort_order: nextOrder,
    name: input.name,
    owner_role: input.ownerRole,
    required_fields_json: JSON.stringify(input.requiredFields ?? []),
    required_document_types_json: JSON.stringify(input.requiredDocumentTypes ?? []),
    sla_hours: input.slaHours ?? null,
    customer_visible: input.customerVisible ? 1 : 0,
    is_external: input.isExternal ? 1 : 0,
    checklist_groups_json: JSON.stringify(input.checklistGroups ?? []),
    field_schema_json: input.fieldSchemaJson ?? "{}",
    depends_on_step_ids_json: JSON.stringify(input.dependsOnStepIds ?? []),
    group_id: input.groupId ?? null,
    group_label: input.groupLabel ?? null,
    group_template_id: input.groupTemplateId ?? null,
    customer_completion_message_template:
      input.customerCompletionMessageTemplate ?? null,
    created_at: ts,
    updated_at: ts,
  });

  return id;
}

export async function updateTemplateStep(input: {
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
  await updateItem<WorkflowTemplateStepRow>(
    WORKFLOW_TEMPLATE_STEPS_TABLE,
    { id: input.stepId },
    "SET #name = :name, owner_role = :owner_role, required_fields_json = :required_fields_json, required_document_types_json = :required_document_types_json, sla_hours = :sla_hours, customer_visible = :customer_visible, is_external = :is_external, checklist_groups_json = :checklist_groups_json, field_schema_json = :field_schema_json, depends_on_step_ids_json = :depends_on_step_ids_json, customer_completion_message_template = :customer_completion_message_template, updated_at = :updated_at",
    {
      ":name": input.name,
      ":owner_role": input.ownerRole,
      ":required_fields_json": JSON.stringify(input.requiredFields ?? []),
      ":required_document_types_json": JSON.stringify(
        input.requiredDocumentTypes ?? [],
      ),
      ":sla_hours": input.slaHours ?? null,
      ":customer_visible": input.customerVisible ? 1 : 0,
      ":is_external": input.isExternal ? 1 : 0,
      ":checklist_groups_json": JSON.stringify(input.checklistGroups ?? []),
      ":field_schema_json": input.fieldSchemaJson ?? "{}",
      ":depends_on_step_ids_json": JSON.stringify(input.dependsOnStepIds ?? []),
      ":customer_completion_message_template":
        input.customerCompletionMessageTemplate ?? null,
      ":updated_at": nowIso(),
    },
    { "#name": "name" },
  );
}

export async function addSubworkflowSteps(input: {
  templateId: number;
  subworkflowTemplateId: number;
  groupId?: string;
  groupLabel?: string;
}) {
  const subworkflow = await getWorkflowTemplate(input.subworkflowTemplateId);
  if (!subworkflow) return null;

  const steps = await listTemplateSteps(input.subworkflowTemplateId);
  if (!steps.length) return null;

  const ts = nowIso();
  const groupId = input.groupId ?? crypto.randomUUID();
  const groupLabel = input.groupLabel ?? subworkflow.name;

  const existingSteps = await listTemplateSteps(input.templateId);
  let nextOrder =
    existingSteps.reduce((max, row) => Math.max(max, row.sort_order), 0) + 1;

  const stepIdMap = new Map<number, number>();
  const createdSteps: Array<{ oldId: number; newId: number }> = [];

  for (const step of steps) {
    const newId = await nextId("workflow_template_steps");
    await putItem(WORKFLOW_TEMPLATE_STEPS_TABLE, {
      id: newId,
      template_id: input.templateId,
      sort_order: nextOrder,
      name: step.name,
      owner_role: step.owner_role,
      required_fields_json: step.required_fields_json,
      required_document_types_json: step.required_document_types_json,
      sla_hours: step.sla_hours ?? null,
      customer_visible: step.customer_visible,
      is_external: step.is_external,
      checklist_groups_json: step.checklist_groups_json,
      field_schema_json: step.field_schema_json ?? "{}",
      depends_on_step_ids_json: step.depends_on_step_ids_json ?? "[]",
      group_id: groupId,
      group_label: groupLabel,
      group_template_id: input.subworkflowTemplateId,
      customer_completion_message_template:
        step.customer_completion_message_template ?? null,
      created_at: ts,
      updated_at: ts,
    });
    stepIdMap.set(step.id, newId);
    createdSteps.push({ oldId: step.id, newId });
    nextOrder += 1;
  }

  if (stepIdMap.size) {
    for (const step of steps) {
      const mappedId = stepIdMap.get(step.id);
      if (!mappedId) continue;
      const rawDeps = jsonParse(step.depends_on_step_ids_json, [] as number[]);
      if (rawDeps.length) {
        const mappedDeps = rawDeps
          .map((id) => stepIdMap.get(id))
          .filter((id): id is number => !!id);
        await updateItem(
          WORKFLOW_TEMPLATE_STEPS_TABLE,
          { id: mappedId },
          "SET depends_on_step_ids_json = :depends_on_step_ids_json",
          { ":depends_on_step_ids_json": JSON.stringify(mappedDeps) },
        );
      }

      const schema = parseStepFieldSchema(step.field_schema_json);
      if (schema.fields.length) {
        const mappedSchema = mapStopCountdownPaths(schema, (id) => stepIdMap.get(id) ?? null);
        if (JSON.stringify(schema) !== JSON.stringify(mappedSchema)) {
          await updateItem(
            WORKFLOW_TEMPLATE_STEPS_TABLE,
            { id: mappedId },
            "SET field_schema_json = :field_schema_json",
            { ":field_schema_json": JSON.stringify(mappedSchema) },
          );
        }
      }
    }
  }

  return groupId;
}

export async function deleteTemplateStepGroup(input: { templateId: number; groupId: string }) {
  const rows = await scanAll<WorkflowTemplateStepRow>(WORKFLOW_TEMPLATE_STEPS_TABLE);
  const targets = rows.filter(
    (row) => row.template_id === input.templateId && row.group_id === input.groupId,
  );
  for (const step of targets) {
    await deleteItem(WORKFLOW_TEMPLATE_STEPS_TABLE, { id: step.id });
  }
}

export async function deleteTemplateStep(stepId: number) {
  await deleteItem(WORKFLOW_TEMPLATE_STEPS_TABLE, { id: stepId });
}

export async function moveTemplateStep(input: {
  templateId: number;
  stepId: number;
  dir: "up" | "down";
}) {
  const steps = await listTemplateSteps(input.templateId);
  const idx = steps.findIndex((step) => step.id === input.stepId);
  if (idx === -1) return;
  const swapWith = input.dir === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= steps.length) return;

  const a = steps[idx]!;
  const b = steps[swapWith]!;
  const ts = nowIso();

  await updateItem(
    WORKFLOW_TEMPLATE_STEPS_TABLE,
    { id: a.id },
    "SET sort_order = :sort_order, updated_at = :updated_at",
    { ":sort_order": b.sort_order, ":updated_at": ts },
  );
  await updateItem(
    WORKFLOW_TEMPLATE_STEPS_TABLE,
    { id: b.id },
    "SET sort_order = :sort_order, updated_at = :updated_at",
    { ":sort_order": a.sort_order, ":updated_at": ts },
  );
}

export async function listTemplateRules() {
  const [rules, templates, parties] = await Promise.all([
    scanAll<TemplateRuleRow>(TEMPLATE_RULES_TABLE),
    scanAll<{ id: number; name: string }>(WORKFLOW_TEMPLATES_TABLE),
    scanAll<{ id: number; name: string }>(PARTIES_TABLE),
  ]);

  const templateMap = new Map(templates.map((t) => [t.id, t.name]));
  const partyMap = new Map(parties.map((p) => [p.id, p.name]));

  return rules
    .map((rule) => ({
      ...rule,
      template_name: templateMap.get(rule.template_id) ?? "Unknown",
      customer_name: rule.customer_party_id
        ? partyMap.get(rule.customer_party_id) ?? null
        : null,
    }))
    .sort((a, b) => b.id - a.id);
}

export async function createTemplateRule(input: {
  templateId: number;
  transportMode?: string | null;
  origin?: string | null;
  destination?: string | null;
  shipmentType?: ShipmentType | null;
  customerPartyId?: number | null;
  createdByUserId?: number | null;
}) {
  const id = await nextId("template_rules");
  await putItem(TEMPLATE_RULES_TABLE, {
    id,
    template_id: input.templateId,
    transport_mode: input.transportMode ?? null,
    origin: input.origin ?? null,
    destination: input.destination ?? null,
    shipment_type: input.shipmentType ?? null,
    customer_party_id: input.customerPartyId ?? null,
    created_at: nowIso(),
    created_by_user_id: input.createdByUserId ?? null,
  });
  return id;
}

export async function deleteTemplateRule(ruleId: number) {
  await deleteItem(TEMPLATE_RULES_TABLE, { id: ruleId });
}

export async function getWorkflowTemplateUsage(templateId: number) {
  const [shipments, steps] = await Promise.all([
    scanAll<{ id: number; workflow_template_id: number | null }>(SHIPMENTS_TABLE),
    scanAll<{ id: number; group_template_id: number | null }>(
      WORKFLOW_TEMPLATE_STEPS_TABLE,
    ),
  ]);
  const hasShipments = shipments.some(
    (shipment) => shipment.workflow_template_id === templateId,
  );
  const usedAsSubworkflow = steps.some(
    (step) => step.group_template_id === templateId,
  );
  return { hasShipments, usedAsSubworkflow };
}

export async function deleteWorkflowTemplate(templateId: number) {
  await deleteItem(WORKFLOW_TEMPLATES_TABLE, { id: templateId });
}

export async function suggestTemplate(input: {
  transportMode: string;
  origin: string;
  destination: string;
  shipmentType: ShipmentType;
  customerPartyId: number;
}) {
  const [rules, templates] = await Promise.all([
    scanAll<TemplateRuleRow>(TEMPLATE_RULES_TABLE),
    scanAll<WorkflowTemplateRow>(WORKFLOW_TEMPLATES_TABLE),
  ]);

  const activeTemplates = new Set(
    templates.filter((t) => t.is_archived === 0).map((t) => t.id),
  );

  const candidates = rules
    .filter((rule) => activeTemplates.has(rule.template_id))
    .filter((rule) =>
      rule.transport_mode ? rule.transport_mode === input.transportMode : true,
    )
    .filter((rule) =>
      rule.origin ? rule.origin.toLowerCase() === input.origin.trim().toLowerCase() : true,
    )
    .filter((rule) =>
      rule.destination
        ? rule.destination.toLowerCase() === input.destination.trim().toLowerCase()
        : true,
    )
    .filter((rule) =>
      rule.shipment_type ? rule.shipment_type === input.shipmentType : true,
    )
    .filter((rule) =>
      rule.customer_party_id ? rule.customer_party_id === input.customerPartyId : true,
    )
    .map((rule) => {
      const score =
        (rule.transport_mode ? 1 : 0) +
        (rule.origin ? 1 : 0) +
        (rule.destination ? 1 : 0) +
        (rule.shipment_type ? 1 : 0) +
        (rule.customer_party_id ? 1 : 0);
      return { rule, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.rule.id - a.rule.id;
    });

  if (!candidates.length) return null;
  return await getWorkflowTemplate(candidates[0]!.rule.template_id);
}

export function parseRequiredFields(step: WorkflowTemplateStepRow): string[] {
  return jsonParse(step.required_fields_json, [] as string[]);
}

export function parseRequiredDocumentTypes(step: WorkflowTemplateStepRow): string[] {
  return jsonParse(step.required_document_types_json, [] as string[]);
}
