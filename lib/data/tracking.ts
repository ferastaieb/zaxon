import "server-only";

import type { ShipmentOverallStatus, StepStatus, TransportMode } from "@/lib/domain";
import { getItem, scanAll, tableName } from "@/lib/db";
import { FTL_EXPORT_STEP_NAMES } from "@/lib/ftlExport/constants";

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

export type TrackingCustomerContext = {
  seed_shipment_id: number;
  seed_tracking_token: string;
  customer_party_id: number;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_phone_last4: string | null;
};

export type TrackingPortalShipmentSummary = {
  id: number;
  shipment_code: string;
  transport_mode: TransportMode;
  origin: string;
  destination: string;
  overall_status: ShipmentOverallStatus;
  last_update_at: string;
  tracking_token: string | null;
  has_portal_content: boolean;
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

const TRACKING_TOKENS_TABLE = tableName("tracking_tokens");
const SHIPMENTS_TABLE = tableName("shipments");
const SHIPMENT_STEPS_TABLE = tableName("shipment_steps");
const DOCUMENTS_TABLE = tableName("documents");
const DOCUMENT_REQUESTS_TABLE = tableName("document_requests");
const PARTIES_TABLE = tableName("parties");
const SHIPMENT_EXCEPTIONS_TABLE = tableName("shipment_exceptions");
const EXCEPTION_TYPES_TABLE = tableName("exception_types");
const SHIPMENT_LINKS_TABLE = tableName("shipment_links");
const SHIPMENT_CUSTOMERS_TABLE = tableName("shipment_customers");

type TrackingTokenRow = {
  token: string;
  shipment_id: number;
  created_at?: string;
  revoked_at: string | null;
};

type ShipmentCustomerRow = {
  shipment_id: number;
  customer_party_id: number;
};

type ShipmentSeedRow = {
  id: number;
  customer_party_id: number | null;
};

function fallbackIsFtlStepSet(stepNames: Set<string>) {
  return (
    stepNames.has(FTL_EXPORT_STEP_NAMES.exportPlanOverview) &&
    stepNames.has(FTL_EXPORT_STEP_NAMES.trucksDetails) &&
    stepNames.has(FTL_EXPORT_STEP_NAMES.loadingDetails) &&
    stepNames.has(FTL_EXPORT_STEP_NAMES.customsAgentsAllocation)
  );
}

async function getActiveTrackingTokenRow(token: string): Promise<TrackingTokenRow | null> {
  const row = await getItem<TrackingTokenRow>(TRACKING_TOKENS_TABLE, { token });
  if (!row || row.revoked_at) return null;
  return row;
}

async function getTrackingCustomerPartyIdForShipment(shipmentId: number): Promise<number | null> {
  const shipment = await getItem<ShipmentSeedRow>(SHIPMENTS_TABLE, { id: shipmentId });
  if (typeof shipment?.customer_party_id === "number" && shipment.customer_party_id > 0) {
    return shipment.customer_party_id;
  }

  const shipmentCustomers = await scanAll<ShipmentCustomerRow>(SHIPMENT_CUSTOMERS_TABLE);
  return (
    shipmentCustomers.find((row) => row.shipment_id === shipmentId)?.customer_party_id ?? null
  );
}

export async function getShipmentIdForTrackingToken(token: string): Promise<number | null> {
  const row = await getActiveTrackingTokenRow(token);
  if (!row) return null;
  return row.shipment_id ?? null;
}

export async function getTrackingShipment(token: string): Promise<TrackingShipment | null> {
  const row = await getActiveTrackingTokenRow(token);
  if (!row) return null;

  return getTrackingShipmentById(row.shipment_id);
}

export async function getTrackingShipmentById(
  shipmentId: number,
): Promise<TrackingShipment | null> {
  const shipment = await getItem<TrackingShipment>(SHIPMENTS_TABLE, { id: shipmentId });
  return shipment ?? null;
}

export async function getTrackingCustomerPartyIdForToken(
  token: string,
): Promise<number | null> {
  const row = await getActiveTrackingTokenRow(token);
  if (!row) return null;
  return getTrackingCustomerPartyIdForShipment(row.shipment_id);
}

export async function getTrackingCustomerContext(
  token: string,
): Promise<TrackingCustomerContext | null> {
  const tracking = await getActiveTrackingTokenRow(token);
  if (!tracking) return null;

  const customerPartyId = await getTrackingCustomerPartyIdForShipment(tracking.shipment_id);
  if (!customerPartyId) return null;

  const party = await getItem<{
    id: number;
    name: string;
    phone: string | null;
    address: string | null;
  }>(PARTIES_TABLE, { id: customerPartyId });
  if (!party) return null;

  return {
    seed_shipment_id: tracking.shipment_id,
    seed_tracking_token: token,
    customer_party_id: customerPartyId,
    customer_name: party.name,
    customer_phone: party.phone ?? null,
    customer_address: party.address ?? null,
    customer_phone_last4: last4Digits(party.phone ?? null),
  };
}

export async function listCustomerVisibleSteps(shipmentId: number) {
  const steps = await scanAll<{
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
    shipment_id: number;
    customer_visible: 0 | 1;
  }>(SHIPMENT_STEPS_TABLE);

  return steps
    .filter((step) => step.shipment_id === shipmentId && step.customer_visible === 1)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((step) => ({
      id: step.id,
      sort_order: step.sort_order,
      name: step.name,
      status: step.status,
      started_at: step.started_at,
      completed_at: step.completed_at,
      is_external: step.is_external,
      field_schema_json: step.field_schema_json,
      field_values_json: step.field_values_json,
      required_fields_json: step.required_fields_json,
    }));
}

export async function listCustomerVisibleDocuments(shipmentId: number) {
  const docs = await scanAll<{
    id: number;
    shipment_id: number;
    document_type: string;
    file_name: string;
    uploaded_at: string;
    share_with_customer: 0 | 1;
  }>(DOCUMENTS_TABLE);

  return docs
    .filter((doc) => doc.shipment_id === shipmentId && doc.share_with_customer === 1)
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    .map((doc) => ({
      id: doc.id,
      document_type: doc.document_type,
      file_name: doc.file_name,
      uploaded_at: doc.uploaded_at,
    }));
}

export async function listCustomerDocumentRequests(shipmentId: number) {
  const requests = await scanAll<{
    id: number;
    shipment_id: number;
    document_type: string;
    message: string | null;
    status: "OPEN" | "FULFILLED";
    requested_at: string;
    fulfilled_at: string | null;
  }>(DOCUMENT_REQUESTS_TABLE);

  return requests
    .filter((request) => request.shipment_id === shipmentId)
    .sort((a, b) => b.requested_at.localeCompare(a.requested_at))
    .map((request) => ({
      id: request.id,
      document_type: request.document_type,
      message: request.message,
      status: request.status,
      requested_at: request.requested_at,
      fulfilled_at: request.fulfilled_at,
    }));
}

function last4Digits(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D+/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

export async function getTrackingCustomerPhoneLast4(token: string): Promise<string | null> {
  const context = await getTrackingCustomerContext(token);
  return context?.customer_phone_last4 ?? null;
}

export async function shipmentBelongsToTrackingCustomer(
  customerPartyId: number,
  shipmentId: number,
): Promise<boolean> {
  const shipment = await getItem<{ id: number; customer_party_id: number | null }>(
    SHIPMENTS_TABLE,
    { id: shipmentId },
  );
  if (!shipment) return false;
  if (shipment.customer_party_id === customerPartyId) return true;

  const shipmentCustomers = await scanAll<ShipmentCustomerRow>(SHIPMENT_CUSTOMERS_TABLE);
  return shipmentCustomers.some(
    (row) => row.shipment_id === shipmentId && row.customer_party_id === customerPartyId,
  );
}

export async function listTrackingPortalShipments(
  customerPartyId: number,
): Promise<TrackingPortalShipmentSummary[]> {
  const [shipments, shipmentCustomers, trackingTokens, steps, docs, requests, exceptions] =
    await Promise.all([
      scanAll<{
        id: number;
        shipment_code: string;
        transport_mode: TransportMode;
        origin: string;
        destination: string;
        overall_status: ShipmentOverallStatus;
        last_update_at: string;
        customer_party_id: number | null;
      }>(SHIPMENTS_TABLE),
      scanAll<ShipmentCustomerRow>(SHIPMENT_CUSTOMERS_TABLE),
      scanAll<TrackingTokenRow>(TRACKING_TOKENS_TABLE),
      scanAll<{
        shipment_id: number;
        name: string;
        customer_visible: 0 | 1;
      }>(SHIPMENT_STEPS_TABLE),
      scanAll<{
        shipment_id: number;
        share_with_customer: 0 | 1;
      }>(DOCUMENTS_TABLE),
      scanAll<{
        shipment_id: number;
        status: "OPEN" | "FULFILLED";
      }>(DOCUMENT_REQUESTS_TABLE),
      scanAll<{
        shipment_id: number;
        share_with_customer: 0 | 1;
      }>(SHIPMENT_EXCEPTIONS_TABLE),
    ]);

  const shipmentIds = new Set<number>();
  for (const shipment of shipments) {
    if (shipment.customer_party_id === customerPartyId) {
      shipmentIds.add(shipment.id);
    }
  }
  for (const row of shipmentCustomers) {
    if (row.customer_party_id === customerPartyId) {
      shipmentIds.add(row.shipment_id);
    }
  }

  const tokenByShipment = new Map<number, { token: string; created_at: string }>();
  for (const token of trackingTokens) {
    if (token.revoked_at || !token.created_at) continue;
    const existing = tokenByShipment.get(token.shipment_id);
    if (!existing || token.created_at > existing.created_at) {
      tokenByShipment.set(token.shipment_id, {
        token: token.token,
        created_at: token.created_at,
      });
    }
  }

  const customerVisibleShipments = new Set(
    steps.filter((step) => step.customer_visible === 1).map((step) => step.shipment_id),
  );
  const stepNamesByShipment = new Map<number, Set<string>>();
  for (const step of steps) {
    const current = stepNamesByShipment.get(step.shipment_id) ?? new Set<string>();
    current.add(step.name);
    stepNamesByShipment.set(step.shipment_id, current);
  }
  const ftlPortalShipments = new Set<number>();
  for (const [shipmentId, stepNames] of stepNamesByShipment.entries()) {
    if (fallbackIsFtlStepSet(stepNames)) {
      ftlPortalShipments.add(shipmentId);
    }
  }

  const sharedDocShipments = new Set(
    docs.filter((doc) => doc.share_with_customer === 1).map((doc) => doc.shipment_id),
  );
  const requestShipments = new Set(requests.map((request) => request.shipment_id));
  const exceptionShipments = new Set(
    exceptions
      .filter((exception) => exception.share_with_customer === 1)
      .map((exception) => exception.shipment_id),
  );

  return shipments
    .filter((shipment) => shipmentIds.has(shipment.id))
    .map((shipment) => ({
      id: shipment.id,
      shipment_code: shipment.shipment_code,
      transport_mode: shipment.transport_mode,
      origin: shipment.origin,
      destination: shipment.destination,
      overall_status: shipment.overall_status,
      last_update_at: shipment.last_update_at,
      tracking_token: tokenByShipment.get(shipment.id)?.token ?? null,
      has_portal_content:
        customerVisibleShipments.has(shipment.id) ||
        sharedDocShipments.has(shipment.id) ||
        requestShipments.has(shipment.id) ||
        exceptionShipments.has(shipment.id) ||
        ftlPortalShipments.has(shipment.id),
    }))
    .sort((a, b) => b.last_update_at.localeCompare(a.last_update_at));
}

export async function listCustomerVisibleExceptions(shipmentId: number) {
  const [exceptions, types] = await Promise.all([
    scanAll<{
      id: number;
      shipment_id: number;
      exception_type_id: number;
      status: "OPEN" | "RESOLVED";
      created_at: string;
      customer_message: string | null;
      share_with_customer: 0 | 1;
    }>(SHIPMENT_EXCEPTIONS_TABLE),
    scanAll<{ id: number; name: string; default_risk: string }>(EXCEPTION_TYPES_TABLE),
  ]);

  const typeMap = new Map(types.map((type) => [type.id, type]));

  return exceptions
    .filter((ex) => ex.shipment_id === shipmentId && ex.share_with_customer === 1)
    .map((ex) => {
      const type = typeMap.get(ex.exception_type_id);
      return {
        id: ex.id,
        status: ex.status,
        created_at: ex.created_at,
        exception_name: type?.name ?? "Unknown",
        default_risk: type?.default_risk ?? "ON_TRACK",
        customer_message: ex.customer_message ?? null,
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 50);
}

export async function listTrackingConnectedShipments(
  shipmentId: number,
): Promise<TrackingConnectedShipment[]> {
  const [links, shipments, shipmentCustomers, trackingTokens] =
    await Promise.all([
      scanAll<{
        shipment_id: number;
        connected_shipment_id: number;
        shipment_label: string | null;
        connected_label: string | null;
      }>(SHIPMENT_LINKS_TABLE),
      scanAll<{
        id: number;
        shipment_code: string;
        origin: string;
        destination: string;
        overall_status: ShipmentOverallStatus;
        last_update_at: string;
      }>(SHIPMENTS_TABLE),
      scanAll<{ shipment_id: number; customer_party_id: number }>(
        SHIPMENT_CUSTOMERS_TABLE,
      ),
      scanAll<{ token: string; shipment_id: number; created_at: string; revoked_at: string | null }>(
        TRACKING_TOKENS_TABLE,
      ),
    ]);

  const currentCustomers = new Set(
    shipmentCustomers
      .filter((row) => row.shipment_id === shipmentId)
      .map((row) => row.customer_party_id),
  );

  if (!currentCustomers.size) return [];

  const shipmentsById = new Map(shipments.map((s) => [s.id, s]));
  const tokenByShipment = new Map<number, { token: string; created_at: string }>();
  for (const token of trackingTokens) {
    if (token.revoked_at) continue;
    const existing = tokenByShipment.get(token.shipment_id);
    if (!existing || token.created_at > existing.created_at) {
      tokenByShipment.set(token.shipment_id, {
        token: token.token,
        created_at: token.created_at,
      });
    }
  }

  const connectedShipments: TrackingConnectedShipment[] = [];

  for (const link of links) {
    const isCurrent = link.shipment_id === shipmentId;
    const isConnected = link.connected_shipment_id === shipmentId;
    if (!isCurrent && !isConnected) continue;

    const connectedId = isCurrent ? link.connected_shipment_id : link.shipment_id;
    const connectedCustomers = shipmentCustomers
      .filter((row) => row.shipment_id === connectedId)
      .map((row) => row.customer_party_id);
    const sharesCustomer = connectedCustomers.some((id) => currentCustomers.has(id));
    if (!sharesCustomer) continue;

    const connectedShipment = shipmentsById.get(connectedId);
    if (!connectedShipment) continue;

    const shipmentLabel = isCurrent ? link.shipment_label : link.connected_label;
    const connectedLabel = isCurrent ? link.connected_label : link.shipment_label;

    connectedShipments.push({
      id: connectedShipment.id,
      shipment_code: connectedShipment.shipment_code,
      origin: connectedShipment.origin,
      destination: connectedShipment.destination,
      overall_status: connectedShipment.overall_status,
      shipment_label: shipmentLabel ?? null,
      connected_label: connectedLabel ?? null,
      tracking_token: tokenByShipment.get(connectedShipment.id)?.token ?? null,
    });
  }

  return connectedShipments.sort((a, b) => {
    const aShipment = shipmentsById.get(a.id);
    const bShipment = shipmentsById.get(b.id);
    const aUpdate = aShipment?.last_update_at ?? "";
    const bUpdate = bShipment?.last_update_at ?? "";
    return bUpdate.localeCompare(aUpdate);
  });
}
