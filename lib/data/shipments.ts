import "server-only";

import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  ShipmentOverallStatus,
  ShipmentRisk,
  ShipmentType,
  StepStatus,
  TransportMode,
} from "@/lib/domain";
import { getDb, inTransaction, nowIso } from "@/lib/db";
import { parseChecklistGroupsJson, type ChecklistGroup } from "@/lib/checklists";
import type { PartyRow } from "@/lib/data/parties";
import { execute, jsonParse, queryAll, queryOne } from "@/lib/sql";
import { listActiveUserIdsByRole } from "@/lib/data/users";
import { listTemplateSteps } from "@/lib/data/workflows";

export type ShipmentRow = {
  id: number;
  shipment_code: string;
  customer_party_id: number;
  transport_mode: TransportMode;
  origin: string;
  destination: string;
  shipment_type: ShipmentType;
  container_number: string | null;
  bl_number: string | null;
  cargo_description: string;
  packages_count: number | null;
  weight_kg: number | null;
  dimensions: string | null;
  etd: string | null;
  eta: string | null;
  overall_status: ShipmentOverallStatus;
  risk: ShipmentRisk;
  workflow_template_id: number | null;
  workflow_global_values_json: string;
  last_update_at: string;
  last_update_by_user_id: number | null;
  created_at: string;
  created_by_user_id: number | null;
};

export type ShipmentListRow = {
  id: number;
  shipment_code: string;
  job_ids: string | null;
  customer_names: string | null;
  transport_mode: TransportMode;
  origin: string;
  destination: string;
  overall_status: ShipmentOverallStatus;
  risk: ShipmentRisk;
  last_update_at: string;
  etd: string | null;
  eta: string | null;
};

