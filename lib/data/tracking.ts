import "server-only";

import type { ShipmentOverallStatus, StepStatus, TransportMode } from "@/lib/domain";
import { getDb } from "@/lib/db";
import { queryAll, queryOne } from "@/lib/sql";

export type TrackingShipment = {
  id: number;
  shipment_code: string;
  transport_mode: TransportMode;
  origin: string;
  destination: string;
  overall_status: ShipmentOverallStatus;
  last_update_at: string;
  etd: string | null;
  eta: string | null;
};

export type TrackingConnectedShipment = {
  id: number;
  shipment_code: string;
  origin: string;
  destination: string;
  overall_status: ShipmentOverallStatus;
  shipment_label: string | null;
  connected_label: string | null;
  tracking_token: string | null;
};

export function getShipmentIdForTrackingToken(token: string): number | null {
  const db = getDb();
  const row = queryOne<{ shipment_id: number }>(
    `
      SELECT shipment_id
      FROM tracking_tokens
      WHERE token = ? AND revoked_at IS NULL
      LIMIT 1
    `,
    [token],
    db,
  );
  return row?.shipment_id ?? null;
}

export function getTrackingShipment(token: string): TrackingShipment | null {
  const db = getDb();
  return queryOne<TrackingShipment>(
    `
      SELECT
        s.id,
        s.shipment_code,
        s.transport_mode,
        s.origin,
        s.destination,
        s.overall_status,
        s.last_update_at,
        s.etd,
        s.eta
      FROM tracking_tokens tt
      JOIN shipments s ON s.id = tt.shipment_id
      WHERE tt.token = ? AND tt.revoked_at IS NULL
      LIMIT 1
    `,
    [token],
    db,
  );
}

export function listCustomerVisibleSteps(shipmentId: number) {
  const db = getDb();
  return queryAll<{
    id: number;
    sort_order: number;
    name: string;
    status: StepStatus;
    started_at: string | null;
    completed_at: string | null;
    is_external: 0 | 1;
    field_schema_json: string;
    field_values_json: string;
    required_fields_json: string;
  }>(
    `
      SELECT
        id,
        sort_order,
        name,
        status,
        started_at,
        completed_at,
        is_external,
        field_schema_json,
        field_values_json,
        required_fields_json
      FROM shipment_steps
      WHERE shipment_id = ? AND customer_visible = 1
      ORDER BY sort_order ASC
    `,
    [shipmentId],
    db,
  );
}

export function listCustomerVisibleDocuments(shipmentId: number) {
  const db = getDb();
  return queryAll<{
    id: number;
    document_type: string;
    file_name: string;
    uploaded_at: string;
  }>(
    `
      SELECT id, document_type, file_name, uploaded_at
      FROM documents
      WHERE shipment_id = ? AND share_with_customer = 1
      ORDER BY uploaded_at DESC
    `,
    [shipmentId],
    db,
  );
}

export function listCustomerDocumentRequests(shipmentId: number) {
  const db = getDb();
  return queryAll<{
    id: number;
    document_type: string;
    message: string | null;
    status: "OPEN" | "FULFILLED";
    requested_at: string;
    fulfilled_at: string | null;
  }>(
    `
      SELECT id, document_type, message, status, requested_at, fulfilled_at
      FROM document_requests
      WHERE shipment_id = ?
      ORDER BY requested_at DESC
    `,
    [shipmentId],
    db,
  );
}

function last4Digits(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D+/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

export function getTrackingCustomerPhoneLast4(token: string): string | null {
  const db = getDb();
  const row = queryOne<{ phone: string | null }>(
    `
      SELECT c.phone AS phone
      FROM tracking_tokens tt
      JOIN shipments s ON s.id = tt.shipment_id
      JOIN parties c ON c.id = s.customer_party_id
      WHERE tt.token = ? AND tt.revoked_at IS NULL
      LIMIT 1
    `,
    [token],
    db,
  );
  return last4Digits(row?.phone ?? null);
}

export function listCustomerVisibleExceptions(shipmentId: number) {
  const db = getDb();
  return queryAll<{
    id: number;
    status: "OPEN" | "RESOLVED";
    created_at: string;
    exception_name: string;
    default_risk: string;
    customer_message: string | null;
  }>(
    `
      SELECT
        se.id,
        se.status,
        se.created_at,
        et.name AS exception_name,
        et.default_risk AS default_risk,
        se.customer_message
      FROM shipment_exceptions se
      JOIN exception_types et ON et.id = se.exception_type_id
      WHERE se.shipment_id = ? AND se.share_with_customer = 1
      ORDER BY se.created_at DESC
      LIMIT 50
    `,
    [shipmentId],
    db,
  );
}

export function listTrackingConnectedShipments(shipmentId: number) {
  const db = getDb();
  return queryAll<TrackingConnectedShipment>(
    `
      SELECT
        s.id AS id,
        s.shipment_code AS shipment_code,
        s.origin AS origin,
        s.destination AS destination,
        s.overall_status AS overall_status,
        CASE
          WHEN sl.shipment_id = ? THEN sl.shipment_label
          ELSE sl.connected_label
        END AS shipment_label,
        CASE
          WHEN sl.shipment_id = ? THEN sl.connected_label
          ELSE sl.shipment_label
        END AS connected_label,
        (
          SELECT token
          FROM tracking_tokens tt
          WHERE tt.shipment_id = s.id AND tt.revoked_at IS NULL
          ORDER BY tt.created_at DESC
          LIMIT 1
        ) AS tracking_token
      FROM shipment_links sl
      JOIN shipments current ON current.id = ?
      JOIN shipments s
        ON s.id = CASE
          WHEN sl.shipment_id = ? THEN sl.connected_shipment_id
          ELSE sl.shipment_id
        END
      JOIN shipment_customers sc_current
        ON sc_current.shipment_id = current.id
      JOIN shipment_customers sc_connected
        ON sc_connected.shipment_id = s.id
        AND sc_connected.customer_party_id = sc_current.customer_party_id
      WHERE (sl.shipment_id = ? OR sl.connected_shipment_id = ?)
      ORDER BY s.last_update_at DESC
    `,
    [
      shipmentId,
      shipmentId,
      shipmentId,
      shipmentId,
      shipmentId,
      shipmentId,
    ],
    db,
  );
}
