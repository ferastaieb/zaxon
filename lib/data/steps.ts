import "server-only";

import type { StepStatus } from "@/lib/domain";
import { getItem, nowIso, tableName, updateItem } from "@/lib/db";

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

const SHIPMENT_STEPS_TABLE = tableName("shipment_steps");

export async function getShipmentStep(stepId: number): Promise<ShipmentStepMeta | null> {
  return await getItem<ShipmentStepMeta>(SHIPMENT_STEPS_TABLE, { id: stepId });
}

export async function updateShipmentStep(input: {
  stepId: number;
  status?: StepStatus;
  notes?: string | null;
  fieldValuesJson?: string;
  relatedPartyId?: number | null;
}) {
  const current = await getShipmentStep(input.stepId);
  if (!current) return null;

  const nextStatus = input.status ?? current.status;
  const statusChanged = input.status !== undefined && input.status !== current.status;
  const ts = nowIso();

  const updateParts: string[] = ["updated_at = :updated_at"];
  const values: Record<string, unknown> = {
    ":updated_at": ts,
  };
  const names: Record<string, string> = {};

  if (input.notes !== undefined) {
    updateParts.push("notes = :notes");
    values[":notes"] = input.notes;
  }

  if (input.fieldValuesJson !== undefined) {
    updateParts.push("field_values_json = :field_values_json");
    values[":field_values_json"] = input.fieldValuesJson;
  }

  if (input.relatedPartyId !== undefined) {
    updateParts.push("related_party_id = :related_party_id");
    values[":related_party_id"] = input.relatedPartyId;
  }

  if (statusChanged) {
    updateParts.push("#status = :status");
    values[":status"] = nextStatus;
    names["#status"] = "status";

    if (nextStatus === "IN_PROGRESS" && !current.started_at) {
      updateParts.push("started_at = :started_at");
      values[":started_at"] = ts;

      if (current.sla_hours && current.sla_hours > 0) {
        const dueAt = new Date(
          Date.now() + current.sla_hours * 3600 * 1000,
        ).toISOString();
        updateParts.push("due_at = :due_at");
        values[":due_at"] = dueAt;
      }
    }

    if (nextStatus === "DONE") {
      updateParts.push("completed_at = :completed_at");
      values[":completed_at"] = ts;
    }

    if (nextStatus === "PENDING") {
      updateParts.push("started_at = :pending_started_at");
      updateParts.push("completed_at = :pending_completed_at");
      updateParts.push("due_at = :pending_due_at");
      values[":pending_started_at"] = null;
      values[":pending_completed_at"] = null;
      values[":pending_due_at"] = null;
    }
  }

  await updateItem(
    SHIPMENT_STEPS_TABLE,
    { id: input.stepId },
    `SET ${updateParts.join(", ")}`,
    values,
    Object.keys(names).length ? names : undefined,
  );

  return await getShipmentStep(input.stepId);
}
