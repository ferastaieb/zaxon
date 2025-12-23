import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { ShipmentRisk } from "@/lib/domain";
import { getDb, nowIso } from "@/lib/db";
import { execute, queryAll, queryOne } from "@/lib/sql";

export type ExceptionTypeRow = {
  id: number;
  name: string;
  description: string | null;
  default_risk: ShipmentRisk;
  customer_message_template: string | null;
  is_archived: 0 | 1;
  created_at: string;
  created_by_user_id: number | null;
  updated_at: string;
  updated_by_user_id: number | null;
};

export type ExceptionPlaybookTaskRow = {
  id: number;
  exception_type_id: number;
  sort_order: number;
  title: string;
  owner_role: string;
  due_hours: number | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentExceptionRow = {
  id: number;
  shipment_id: number;
  exception_type_id: number;
  status: "OPEN" | "RESOLVED";
  notes: string | null;
  customer_message: string | null;
  share_with_customer: 0 | 1;
  created_at: string;
  created_by_user_id: number | null;
  resolved_at: string | null;
  resolved_by_user_id: number | null;
  exception_name: string;
  default_risk: ShipmentRisk;
};

export function listExceptionTypes(input?: { includeArchived?: boolean }) {
  const db = getDb();
  const where = input?.includeArchived ? "" : "WHERE is_archived = 0";
  return queryAll<ExceptionTypeRow>(
    `
      SELECT *
      FROM exception_types
      ${where}
      ORDER BY updated_at DESC
    `,
    [],
    db,
  );
}

export function getExceptionType(id: number, db: DatabaseSync = getDb()) {
  return queryOne<ExceptionTypeRow>(
    "SELECT * FROM exception_types WHERE id = ? LIMIT 1",
    [id],
    db,
  );
}

export function createExceptionType(input: {
  name: string;
  description?: string | null;
  defaultRisk: ShipmentRisk;
  customerMessageTemplate?: string | null;
  createdByUserId?: number | null;
}) {
  const db = getDb();
  const ts = nowIso();
  const result = execute(
    `
      INSERT INTO exception_types (
        name, description, default_risk, customer_message_template, is_archived,
        created_at, created_by_user_id, updated_at, updated_by_user_id
      )
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
    `,
    [
      input.name,
      input.description ?? null,
      input.defaultRisk,
      input.customerMessageTemplate ?? null,
      ts,
      input.createdByUserId ?? null,
      ts,
      input.createdByUserId ?? null,
    ],
    db,
  );
  return result.lastInsertRowid;
}

export function updateExceptionType(input: {
  id: number;
  name: string;
  description?: string | null;
  defaultRisk: ShipmentRisk;
  customerMessageTemplate?: string | null;
  isArchived?: boolean;
  updatedByUserId?: number | null;
}) {
  const db = getDb();
  execute(
    `
      UPDATE exception_types
      SET name = ?,
          description = ?,
          default_risk = ?,
          customer_message_template = ?,
          is_archived = ?,
          updated_at = ?,
          updated_by_user_id = ?
      WHERE id = ?
    `,
    [
      input.name,
      input.description ?? null,
      input.defaultRisk,
      input.customerMessageTemplate ?? null,
      input.isArchived ? 1 : 0,
      nowIso(),
      input.updatedByUserId ?? null,
      input.id,
    ],
    db,
  );
}

export function listExceptionPlaybookTasks(exceptionTypeId: number) {
  const db = getDb();
  return queryAll<ExceptionPlaybookTaskRow>(
    `
      SELECT *
      FROM exception_playbook_tasks
      WHERE exception_type_id = ?
      ORDER BY sort_order ASC
    `,
    [exceptionTypeId],
    db,
  );
}

export function addExceptionPlaybookTask(input: {
  exceptionTypeId: number;
  title: string;
  ownerRole: string;
  dueHours?: number | null;
}) {
  const db = getDb();
  const ts = nowIso();
  const row = queryOne<{ max_order: number | null }>(
    "SELECT MAX(sort_order) AS max_order FROM exception_playbook_tasks WHERE exception_type_id = ?",
    [input.exceptionTypeId],
    db,
  );
  const nextOrder = (row?.max_order ?? 0) + 1;
  const result = execute(
    `
      INSERT INTO exception_playbook_tasks (
        exception_type_id, sort_order, title, owner_role, due_hours, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.exceptionTypeId,
      nextOrder,
      input.title,
      input.ownerRole,
      input.dueHours ?? null,
      ts,
      ts,
    ],
    db,
  );
  return result.lastInsertRowid;
}

export function updateExceptionPlaybookTask(input: {
  taskId: number;
  title: string;
  ownerRole: string;
  dueHours?: number | null;
}) {
  const db = getDb();
  execute(
    `
      UPDATE exception_playbook_tasks
      SET title = ?, owner_role = ?, due_hours = ?, updated_at = ?
      WHERE id = ?
    `,
    [input.title, input.ownerRole, input.dueHours ?? null, nowIso(), input.taskId],
    db,
  );
}

export function deleteExceptionPlaybookTask(taskId: number) {
  const db = getDb();
  execute("DELETE FROM exception_playbook_tasks WHERE id = ?", [taskId], db);
}

export function listShipmentExceptions(shipmentId: number) {
  const db = getDb();
  return queryAll<ShipmentExceptionRow>(
    `
      SELECT
        se.*,
        et.name AS exception_name,
        et.default_risk AS default_risk
      FROM shipment_exceptions se
      JOIN exception_types et ON et.id = se.exception_type_id
      WHERE se.shipment_id = ?
      ORDER BY se.created_at DESC
      LIMIT 100
    `,
    [shipmentId],
    db,
  );
}

export function createShipmentException(db: DatabaseSync, input: {
  shipmentId: number;
  exceptionTypeId: number;
  notes?: string | null;
  customerMessage?: string | null;
  shareWithCustomer?: boolean;
  createdByUserId?: number | null;
}) {
  const ts = nowIso();
  const result = execute(
    `
      INSERT INTO shipment_exceptions (
        shipment_id, exception_type_id, status, notes, customer_message, share_with_customer,
        created_at, created_by_user_id, resolved_at, resolved_by_user_id
      )
      VALUES (?, ?, 'OPEN', ?, ?, ?, ?, ?, NULL, NULL)
    `,
    [
      input.shipmentId,
      input.exceptionTypeId,
      input.notes ?? null,
      input.customerMessage ?? null,
      input.shareWithCustomer ? 1 : 0,
      ts,
      input.createdByUserId ?? null,
    ],
    db,
  );
  return result.lastInsertRowid;
}

export function resolveShipmentException(input: {
  exceptionId: number;
  resolvedByUserId?: number | null;
}) {
  const db = getDb();
  execute(
    `
      UPDATE shipment_exceptions
      SET status = 'RESOLVED', resolved_at = ?, resolved_by_user_id = ?
      WHERE id = ?
    `,
    [nowIso(), input.resolvedByUserId ?? null, input.exceptionId],
    db,
  );
}
