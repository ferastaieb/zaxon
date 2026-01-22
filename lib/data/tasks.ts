import "server-only";

import type { PartyType, TaskStatus } from "@/lib/domain";
import { getItem, nextId, nowIso, putItem, scanAll, tableName, updateItem } from "@/lib/db";

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

const TASKS_TABLE = tableName("tasks");
const USERS_TABLE = tableName("users");
const PARTIES_TABLE = tableName("parties");

export async function listTasks(shipmentId: number): Promise<TaskRow[]> {
  const [tasks, users, parties] = await Promise.all([
    scanAll<TaskRow>(TASKS_TABLE),
    scanAll<{ id: number; name: string }>(USERS_TABLE),
    scanAll<{ id: number; name: string; type: PartyType }>(PARTIES_TABLE),
  ]);
  const userMap = new Map(users.map((user) => [user.id, user.name]));
  const partyMap = new Map(parties.map((party) => [party.id, party]));

  return tasks
    .filter((task) => task.shipment_id === shipmentId)
    .map((task) => {
      const party = task.related_party_id
        ? partyMap.get(task.related_party_id) ?? null
        : null;
      return {
        ...task,
        assignee_name: task.assignee_user_id
          ? userMap.get(task.assignee_user_id) ?? null
          : null,
        related_party_name: party?.name ?? null,
        related_party_type: party?.type ?? null,
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 200);
}

export async function createTask(input: {
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
  const ts = nowIso();
  const id = await nextId("tasks");
  await putItem(TASKS_TABLE, {
    id,
    shipment_id: input.shipmentId,
    title: input.title,
    related_party_id: input.relatedPartyId ?? null,
    assignee_user_id: input.assigneeUserId ?? null,
    assignee_role: input.assigneeRole ?? null,
    due_at: input.dueAt ?? null,
    status: input.status ?? "OPEN",
    linked_exception_id: input.linkedExceptionId ?? null,
    created_at: ts,
    created_by_user_id: input.createdByUserId ?? null,
    updated_at: ts,
  });
  return id;
}

export async function updateTask(input: {
  taskId: number;
  status?: TaskStatus;
  relatedPartyId?: number | null;
}) {
  const parts: string[] = ["updated_at = :updated_at"];
  const values: Record<string, unknown> = { ":updated_at": nowIso() };
  const names: Record<string, string> = {};

  if (input.status) {
    parts.push("#status = :status");
    values[":status"] = input.status;
    names["#status"] = "status";
  }

  if (input.relatedPartyId !== undefined) {
    parts.push("related_party_id = :related_party_id");
    values[":related_party_id"] = input.relatedPartyId;
  }

  await updateItem(
    TASKS_TABLE,
    { id: input.taskId },
    `SET ${parts.join(", ")}`,
    values,
    Object.keys(names).length ? names : undefined,
  );
}

export async function getTask(taskId: number): Promise<TaskRow | null> {
  const [task, users, parties] = await Promise.all([
    getItem<TaskRow>(TASKS_TABLE, { id: taskId }),
    scanAll<{ id: number; name: string }>(USERS_TABLE),
    scanAll<{ id: number; name: string; type: PartyType }>(PARTIES_TABLE),
  ]);
  if (!task) return null;

  const userMap = new Map(users.map((user) => [user.id, user.name]));
  const partyMap = new Map(parties.map((party) => [party.id, party]));
  const party = task.related_party_id
    ? partyMap.get(task.related_party_id) ?? null
    : null;

  return {
    ...task,
    assignee_name: task.assignee_user_id
      ? userMap.get(task.assignee_user_id) ?? null
      : null,
    related_party_name: party?.name ?? null,
    related_party_type: party?.type ?? null,
  };
}
