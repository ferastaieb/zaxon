import "server-only";

import { nowIso, nextId, putItem, scanAll, tableName } from "@/lib/db";
import type { DbUser } from "@/lib/data/users";

export type ActivityRow = {
  id: number;
  shipment_id: number;
  type: string;
  message: string;
  actor_user_id: number | null;
  actor_name: string | null;
  created_at: string;
  data_json: string | null;
};

const ACTIVITIES_TABLE = tableName("activities");
const USERS_TABLE = tableName("users");

export async function listActivities(shipmentId: number): Promise<ActivityRow[]> {
  const [activities, users] = await Promise.all([
    scanAll<ActivityRow>(ACTIVITIES_TABLE),
    scanAll<Pick<DbUser, "id" | "name">>(USERS_TABLE),
  ]);
  const userNames = new Map(users.map((user) => [user.id, user.name]));

  return activities
    .filter((activity) => activity.shipment_id === shipmentId)
    .map((activity) => ({
      ...activity,
      actor_name: activity.actor_user_id
        ? userNames.get(activity.actor_user_id) ?? null
        : null,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 200);
}

export async function logActivity(input: {
  shipmentId: number;
  type: string;
  message: string;
  actorUserId?: number | null;
  data?: unknown;
}) {
  const id = await nextId("activities");
  await putItem(ACTIVITIES_TABLE, {
    id,
    shipment_id: input.shipmentId,
    type: input.type,
    message: input.message,
    actor_user_id: input.actorUserId ?? null,
    created_at: nowIso(),
    data_json: input.data ? JSON.stringify(input.data) : null,
  });
}

export async function addComment(input: {
  shipmentId: number;
  message: string;
  actorUserId: number;
}) {
  await logActivity({
    shipmentId: input.shipmentId,
    type: "COMMENT",
    message: input.message,
    actorUserId: input.actorUserId,
  });
}
