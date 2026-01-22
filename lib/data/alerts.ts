import "server-only";

import { nowIso, nextId, putItem, scanAll, tableName, updateItem, getItem } from "@/lib/db";

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

const ALERTS_TABLE = tableName("alerts");
const SHIPMENTS_TABLE = tableName("shipments");

export async function listAlerts(
  userId: number,
  input?: { includeRead?: boolean },
): Promise<(AlertRow & { shipment_code: string | null })[]> {
  const [alerts, shipments] = await Promise.all([
    scanAll<AlertRow>(ALERTS_TABLE),
    scanAll<{ id: number; shipment_code: string }>(SHIPMENTS_TABLE),
  ]);
  const shipmentCodes = new Map(shipments.map((s) => [s.id, s.shipment_code]));

  return alerts
    .filter((alert) => alert.user_id === userId)
    .filter((alert) => (input?.includeRead ? true : alert.is_read === 0))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 200)
    .map((alert) => ({
      ...alert,
      shipment_code: alert.shipment_id
        ? shipmentCodes.get(alert.shipment_id) ?? null
        : null,
    }));
}

export async function createAlert(input: {
  userId: number;
  shipmentId?: number | null;
  type: string;
  message: string;
  dedupeKey: string;
}) {
  const existing = await scanAll<AlertRow>(ALERTS_TABLE);
  const alreadyExists = existing.some(
    (alert) => alert.user_id === input.userId && alert.dedupe_key === input.dedupeKey,
  );
  if (alreadyExists) return;

  const id = await nextId("alerts");
  await putItem(ALERTS_TABLE, {
    id,
    user_id: input.userId,
    shipment_id: input.shipmentId ?? null,
    type: input.type,
    message: input.message,
    dedupe_key: input.dedupeKey,
    is_read: 0,
    created_at: nowIso(),
  });
}

export async function markAlertRead(alertId: number, userId: number) {
  const alert = await getItem<AlertRow>(ALERTS_TABLE, { id: alertId });
  if (!alert || alert.user_id !== userId) return;
  await updateItem<AlertRow>(
    ALERTS_TABLE,
    { id: alertId },
    "SET is_read = :is_read",
    { ":is_read": 1 },
  );
}
