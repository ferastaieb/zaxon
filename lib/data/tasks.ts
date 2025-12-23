import "server-only";

import type { PartyType, TaskStatus } from "@/lib/domain";
import { getDb, nowIso } from "@/lib/db";
import { execute, queryAll, queryOne } from "@/lib/sql";

export type TaskRow = {
  id: number;
  shipment_id: number;
  title: string;
  related_party_id: number | null;
  related_party_name: string | null;
  related_party_type: PartyType | null;
  assignee_user_id: number | null;
  assignee_name: string | null;
  assignee_role: string | null;
  due_at: string | null;
  status: TaskStatus;
  linked_exception_id: number | null;
  created_at: string;
  created_by_user_id: number | null;
  updated_at: string;
};

export function listTasks(shipmentId: number) {
  const db = getDb();
  return queryAll<TaskRow>(
    `
      SELECT
        t.*,
        u.name AS assignee_name,
        p.name AS related_party_name,
        p.type AS related_party_type
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_user_id
      LEFT JOIN parties p ON p.id = t.related_party_id
      WHERE t.shipment_id = ?
      ORDER BY t.created_at DESC
      LIMIT 200
    `,
    [shipmentId],
    db,
  );
}

export function createTask(input: {
  shipmentId: number;
  title: string;
  relatedPartyId?: number | null;
  assigneeUserId?: number | null;
  assigneeRole?: string | null;
  dueAt?: string | null;
  status?: TaskStatus;
  linkedExceptionId?: number | null;
  createdByUserId?: number | null;
}) {
  const db = getDb();
  const ts = nowIso();
  const result = execute(
    `
      INSERT INTO tasks (
        shipment_id, title, related_party_id, assignee_user_id, assignee_role, due_at, status, linked_exception_id,
        created_at, created_by_user_id, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.shipmentId,
      input.title,
      input.relatedPartyId ?? null,
      input.assigneeUserId ?? null,
      input.assigneeRole ?? null,
      input.dueAt ?? null,
      input.status ?? "OPEN",
      input.linkedExceptionId ?? null,
      ts,
      input.createdByUserId ?? null,
      ts,
    ],
    db,
  );
  return result.lastInsertRowid;
}

export function updateTask(input: {
  taskId: number;
  status?: TaskStatus;
  relatedPartyId?: number | null;
}) {
  const db = getDb();
  const fields: string[] = ["updated_at = ?"];
  const params: Array<string | number | null> = [nowIso()];

  if (input.status) {
    fields.push("status = ?");
    params.push(input.status);
  }

  if (input.relatedPartyId !== undefined) {
    fields.push("related_party_id = ?");
    params.push(input.relatedPartyId);
  }

  params.push(input.taskId);
  execute(
    `UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`,
    params,
    db,
  );
}

export function getTask(taskId: number) {
  const db = getDb();
  return queryOne<TaskRow>(
    `
      SELECT
        t.*,
        u.name AS assignee_name,
        p.name AS related_party_name,
        p.type AS related_party_type
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_user_id
      LEFT JOIN parties p ON p.id = t.related_party_id
      WHERE t.id = ?
      LIMIT 1
    `,
    [taskId],
    db,
  );
}
