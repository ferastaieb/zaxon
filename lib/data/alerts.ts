import "server-only";

import { getDb, nowIso } from "@/lib/db";
import { execute, queryAll } from "@/lib/sql";

export type AlertRow = {
  id: number;
  user_id: number;
  shipment_id: number | null;
  type: string;
  message: string;
  dedupe_key: string;
  is_read: 0 | 1;
  created_at: string;
};

export function listAlerts(userId: number, input?: { includeRead?: boolean }) {
  const db = getDb();
  const whereRead = input?.includeRead ? "" : "AND a.is_read = 0";
  return queryAll<AlertRow & { shipment_code: string | null }>(
    `
      SELECT a.*, s.shipment_code AS shipment_code
      FROM alerts a
      LEFT JOIN shipments s ON s.id = a.shipment_id
      WHERE a.user_id = ?
      ${whereRead}
      ORDER BY a.created_at DESC
      LIMIT 200
    `,
    [userId],
    db,
  );
}

export function createAlert(input: {
  userId: number;
  shipmentId?: number | null;
  type: string;
  message: string;
  dedupeKey: string;
}) {
  const db = getDb();
  execute(
    `
      INSERT OR IGNORE INTO alerts (
        user_id, shipment_id, type, message, dedupe_key, is_read, created_at
      )
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `,
    [
      input.userId,
      input.shipmentId ?? null,
      input.type,
      input.message,
      input.dedupeKey,
      nowIso(),
    ],
    db,
  );
}

export function markAlertRead(alertId: number, userId: number) {
  const db = getDb();
  execute("UPDATE alerts SET is_read = 1 WHERE id = ? AND user_id = ?", [alertId, userId], db);
}

