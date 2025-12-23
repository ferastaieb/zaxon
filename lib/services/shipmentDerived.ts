import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { ShipmentOverallStatus, ShipmentRisk, StepStatus } from "@/lib/domain";
import { getDb, nowIso } from "@/lib/db";
import { execute, queryAll, queryOne } from "@/lib/sql";
import { listActiveUserIdsByRole } from "@/lib/data/users";
import { createAlert } from "@/lib/data/alerts";

const DUE_SOON_THRESHOLD_HOURS = 12;

type StepLite = {
  id: number;
  name: string;
  owner_role: string;
  status: StepStatus;
  due_at: string | null;
};

type OpenExceptionLite = {
  id: number;
  default_risk: ShipmentRisk;
  exception_name: string;
};

function computeOverallStatus(steps: StepLite[]): ShipmentOverallStatus {
  if (steps.length === 0) return "CREATED";
  if (steps.every((s) => s.status === "DONE")) return "COMPLETED";
  if (steps.some((s) => s.status === "BLOCKED")) return "DELAYED";
  if (steps.some((s) => s.status === "IN_PROGRESS" || s.status === "DONE")) {
    return "IN_PROGRESS";
  }
  return "CREATED";
}

function computeRisk(steps: StepLite[], exceptions: OpenExceptionLite[]): ShipmentRisk {
  if (
    steps.some((s) => s.status === "BLOCKED") ||
    exceptions.some((e) => e.default_risk === "BLOCKED")
  ) {
    return "BLOCKED";
  }

  if (exceptions.some((e) => e.default_risk === "AT_RISK")) return "AT_RISK";

  const now = Date.now();
  const soonMs = DUE_SOON_THRESHOLD_HOURS * 3600 * 1000;
  for (const s of steps) {
    if (s.status === "DONE") continue;
    if (!s.due_at) continue;
    const due = Date.parse(s.due_at);
    if (Number.isNaN(due)) continue;
    if (due <= now || due - now <= soonMs) return "AT_RISK";
  }

  return "ON_TRACK";
}

export function refreshShipmentDerivedState(input: {
  shipmentId: number;
  actorUserId?: number | null;
  updateLastUpdate?: boolean;
  db?: DatabaseSync;
}) {
  const db = input.db ?? getDb();

  const steps = queryAll<StepLite>(
    `
      SELECT id, name, owner_role, status, due_at
      FROM shipment_steps
      WHERE shipment_id = ?
      ORDER BY sort_order ASC
    `,
    [input.shipmentId],
    db,
  );

  const openExceptions = queryAll<OpenExceptionLite>(
    `
      SELECT
        se.id,
        et.default_risk AS default_risk,
        et.name AS exception_name
      FROM shipment_exceptions se
      JOIN exception_types et ON et.id = se.exception_type_id
      WHERE se.shipment_id = ? AND se.status = 'OPEN'
      ORDER BY se.created_at DESC
    `,
    [input.shipmentId],
    db,
  );

  const computedOverall = computeOverallStatus(steps);
  const computedRisk = computeRisk(steps, openExceptions);

  const current = queryOne<{ overall_status: ShipmentOverallStatus; risk: ShipmentRisk }>(
    "SELECT overall_status, risk FROM shipments WHERE id = ? LIMIT 1",
    [input.shipmentId],
    db,
  );

  if (!current) return;

  const shouldUpdate =
    current.overall_status !== computedOverall || current.risk !== computedRisk;

  if (shouldUpdate) {
    if (input.updateLastUpdate) {
      execute(
        `
          UPDATE shipments
          SET overall_status = ?, risk = ?, last_update_at = ?, last_update_by_user_id = ?
          WHERE id = ?
        `,
        [
          computedOverall,
          computedRisk,
          nowIso(),
          input.actorUserId ?? null,
          input.shipmentId,
        ],
        db,
      );
    } else {
      execute(
        `
          UPDATE shipments
          SET overall_status = ?, risk = ?
          WHERE id = ?
        `,
        [computedOverall, computedRisk, input.shipmentId],
        db,
      );
    }
  } else if (input.updateLastUpdate) {
    execute(
      `
        UPDATE shipments
        SET last_update_at = ?, last_update_by_user_id = ?
        WHERE id = ?
      `,
      [nowIso(), input.actorUserId ?? null, input.shipmentId],
      db,
    );
  }

  // Alerts for due soon / overdue
  const now = Date.now();
  const soonMs = DUE_SOON_THRESHOLD_HOURS * 3600 * 1000;
  for (const s of steps) {
    if (s.status === "DONE") continue;
    if (!s.due_at) continue;
    const due = Date.parse(s.due_at);
    if (Number.isNaN(due)) continue;

    const isOverdue = due <= now;
    const isDueSoon = !isOverdue && due - now <= soonMs;
    if (!isOverdue && !isDueSoon) continue;

    const ownerRole = s.owner_role;
    const recipients = new Set<number>();
    for (const id of listActiveUserIdsByRole("ADMIN")) recipients.add(id);
    // if ownerRole matches one of the Roles, target them too
    try {
      for (const id of listActiveUserIdsByRole(ownerRole as never)) recipients.add(id);
    } catch {
      // ignore unknown role strings
    }

    const kind = isOverdue ? "overdue" : "due-soon";
    const type = isOverdue ? "STEP_OVERDUE" : "STEP_DUE_SOON";
    const message = isOverdue
      ? `Step overdue: ${s.name}`
      : `Step due soon: ${s.name}`;

    for (const userId of recipients) {
      createAlert({
        userId,
        shipmentId: input.shipmentId,
        type,
        message,
        dedupeKey: `step:${s.id}:${kind}`,
      });
    }
  }
}