export type ShipmentStepRow = {
  id: number;
  shipment_id: number;
  sort_order: number;
  name: string;
  owner_role: string;
  related_party_id: number | null;
  status: StepStatus;
  notes: string | null;
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
  customer_completion_message_template: string | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentJobIdRow = {
  id: number;
  shipment_id: number;
  job_id: string;
  created_at: string;
  created_by_user_id: number | null;
  created_by_name: string | null;
};

export function parseRequiredFields(step: ShipmentStepRow): string[] {
  return jsonParse(step.required_fields_json, [] as string[]);
}

export function parseRequiredDocumentTypes(step: ShipmentStepRow): string[] {
  return jsonParse(step.required_document_types_json, [] as string[]);
}

export function parseFieldValues(step: ShipmentStepRow): Record<string, unknown> {
  return jsonParse(step.field_values_json, {} as Record<string, unknown>);
}

export function parseChecklistGroups(step: ShipmentStepRow): ChecklistGroup[] {
  return parseChecklistGroupsJson(step.checklist_groups_json);
}

function generatePendingShipmentCode() {
  return `SHP-PENDING-${crypto.randomBytes(6).toString("base64url")}`;
}

function finalShipmentCode(id: number) {
  return `SHP-${String(id).padStart(6, "0")}`;
}

export function createTrackingToken(db: DatabaseSync, shipmentId: number): string {
  const createdAt = nowIso();
  for (let i = 0; i < 5; i++) {
    const token = crypto.randomBytes(18).toString("base64url");
    try {
      execute(
        "INSERT INTO tracking_tokens (token, shipment_id, created_at, revoked_at) VALUES (?, ?, ?, NULL)",
        [token, shipmentId, createdAt],
        db,
      );
      return token;
    } catch {
      // collision, retry
    }
  }
  throw new Error("Failed to generate tracking token");
}

export function getTrackingTokenForShipment(shipmentId: number): string | null {
  const db = getDb();
  const row = queryOne<{ token: string }>(
    `
      SELECT token
      FROM tracking_tokens
      WHERE shipment_id = ? AND revoked_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [shipmentId],
    db,
  );
  return row?.token ?? null;
}

export function listShipmentsForUser(input: {
  userId: number;
  role: string;
  q?: string;
  customerId?: number;
  transportMode?: TransportMode;
  status?: ShipmentOverallStatus;
}) {
  const db = getDb();
  const params: Array<string | number> = [input.userId];
  const where: string[] = [];

  const canAccessAll = input.role === "ADMIN" || input.role === "FINANCE";
  if (!canAccessAll) {
    where.push("sa.user_id IS NOT NULL");
  }

  if (input.customerId) {
    where.push(
      "EXISTS (SELECT 1 FROM shipment_customers scf WHERE scf.shipment_id = s.id AND scf.customer_party_id = ?)",
    );
    params.push(input.customerId);
  }
  if (input.transportMode) {
    where.push("s.transport_mode = ?");
    params.push(input.transportMode);
  }
  if (input.status) {
    where.push("s.overall_status = ?");
    params.push(input.status);
  }

  const q = input.q?.trim();
  if (q) {
    where.push(
      `(s.shipment_code LIKE ? OR EXISTS (
          SELECT 1
          FROM shipment_customers scq
          JOIN parties cq ON cq.id = scq.customer_party_id
          WHERE scq.shipment_id = s.id AND LOWER(cq.name) LIKE ?
        ) OR s.container_number LIKE ? OR s.bl_number LIKE ?
        OR EXISTS (
          SELECT 1 FROM shipment_job_ids sj
          WHERE sj.shipment_id = s.id AND sj.job_id LIKE ?
        ))`,
    );
    params.push(`%${q}%`, `%${q.toLowerCase()}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  return queryAll<ShipmentListRow>(
    `
      SELECT
        s.id,
        s.shipment_code,
        (
          SELECT group_concat(job_id, ', ')
          FROM shipment_job_ids sj
          WHERE sj.shipment_id = s.id
        ) AS job_ids,
        (
          SELECT REPLACE(group_concat(DISTINCT c2.name), ',', ', ')
          FROM shipment_customers sc2
          JOIN parties c2 ON c2.id = sc2.customer_party_id
          WHERE sc2.shipment_id = s.id
        ) AS customer_names,
        s.transport_mode,
        s.origin,
        s.destination,
        s.overall_status,
        s.risk,
        s.last_update_at,
        s.etd,
        s.eta
      FROM shipments s
      LEFT JOIN shipment_access sa ON sa.shipment_id = s.id AND sa.user_id = ?
      ${whereSql}
      ORDER BY s.last_update_at DESC
      LIMIT 500
    `,
    params,
    db,
  );
}

export function getShipment(
  shipmentId: number,
): (ShipmentRow & { customer_names: string | null }) | null {
  const db = getDb();
  return queryOne<ShipmentRow & { customer_names: string | null }>(
    `
      SELECT
        s.*,
        (
          SELECT REPLACE(group_concat(DISTINCT c2.name), ',', ', ')
          FROM shipment_customers sc2
          JOIN parties c2 ON c2.id = sc2.customer_party_id
          WHERE sc2.shipment_id = s.id
        ) AS customer_names
      FROM shipments s
      WHERE s.id = ?
      LIMIT 1
    `,
    [shipmentId],
    db,
  );
}

export function listShipmentCustomers(shipmentId: number) {
  const db = getDb();
  return queryAll<PartyRow>(
    `
      SELECT p.*
      FROM shipment_customers sc
      JOIN parties p ON p.id = sc.customer_party_id
      WHERE sc.shipment_id = ?
      ORDER BY p.name ASC
    `,
    [shipmentId],
    db,
  );
}

export function deleteShipment(shipmentId: number) {
  const db = getDb();
  execute("DELETE FROM shipments WHERE id = ?", [shipmentId], db);
}

export function listShipmentSteps(shipmentId: number) {
  const db = getDb();
  return queryAll<ShipmentStepRow>(
    `
      SELECT *
      FROM shipment_steps
      WHERE shipment_id = ?
      ORDER BY sort_order ASC
    `,
    [shipmentId],
    db,
  );
}

export function updateShipmentWorkflowGlobals(input: {
  shipmentId: number;
  valuesJson: string;
  updatedByUserId?: number | null;
}) {
  const db = getDb();
  execute(
    `
      UPDATE shipments
      SET
        workflow_global_values_json = ?,
        last_update_at = ?,
        last_update_by_user_id = ?
      WHERE id = ?
    `,
    [
      input.valuesJson,
      nowIso(),
      input.updatedByUserId ?? null,
      input.shipmentId,
    ],
    db,
  );
}

export function listShipmentJobIds(shipmentId: number) {
  const db = getDb();
  return queryAll<ShipmentJobIdRow>(
    `
      SELECT
        sj.id,
        sj.shipment_id,
        sj.job_id,
        sj.created_at,
        sj.created_by_user_id,
        u.name AS created_by_name
      FROM shipment_job_ids sj
      LEFT JOIN users u ON u.id = sj.created_by_user_id
      WHERE sj.shipment_id = ?
      ORDER BY sj.created_at ASC
    `,
    [shipmentId],
    db,
  );
}

export function grantShipmentAccess(db: DatabaseSync, input: { shipmentId: number; userId: number; grantedByUserId?: number | null }) {
  execute(
    `
      INSERT OR IGNORE INTO shipment_access (shipment_id, user_id, granted_by_user_id, created_at)
      VALUES (?, ?, ?, ?)
    `,
    [input.shipmentId, input.userId, input.grantedByUserId ?? null, nowIso()],
    db,
  );
}

export function createShipment(input: {
  customerPartyIds: number[];
  transportMode: TransportMode;
  origin: string;
  destination: string;
  shipmentType: ShipmentType;
  cargoDescription: string;
  packagesCount?: number | null;
  weightKg?: number | null;
  dimensions?: string | null;
  etd?: string | null;
  eta?: string | null;
  containerNumber?: string | null;
  blNumber?: string | null;
  jobIds?: string[];
  workflowTemplateId?: number | null;
  createdByUserId: number;
}) {
  const db = getDb();
  const ts = nowIso();

  return inTransaction(db, () => {
    const customerIds = Array.from(
      new Set(
        input.customerPartyIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    );
    const primaryCustomerId = customerIds[0];
    if (!primaryCustomerId) {
      throw new Error("Shipment must have at least one customer");
    }

    const insert = execute(
      `
        INSERT INTO shipments (
          shipment_code,
          customer_party_id,
          transport_mode,
          origin,
          destination,
          shipment_type,
          container_number,
          bl_number,
          cargo_description,
          packages_count,
          weight_kg,
          dimensions,
          etd,
          eta,
          overall_status,
          risk,
          workflow_template_id,
          last_update_at,
          last_update_by_user_id,
          created_at,
          created_by_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        generatePendingShipmentCode(),
        primaryCustomerId,
        input.transportMode,
        input.origin,
        input.destination,
        input.shipmentType,
        input.containerNumber ?? null,
        input.blNumber ?? null,
        input.cargoDescription,
        input.packagesCount ?? null,
        input.weightKg ?? null,
        input.dimensions ?? null,
        input.etd ?? null,
        input.eta ?? null,
        "CREATED",
        "ON_TRACK",
        input.workflowTemplateId ?? null,
        ts,
        input.createdByUserId,
        ts,
        input.createdByUserId,
      ],
      db,
    );

    const shipmentId = insert.lastInsertRowid;
    execute(
      "UPDATE shipments SET shipment_code = ? WHERE id = ?",
      [finalShipmentCode(shipmentId), shipmentId],
      db,
    );

    for (const customerPartyId of customerIds) {
      execute(
        `
          INSERT OR IGNORE INTO shipment_customers (
            shipment_id, customer_party_id, created_at, created_by_user_id
          ) VALUES (?, ?, ?, ?)
        `,
        [shipmentId, customerPartyId, ts, input.createdByUserId],
        db,
      );
    }

    if (input.jobIds?.length) {
      for (const jobId of input.jobIds) {
        const trimmed = jobId.trim();
        if (!trimmed) continue;
        execute(
          `
            INSERT OR IGNORE INTO shipment_job_ids (
              shipment_id, job_id, created_at, created_by_user_id
            ) VALUES (?, ?, ?, ?)
          `,
          [shipmentId, trimmed, ts, input.createdByUserId],
          db,
        );
      }
    }

    // Access
    grantShipmentAccess(db, {
      shipmentId,
      userId: input.createdByUserId,
      grantedByUserId: input.createdByUserId,
    });

    // Steps from template
    if (input.workflowTemplateId) {
      const templateSteps = listTemplateSteps(input.workflowTemplateId);
      for (const step of templateSteps) {
        execute(
          `
            INSERT INTO shipment_steps (
              shipment_id, sort_order, name, owner_role,
              status, notes,
              required_fields_json, required_document_types_json,
              is_external, checklist_groups_json, field_schema_json,
              sla_hours, due_at, started_at, completed_at,
              customer_visible, customer_completion_message_template,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)
          `,
          [
            shipmentId,
            step.sort_order,
            step.name,
            step.owner_role,
            "PENDING",
            step.required_fields_json,
            step.required_document_types_json,
            step.is_external,
            step.checklist_groups_json,
            step.field_schema_json ?? "{}",
            step.sla_hours ?? null,
            step.is_external ? 1 : step.customer_visible,
            step.customer_completion_message_template ?? null,
            ts,
            ts,
          ],
          db,
        );

        // grant access to users in that role (simple team access)
        const userIds = listActiveUserIdsByRole(step.owner_role);
        for (const userId of userIds) {
          grantShipmentAccess(db, {
            shipmentId,
            userId,
            grantedByUserId: input.createdByUserId,
          });
        }
      }
    }

    // Tracking token
    const token = createTrackingToken(db, shipmentId);

    // Activity
    execute(
      `
        INSERT INTO activities (shipment_id, type, message, actor_user_id, created_at, data_json)
        VALUES (?, 'CREATED', ?, ?, ?, ?)
      `,
      [
        shipmentId,
        `Shipment created (${finalShipmentCode(shipmentId)})`,
        input.createdByUserId,
        ts,
        JSON.stringify({ workflowTemplateId: input.workflowTemplateId ?? null }),
      ],
      db,
    );

    return { shipmentId, shipmentCode: finalShipmentCode(shipmentId), trackingToken: token };
  });
}
