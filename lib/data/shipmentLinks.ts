import "server-only";

import type { ShipmentOverallStatus, ShipmentRisk, TransportMode } from "@/lib/domain";
import { getDb, nowIso } from "@/lib/db";
import { execute, queryAll, queryOne } from "@/lib/sql";

export type ShipmentLinkSummary = {
  id: number;
  connected_shipment_id: number;
  connected_shipment_code: string;
  connected_transport_mode: TransportMode;
  connected_origin: string;
  connected_destination: string;
  connected_cargo_description: string;
  connected_overall_status: ShipmentOverallStatus;
  connected_risk: ShipmentRisk;
  connected_last_update_at: string;
  connected_etd: string | null;
  connected_eta: string | null;
  connected_customer_names: string | null;
  shipment_label: string | null;
  connected_label: string | null;
};

export function listShipmentLinksForShipment(input: {
  shipmentId: number;
  userId: number;
  role: string;
}) {
  const db = getDb();
  const canAccessAll = input.role === "ADMIN" || input.role === "FINANCE";
  const accessJoin = canAccessAll
    ? ""
    : "JOIN shipment_access sa ON sa.shipment_id = s.id AND sa.user_id = ?";
  const params: Array<string | number> = [
    input.shipmentId,
    input.shipmentId,
    input.shipmentId,
    input.shipmentId,
  ];
  if (!canAccessAll) params.push(input.userId);
  params.push(input.shipmentId, input.shipmentId);

  return queryAll<ShipmentLinkSummary>(
    `
      SELECT
        sl.id AS id,
        CASE
          WHEN sl.shipment_id = ? THEN sl.connected_shipment_id
          ELSE sl.shipment_id
        END AS connected_shipment_id,
        CASE
          WHEN sl.shipment_id = ? THEN sl.shipment_label
          ELSE sl.connected_label
        END AS shipment_label,
        CASE
          WHEN sl.shipment_id = ? THEN sl.connected_label
          ELSE sl.shipment_label
        END AS connected_label,
        s.shipment_code AS connected_shipment_code,
        s.transport_mode AS connected_transport_mode,
        s.origin AS connected_origin,
        s.destination AS connected_destination,
        s.cargo_description AS connected_cargo_description,
        s.overall_status AS connected_overall_status,
        s.risk AS connected_risk,
        s.last_update_at AS connected_last_update_at,
        s.etd AS connected_etd,
        s.eta AS connected_eta,
        (
          SELECT REPLACE(group_concat(DISTINCT c.name), ',', ', ')
          FROM shipment_customers sc
          JOIN parties c ON c.id = sc.customer_party_id
          WHERE sc.shipment_id = s.id
        ) AS connected_customer_names
      FROM shipment_links sl
      JOIN shipments s
        ON s.id = CASE
          WHEN sl.shipment_id = ? THEN sl.connected_shipment_id
          ELSE sl.shipment_id
        END
      ${accessJoin}
      WHERE sl.shipment_id = ? OR sl.connected_shipment_id = ?
      ORDER BY s.last_update_at DESC
    `,
    params,
    db,
  );
}

export function listConnectedShipmentIds(shipmentId: number) {
  const db = getDb();
  const rows = queryAll<{ connected_id: number }>(
    `
      SELECT CASE
        WHEN shipment_id = ? THEN connected_shipment_id
        ELSE shipment_id
      END AS connected_id
      FROM shipment_links
      WHERE shipment_id = ? OR connected_shipment_id = ?
    `,
    [shipmentId, shipmentId, shipmentId],
    db,
  );
  return rows.map((row) => row.connected_id);
}

export function createShipmentLink(input: {
  shipmentId: number;
  connectedShipmentId: number;
  shipmentLabel?: string | null;
  connectedLabel?: string | null;
  createdByUserId: number;
}) {
  const db = getDb();
  const existing = queryOne<{
    id: number;
    shipment_id: number;
    connected_shipment_id: number;
    shipment_label: string | null;
    connected_label: string | null;
  }>(
    `
      SELECT id, shipment_id, connected_shipment_id, shipment_label, connected_label
      FROM shipment_links
      WHERE (shipment_id = ? AND connected_shipment_id = ?)
         OR (shipment_id = ? AND connected_shipment_id = ?)
      LIMIT 1
    `,
    [
      input.shipmentId,
      input.connectedShipmentId,
      input.connectedShipmentId,
      input.shipmentId,
    ],
    db,
  );

  const shipmentLabel = input.shipmentLabel?.trim() || null;
  const connectedLabel = input.connectedLabel?.trim() || null;

  if (existing) {
    if (shipmentLabel || connectedLabel) {
      if (existing.shipment_id === input.shipmentId) {
        execute(
          `
            UPDATE shipment_links
            SET shipment_label = ?, connected_label = ?
            WHERE id = ?
          `,
          [
            shipmentLabel ?? existing.shipment_label,
            connectedLabel ?? existing.connected_label,
            existing.id,
          ],
          db,
        );
      } else {
        execute(
          `
            UPDATE shipment_links
            SET shipment_label = ?, connected_label = ?
            WHERE id = ?
          `,
          [
            connectedLabel ?? existing.shipment_label,
            shipmentLabel ?? existing.connected_label,
            existing.id,
          ],
          db,
        );
      }
    }
    return existing.id;
  }

  const result = execute(
    `
      INSERT INTO shipment_links (
        shipment_id,
        connected_shipment_id,
        shipment_label,
        connected_label,
        created_at,
        created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      input.shipmentId,
      input.connectedShipmentId,
      shipmentLabel,
      connectedLabel,
      nowIso(),
      input.createdByUserId,
    ],
    db,
  );
  return result.lastInsertRowid;
}

export function deleteShipmentLink(input: {
  shipmentId: number;
  connectedShipmentId: number;
}) {
  const db = getDb();
  execute(
    `
      DELETE FROM shipment_links
      WHERE (shipment_id = ? AND connected_shipment_id = ?)
         OR (shipment_id = ? AND connected_shipment_id = ?)
    `,
    [
      input.shipmentId,
      input.connectedShipmentId,
      input.connectedShipmentId,
      input.shipmentId,
    ],
    db,
  );
}
