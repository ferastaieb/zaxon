import "server-only";

import { getDb, nowIso } from "@/lib/db";
import { execute, queryAll } from "@/lib/sql";

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

export function listActivities(shipmentId: number) {
  const db = getDb();
  return queryAll<ActivityRow>(
    `
      SELECT
        a.id,
        a.shipment_id,
        a.type,
        a.message,
        a.actor_user_id,
        u.name AS actor_name,
        a.created_at,
        a.data_json
      FROM activities a
      LEFT JOIN users u ON u.id = a.actor_user_id
      WHERE a.shipment_id = ?
      ORDER BY a.created_at DESC
      LIMIT 200
    `,
    [shipmentId],
    db,
  );
}

export function logActivity(input: {
  shipmentId: number;
  type: string;
  message: string;
  actorUserId?: number | null;
  data?: unknown;
}) {
  const db = getDb();
  execute(
    `
      INSERT INTO activities (shipment_id, type, message, actor_user_id, created_at, data_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      input.shipmentId,
      input.type,
      input.message,
      input.actorUserId ?? null,
      nowIso(),
      input.data ? JSON.stringify(input.data) : null,
    ],
    db,
  );
}

export function addComment(input: { shipmentId: number; message: string; actorUserId: number }) {
  logActivity({
    shipmentId: input.shipmentId,
    type: "COMMENT",
    message: input.message,
    actorUserId: input.actorUserId,
  });
}

