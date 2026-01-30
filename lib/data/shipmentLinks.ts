import "server-only";

import type { ShipmentOverallStatus, ShipmentRisk, TransportMode } from "@/lib/domain";
import {
  deleteItem,
  nextId,
  nowIso,
  putItem,
  scanAll,
  tableName,
  updateItem,
} from "@/lib/db";

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

const SHIPMENT_LINKS_TABLE = tableName("shipment_links");
const SHIPMENTS_TABLE = tableName("shipments");
const SHIPMENT_CUSTOMERS_TABLE = tableName("shipment_customers");
const SHIPMENT_ACCESS_TABLE = tableName("shipment_access");
const PARTIES_TABLE = tableName("parties");

export async function listShipmentLinksForShipment(input: {
  shipmentId: number;
  userId: number;
  role: string;
}) {
  const [links, shipments, shipmentCustomers, parties, accessRows] =
    await Promise.all([
      scanAll<{
        id: number;
        shipment_id: number;
        connected_shipment_id: number;
        shipment_label: string | null;
        connected_label: string | null;
        created_at: string;
        created_by_user_id: number | null;
      }>(SHIPMENT_LINKS_TABLE),
      scanAll<{
        id: number;
        shipment_code: string;
        transport_mode: TransportMode;
        origin: string;
        destination: string;
        cargo_description: string;
        overall_status: ShipmentOverallStatus;
        risk: ShipmentRisk;
        last_update_at: string;
        etd: string | null;
        eta: string | null;
      }>(SHIPMENTS_TABLE),
      scanAll<{ shipment_id: number; customer_party_id: number }>(
        SHIPMENT_CUSTOMERS_TABLE,
      ),
      scanAll<{ id: number; name: string }>(PARTIES_TABLE),
      scanAll<{ shipment_id: number; user_id: number }>(SHIPMENT_ACCESS_TABLE),
    ]);

  const canAccessAll = input.role === "ADMIN" || input.role === "FINANCE";
  const accessSet = new Set<number>();
  if (!canAccessAll) {
    for (const row of accessRows) {
      if (row.user_id === input.userId) accessSet.add(row.shipment_id);
    }
  }

  const shipmentsById = new Map(shipments.map((s) => [s.id, s]));
  const partyNames = new Map(parties.map((p) => [p.id, p.name]));
  const customersByShipment = new Map<number, string[]>();
  for (const row of shipmentCustomers) {
    if (!customersByShipment.has(row.shipment_id)) {
      customersByShipment.set(row.shipment_id, []);
    }
    const name = partyNames.get(row.customer_party_id);
    if (name) customersByShipment.get(row.shipment_id)?.push(name);
  }

  return links
    .filter(
      (link) =>
        link.shipment_id === input.shipmentId ||
        link.connected_shipment_id === input.shipmentId,
    )
    .map((link) => {
      const isPrimary = link.shipment_id === input.shipmentId;
      const connectedId = isPrimary
        ? link.connected_shipment_id
        : link.shipment_id;
      return {
        link,
        connectedId,
        shipmentLabel: isPrimary ? link.shipment_label : link.connected_label,
        connectedLabel: isPrimary ? link.connected_label : link.shipment_label,
      };
    })
    .filter((entry) => (canAccessAll ? true : accessSet.has(entry.connectedId)))
    .map((entry) => {
      const shipment = shipmentsById.get(entry.connectedId);
      if (!shipment) return null;
      const customerNames = customersByShipment.get(entry.connectedId) ?? [];
      return {
        id: entry.link.id,
        connected_shipment_id: entry.connectedId,
        connected_shipment_code: shipment.shipment_code,
        connected_transport_mode: shipment.transport_mode,
        connected_origin: shipment.origin,
        connected_destination: shipment.destination,
        connected_cargo_description: shipment.cargo_description,
        connected_overall_status: shipment.overall_status,
        connected_risk: shipment.risk,
        connected_last_update_at: shipment.last_update_at,
        connected_etd: shipment.etd ?? null,
        connected_eta: shipment.eta ?? null,
        connected_customer_names: customerNames.length
          ? Array.from(new Set(customerNames)).join(", ")
          : null,
        shipment_label: entry.shipmentLabel ?? null,
        connected_label: entry.connectedLabel ?? null,
      };
    })
    .filter((row): row is ShipmentLinkSummary => row !== null)
    .sort((a, b) => b.connected_last_update_at.localeCompare(a.connected_last_update_at));
}

export async function listConnectedShipmentIds(shipmentId: number) {
  const links = await scanAll<{
    shipment_id: number;
    connected_shipment_id: number;
  }>(SHIPMENT_LINKS_TABLE);
  return links
    .filter(
      (link) =>
        link.shipment_id === shipmentId || link.connected_shipment_id === shipmentId,
    )
    .map((link) =>
      link.shipment_id === shipmentId ? link.connected_shipment_id : link.shipment_id,
    );
}

export async function createShipmentLink(input: {
  shipmentId: number;
  connectedShipmentId: number;
  shipmentLabel?: string | null;
  connectedLabel?: string | null;
  createdByUserId: number;
}) {
  const links = await scanAll<{
    id: number;
    shipment_id: number;
    connected_shipment_id: number;
    shipment_label: string | null;
    connected_label: string | null;
  }>(SHIPMENT_LINKS_TABLE);

  const existing = links.find(
    (link) =>
      (link.shipment_id === input.shipmentId &&
        link.connected_shipment_id === input.connectedShipmentId) ||
      (link.shipment_id === input.connectedShipmentId &&
        link.connected_shipment_id === input.shipmentId),
  );

  const shipmentLabel = input.shipmentLabel?.trim() || null;
  const connectedLabel = input.connectedLabel?.trim() || null;

  if (existing) {
    if (shipmentLabel || connectedLabel) {
      const isPrimary = existing.shipment_id === input.shipmentId;
      const nextShipmentLabel = isPrimary
        ? shipmentLabel ?? existing.shipment_label
        : connectedLabel ?? existing.shipment_label;
      const nextConnectedLabel = isPrimary
        ? connectedLabel ?? existing.connected_label
        : shipmentLabel ?? existing.connected_label;
      await updateItem(
        SHIPMENT_LINKS_TABLE,
        { id: existing.id },
        "SET shipment_label = :shipment_label, connected_label = :connected_label",
        {
          ":shipment_label": nextShipmentLabel,
          ":connected_label": nextConnectedLabel,
        },
      );
    }
    return existing.id;
  }

  const id = await nextId("shipment_links");
  await putItem(SHIPMENT_LINKS_TABLE, {
    id,
    shipment_id: input.shipmentId,
    connected_shipment_id: input.connectedShipmentId,
    shipment_label: shipmentLabel,
    connected_label: connectedLabel,
    created_at: nowIso(),
    created_by_user_id: input.createdByUserId,
  });
  return id;
}

export async function deleteShipmentLink(input: {
  shipmentId: number;
  connectedShipmentId: number;
}) {
  const links = await scanAll<{
    id: number;
    shipment_id: number;
    connected_shipment_id: number;
  }>(SHIPMENT_LINKS_TABLE);
  const matches = links.filter(
    (link) =>
      (link.shipment_id === input.shipmentId &&
        link.connected_shipment_id === input.connectedShipmentId) ||
      (link.shipment_id === input.connectedShipmentId &&
        link.connected_shipment_id === input.shipmentId),
  );
  for (const link of matches) {
    await deleteItem(SHIPMENT_LINKS_TABLE, { id: link.id });
  }
}
