import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { StepStatus } from "@/lib/domain";
import { getDb, nowIso } from "@/lib/db";
import { execute, queryOne } from "@/lib/sql";

export type ShipmentStepMeta = {
  id: number;
  shipment_id: number;
  name: string;
  status: StepStatus;
  related_party_id: number | null;
  required_fields_json: string;
  required_document_types_json: string;
  field_values_json: string;
  field_schema_json: string;
  sla_hours: number | null;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  customer_visible: 0 | 1;
  is_external: 0 | 1;
  checklist_groups_json: string;
  depends_on_step_ids_json: string;
};

export function getShipmentStep(stepId: number, db: DatabaseSync = getDb()) {
  return queryOne<ShipmentStepMeta>(
    `
      SELECT
        id,
        shipment_id,
        name,
        status,
        related_party_id,
        required_fields_json,
        required_document_types_json,
        field_values_json,
        field_schema_json,
        sla_hours,
        due_at,
        started_at,
        completed_at,
        customer_visible,
        is_external,
        checklist_groups_json,
        depends_on_step_ids_json
      FROM shipment_steps
      WHERE id = ?
      LIMIT 1
    `,
    [stepId],
    db,
  );
}

export function updateShipmentStep(input: {
  stepId: number;
  status?: StepStatus;
  notes?: string | null;
  fieldValuesJson?: string;
  relatedPartyId?: number | null;
  db?: DatabaseSync;
}) {
  const db = input.db ?? getDb();
  const current = getShipmentStep(input.stepId, db);
  if (!current) return null;

  const nextStatus = input.status ?? current.status;
  const statusChanged =
    input.status !== undefined && input.status !== current.status;
  const ts = nowIso();

  const fields: string[] = ["updated_at = ?"];
  const params: Array<string | number | null> = [ts];

  if (input.notes !== undefined) {
    fields.push("notes = ?");
    params.push(input.notes);
  }

  if (input.fieldValuesJson !== undefined) {
    fields.push("field_values_json = ?");
    params.push(input.fieldValuesJson);
  }

  if (input.relatedPartyId !== undefined) {
    fields.push("related_party_id = ?");
    params.push(input.relatedPartyId);
  }

  if (statusChanged) {
    fields.push("status = ?");
    params.push(nextStatus);

    if (nextStatus === "IN_PROGRESS" && !current.started_at) {
      fields.push("started_at = ?");
      params.push(ts);

      if (current.sla_hours && current.sla_hours > 0) {
        const dueAt = new Date(Date.now() + current.sla_hours * 3600 * 1000).toISOString();
        fields.push("due_at = ?");
        params.push(dueAt);
      }
    }

    if (nextStatus === "DONE") {
      fields.push("completed_at = ?");
      params.push(ts);
    }

    if (nextStatus === "PENDING") {
      fields.push("started_at = NULL");
      fields.push("completed_at = NULL");
      fields.push("due_at = NULL");
    }
  }

  params.push(input.stepId);
  execute(
    `UPDATE shipment_steps SET ${fields.join(", ")} WHERE id = ?`,
    params,
    db,
  );

  return getShipmentStep(input.stepId, db);
}
