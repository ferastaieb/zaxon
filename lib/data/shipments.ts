import "server-only";

import crypto from "node:crypto";

import type {
  ShipmentOverallStatus,
  ShipmentRisk,
  ShipmentType,
  StepStatus,
  TransportMode,
} from "@/lib/domain";
import { parseChecklistGroupsJson, type ChecklistGroup } from "@/lib/checklists";
import type { PartyRow } from "@/lib/data/parties";
import { jsonParse } from "@/lib/sql";
import { mapStopCountdownPaths, parseStepFieldSchema } from "@/lib/stepFields";
import { listActiveUserIdsByRole } from "@/lib/data/users";
import { listTemplateSteps } from "@/lib/data/workflows";
import {
  getItem,
  nextId,
  nowIso,
  putItem,
  scanAll,
  tableName,
  updateItem,
  deleteItem,
} from "@/lib/db";

export const ShipmentKinds = ["STANDARD", "MASTER", "SUBSHIPMENT"] as const;
export type ShipmentKind = (typeof ShipmentKinds)[number];
export const ShipmentListSortByValues = [
  "last_update",
  "shipment_code",
  "status",
  "kind",
  "mode",
  "customer",
] as const;
export type ShipmentListSortBy = (typeof ShipmentListSortByValues)[number];
export const ShipmentListSortDirValues = ["asc", "desc"] as const;
export type ShipmentListSortDir = (typeof ShipmentListSortDirValues)[number];

export type ShipmentRow = {
  id: number;
  shipment_code: string;
  customer_party_id: number | null;
  shipment_kind?: ShipmentKind | null;
  master_shipment_id?: number | null;
  transport_mode: TransportMode;
  origin: string;
  destination: string;
  shipment_type: ShipmentType;
  container_number: string | null;
  bl_number: string | null;
  job_id?: string | null;
  cargo_description: string;
  packages_count: number | null;
  weight_kg: number | null;
  dimensions: string | null;
  etd: string | null;
  eta: string | null;
  overall_status: ShipmentOverallStatus;
  risk: ShipmentRisk;
  workflow_template_id: number | null;
  workflow_global_values_json: string;
  last_update_at: string;
  last_update_by_user_id: number | null;
  created_at: string;
  created_by_user_id: number | null;
};

export type ShipmentListRow = {
  id: number;
  shipment_code: string;
  shipment_kind: ShipmentKind;
  master_shipment_id: number | null;
  master_shipment_code: string | null;
  job_ids: string | null;
  customer_names: string | null;
  transport_mode: TransportMode;
  shipment_type: ShipmentType;
  cargo_description: string;
  origin: string;
  destination: string;
  overall_status: ShipmentOverallStatus;
  risk: ShipmentRisk;
  last_update_at: string;
  etd: string | null;
  eta: string | null;
};

export type ShipmentConnectOption = {
  id: number;
  shipment_code: string;
  customer_names: string | null;
  origin: string;
  destination: string;
  last_update_at: string;
};

export type ShipmentStepRow = {
  id: number;
  shipment_id: number;
  sort_order: number;
  name: string;
  owner_role: string;
  related_party_id: number | null;
  status: StepStatus;
  notes: string | null;
  required_fields_json: string;
  required_document_types_json: string;
  field_values_json: string;
  field_schema_json: string;
  sla_hours: number | null;
  due_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  customer_visible: 0 | 1;
  is_external: 0 | 1;
  checklist_groups_json: string;
  depends_on_step_ids_json: string;
  customer_completion_message_template: string | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentJobIdRow = {
  id: number;
  shipment_id: number;
  job_id: string;
  created_at: string;
  created_by_user_id: number | null;
  created_by_name: string | null;
};

export type MasterSubshipmentRow = ShipmentRow & {
  shipment_kind: ShipmentKind;
  master_shipment_id: number;
  customer_names: string | null;
  job_ids: string | null;
};

const SHIPMENTS_TABLE = tableName("shipments");
const SHIPMENT_CUSTOMERS_TABLE = tableName("shipment_customers");
const SHIPMENT_ACCESS_TABLE = tableName("shipment_access");
const SHIPMENT_STEPS_TABLE = tableName("shipment_steps");
const SHIPMENT_JOB_IDS_TABLE = tableName("shipment_job_ids");
const TRACKING_TOKENS_TABLE = tableName("tracking_tokens");
const ACTIVITIES_TABLE = tableName("activities");
const USERS_TABLE = tableName("users");
const PARTIES_TABLE = tableName("parties");
const COUNTERS_TABLE = tableName("counters");

const SHIPMENT_CODE_COUNTER_STANDARD = "shipment_codes_standard";
const SHIPMENT_CODE_COUNTER_MASTER = "shipment_codes_master";

function normalizeShipmentKind(
  value: unknown,
  masterShipmentId: number | null | undefined,
): ShipmentKind {
  if (value === "MASTER") return "MASTER";
  if (value === "SUBSHIPMENT") return "SUBSHIPMENT";
  if (value === "STANDARD") return "STANDARD";
  if (typeof masterShipmentId === "number" && Number.isFinite(masterShipmentId) && masterShipmentId > 0) {
    return "SUBSHIPMENT";
  }
  return "STANDARD";
}

function shipmentStatusSortRank(status: ShipmentOverallStatus) {
  switch (status) {
    case "CREATED":
      return 0;
    case "IN_PROGRESS":
      return 1;
    case "COMPLETED":
      return 2;
    case "DELAYED":
      return 3;
  }
}

function shipmentKindSortRank(kind: ShipmentKind) {
  switch (kind) {
    case "MASTER":
      return 0;
    case "STANDARD":
      return 1;
    case "SUBSHIPMENT":
      return 2;
  }
}

function compareShipmentsWithSort(
  left: ShipmentListRow,
  right: ShipmentListRow,
  sortBy: ShipmentListSortBy,
  sortDir: ShipmentListSortDir,
) {
  const direction = sortDir === "asc" ? 1 : -1;
  let base = 0;

  switch (sortBy) {
    case "last_update":
      base = left.last_update_at.localeCompare(right.last_update_at);
      break;
    case "shipment_code":
      base = left.shipment_code.localeCompare(right.shipment_code);
      break;
    case "status":
      base =
        shipmentStatusSortRank(left.overall_status) -
        shipmentStatusSortRank(right.overall_status);
      break;
    case "kind":
      base =
        shipmentKindSortRank(left.shipment_kind) -
        shipmentKindSortRank(right.shipment_kind);
      break;
    case "mode":
      base = left.transport_mode.localeCompare(right.transport_mode);
      break;
    case "customer":
      base = (left.customer_names ?? "").localeCompare(right.customer_names ?? "");
      break;
  }

  if (base !== 0) return base * direction;

  const tieByUpdate = right.last_update_at.localeCompare(left.last_update_at);
  if (tieByUpdate !== 0) return tieByUpdate;
  return right.id - left.id;
}

function parseShipmentCodeSequence(input: string, prefix: "SHP" | "MSH") {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const match = pattern.exec((input ?? "").trim().toUpperCase());
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function finalShipmentCode(prefix: "SHP" | "MSH", sequence: number) {
  return `${prefix}-${String(sequence).padStart(6, "0")}`;
}

async function ensureShipmentCodeCounterInitialized(kind: ShipmentKind) {
  const isMaster = kind === "MASTER";
  const entity = isMaster
    ? SHIPMENT_CODE_COUNTER_MASTER
    : SHIPMENT_CODE_COUNTER_STANDARD;
  const existing = await getItem<{ entity: string; value?: number }>(
    COUNTERS_TABLE,
    { entity },
  );
  if (typeof existing?.value === "number") return;

  const prefix: "SHP" | "MSH" = isMaster ? "MSH" : "SHP";
  const shipments = await scanAll<{ shipment_code: string }>(SHIPMENTS_TABLE);
  let maxSequence = 0;
  for (const shipment of shipments) {
    const sequence = parseShipmentCodeSequence(shipment.shipment_code, prefix);
    if (!sequence) continue;
    if (sequence > maxSequence) maxSequence = sequence;
  }

  await putItem(
    COUNTERS_TABLE,
    { entity, value: maxSequence },
    { conditionExpression: "attribute_not_exists(entity)" },
  );
}

async function allocateShipmentCode(kind: ShipmentKind) {
  const isMaster = kind === "MASTER";
  const prefix: "SHP" | "MSH" = isMaster ? "MSH" : "SHP";
  const entity = isMaster
    ? SHIPMENT_CODE_COUNTER_MASTER
    : SHIPMENT_CODE_COUNTER_STANDARD;
  await ensureShipmentCodeCounterInitialized(kind);
  const sequence = await nextId(entity);
  return finalShipmentCode(prefix, sequence);
}

export function parseRequiredFields(step: ShipmentStepRow): string[] {
  return jsonParse(step.required_fields_json, [] as string[]);
}

export function parseRequiredDocumentTypes(step: ShipmentStepRow): string[] {
  return jsonParse(step.required_document_types_json, [] as string[]);
}

export function parseFieldValues(step: ShipmentStepRow): Record<string, unknown> {
  return jsonParse(step.field_values_json, {} as Record<string, unknown>);
}

export function parseChecklistGroups(step: ShipmentStepRow): ChecklistGroup[] {
  return parseChecklistGroupsJson(step.checklist_groups_json);
}

export async function createTrackingToken(shipmentId: number): Promise<string> {
  const createdAt = nowIso();
  for (let i = 0; i < 5; i += 1) {
    const token = crypto.randomBytes(18).toString("base64url");
    const created = await putItem(
      TRACKING_TOKENS_TABLE,
      {
        token,
        shipment_id: shipmentId,
        created_at: createdAt,
        revoked_at: null,
      },
      {
        conditionExpression: "attribute_not_exists(#token)",
        expressionNames: { "#token": "token" },
      },
    );
    if (created) return token;
  }
  throw new Error("Failed to generate tracking token");
}

export async function getTrackingTokenForShipment(
  shipmentId: number,
): Promise<string | null> {
  const tokens = await scanAll<{ token: string; shipment_id: number; revoked_at: string | null; created_at: string }>(
    TRACKING_TOKENS_TABLE,
  );
  const active = tokens
    .filter((row) => row.shipment_id === shipmentId && !row.revoked_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return active[0]?.token ?? null;
}

export async function listShipmentsForUser(input: {
  userId: number;
  role: string;
  q?: string;
  customerId?: number;
  transportMode?: TransportMode;
  status?: ShipmentOverallStatus;
  kind?: ShipmentKind;
  masterShipmentCode?: string;
  sortBy?: ShipmentListSortBy;
  sortDir?: ShipmentListSortDir;
}) {
  const [shipments, shipmentCustomers, parties, jobIds, accessRows] =
    await Promise.all([
      scanAll<ShipmentRow>(SHIPMENTS_TABLE),
      scanAll<{ shipment_id: number; customer_party_id: number }>(
        SHIPMENT_CUSTOMERS_TABLE,
      ),
      scanAll<{ id: number; name: string }>(PARTIES_TABLE),
      scanAll<{ shipment_id: number; job_id: string }>(SHIPMENT_JOB_IDS_TABLE),
      scanAll<{ shipment_id: number; user_id: number }>(SHIPMENT_ACCESS_TABLE),
    ]);

  const canAccessAll = input.role === "ADMIN" || input.role === "FINANCE";
  const accessSet = new Set<number>();
  if (!canAccessAll) {
    for (const row of accessRows) {
      if (row.user_id === input.userId) accessSet.add(row.shipment_id);
    }
  }

  const customerMap = new Map<number, number[]>();
  for (const row of shipmentCustomers) {
    if (!customerMap.has(row.shipment_id)) {
      customerMap.set(row.shipment_id, []);
    }
    customerMap.get(row.shipment_id)?.push(row.customer_party_id);
  }

  const partyNames = new Map(parties.map((party) => [party.id, party.name]));
  const jobIdsByShipment = new Map<number, string[]>();
  for (const row of jobIds) {
    if (!jobIdsByShipment.has(row.shipment_id)) {
      jobIdsByShipment.set(row.shipment_id, []);
    }
    jobIdsByShipment.get(row.shipment_id)?.push(row.job_id);
  }

  const query = input.q?.trim();
  const queryLower = query?.toLowerCase();
  const masterCodeQuery = input.masterShipmentCode?.trim().toUpperCase() ?? "";
  const sortBy = ShipmentListSortByValues.includes(input.sortBy as ShipmentListSortBy)
    ? (input.sortBy as ShipmentListSortBy)
    : "last_update";
  const sortDir = ShipmentListSortDirValues.includes(input.sortDir as ShipmentListSortDir)
    ? (input.sortDir as ShipmentListSortDir)
    : sortBy === "last_update"
      ? "desc"
      : "asc";
  const shipmentCodeById = new Map(shipments.map((shipment) => [shipment.id, shipment.shipment_code]));

  return shipments
    .filter((shipment) => (canAccessAll ? true : accessSet.has(shipment.id)))
    .filter((shipment) =>
      input.customerId
        ? customerMap.get(shipment.id)?.includes(input.customerId) ?? false
        : true,
    )
    .filter((shipment) =>
      input.transportMode ? shipment.transport_mode === input.transportMode : true,
    )
    .filter((shipment) => (input.status ? shipment.overall_status === input.status : true))
    .filter((shipment) =>
      input.kind
        ? normalizeShipmentKind(
            shipment.shipment_kind,
            shipment.master_shipment_id ?? null,
          ) === input.kind
        : true,
    )
    .filter((shipment) => {
      if (!masterCodeQuery) return true;
      const masterShipmentId =
        typeof shipment.master_shipment_id === "number" &&
        Number.isFinite(shipment.master_shipment_id)
          ? shipment.master_shipment_id
          : null;
      if (!masterShipmentId) return false;
      const masterCode = shipmentCodeById.get(masterShipmentId);
      if (!masterCode) return false;
      return masterCode.toUpperCase().includes(masterCodeQuery);
    })
    .filter((shipment) => {
      if (!query) return true;
      const customerNames = (customerMap.get(shipment.id) ?? [])
        .map((id) => partyNames.get(id) ?? "")
        .join(" ")
        .toLowerCase();
      const jobMatches = (jobIdsByShipment.get(shipment.id) ?? []).some((jobId) =>
        jobId.includes(query),
      );
      return (
        shipment.shipment_code.includes(query) ||
        (shipment.container_number ?? "").includes(query) ||
        (shipment.bl_number ?? "").includes(query) ||
        jobMatches ||
        (queryLower ? customerNames.includes(queryLower) : false)
      );
    })
    .map((shipment) => {
      const shipmentKind = normalizeShipmentKind(
        shipment.shipment_kind,
        shipment.master_shipment_id ?? null,
      );
      const masterShipmentId =
        typeof shipment.master_shipment_id === "number" &&
        Number.isFinite(shipment.master_shipment_id)
          ? shipment.master_shipment_id
          : null;
      const customerNames = (customerMap.get(shipment.id) ?? [])
        .map((id) => partyNames.get(id))
        .filter((name): name is string => !!name);
      const jobList = jobIdsByShipment.get(shipment.id) ?? [];
      return {
        id: shipment.id,
        shipment_code: shipment.shipment_code,
        shipment_kind: shipmentKind,
        master_shipment_id: masterShipmentId,
        master_shipment_code: masterShipmentId
          ? shipmentCodeById.get(masterShipmentId) ?? null
          : null,
        job_ids: jobList.length ? jobList.join(", ") : null,
        customer_names: customerNames.length
          ? Array.from(new Set(customerNames)).join(", ")
          : null,
        transport_mode: shipment.transport_mode,
        shipment_type: shipment.shipment_type,
        cargo_description: shipment.cargo_description,
        origin: shipment.origin,
        destination: shipment.destination,
        overall_status: shipment.overall_status,
        risk: shipment.risk,
        last_update_at: shipment.last_update_at,
        etd: shipment.etd ?? null,
        eta: shipment.eta ?? null,
      } as ShipmentListRow;
    })
    .sort((a, b) => compareShipmentsWithSort(a, b, sortBy, sortDir))
    .slice(0, 500);
}

export async function listConnectableShipments(input: {
  customerPartyIds: number[];
  userId: number;
  role: string;
  excludeShipmentId?: number;
}) {
  const customerIds = Array.from(
    new Set(
      input.customerPartyIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  if (!customerIds.length) return [];

  const [shipments, shipmentCustomers, parties, accessRows] = await Promise.all([
    scanAll<ShipmentRow>(SHIPMENTS_TABLE),
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

  const customerMap = new Map<number, number[]>();
  for (const row of shipmentCustomers) {
    if (!customerMap.has(row.shipment_id)) {
      customerMap.set(row.shipment_id, []);
    }
    customerMap.get(row.shipment_id)?.push(row.customer_party_id);
  }

  const partyNames = new Map(parties.map((party) => [party.id, party.name]));

  return shipments
    .filter((shipment) => (canAccessAll ? true : accessSet.has(shipment.id)))
    .filter((shipment) =>
      input.excludeShipmentId ? shipment.id !== input.excludeShipmentId : true,
    )
    .filter((shipment) =>
      (customerMap.get(shipment.id) ?? []).some((id) => customerIds.includes(id)),
    )
    .map((shipment) => {
      const customerNames = (customerMap.get(shipment.id) ?? [])
        .map((id) => partyNames.get(id))
        .filter((name): name is string => !!name);
      return {
        id: shipment.id,
        shipment_code: shipment.shipment_code,
        customer_names: customerNames.length
          ? Array.from(new Set(customerNames)).join(", ")
          : null,
        origin: shipment.origin,
        destination: shipment.destination,
        last_update_at: shipment.last_update_at,
      } as ShipmentConnectOption;
    })
    .sort((a, b) => b.last_update_at.localeCompare(a.last_update_at))
    .slice(0, 500);
}

export async function listSubshipmentsForMaster(masterShipmentId: number) {
  const [shipments, shipmentCustomers, parties, jobIds] = await Promise.all([
    scanAll<ShipmentRow>(SHIPMENTS_TABLE),
    scanAll<{ shipment_id: number; customer_party_id: number }>(
      SHIPMENT_CUSTOMERS_TABLE,
    ),
    scanAll<{ id: number; name: string }>(PARTIES_TABLE),
    scanAll<{ shipment_id: number; job_id: string }>(SHIPMENT_JOB_IDS_TABLE),
  ]);

  const customerMap = new Map<number, number[]>();
  for (const row of shipmentCustomers) {
    if (!customerMap.has(row.shipment_id)) {
      customerMap.set(row.shipment_id, []);
    }
    customerMap.get(row.shipment_id)?.push(row.customer_party_id);
  }

  const partyNames = new Map(parties.map((party) => [party.id, party.name]));
  const jobIdsByShipment = new Map<number, string[]>();
  for (const row of jobIds) {
    if (!jobIdsByShipment.has(row.shipment_id)) {
      jobIdsByShipment.set(row.shipment_id, []);
    }
    jobIdsByShipment.get(row.shipment_id)?.push(row.job_id);
  }

  return shipments
    .filter((shipment) => {
      const shipmentKind = normalizeShipmentKind(
        shipment.shipment_kind,
        shipment.master_shipment_id ?? null,
      );
      if (shipmentKind !== "SUBSHIPMENT") return false;
      const linkedMasterId =
        typeof shipment.master_shipment_id === "number" &&
        Number.isFinite(shipment.master_shipment_id)
          ? shipment.master_shipment_id
          : null;
      return linkedMasterId === masterShipmentId;
    })
    .map((shipment) => {
      const customerNames = (customerMap.get(shipment.id) ?? [])
        .map((id) => partyNames.get(id))
        .filter((name): name is string => !!name);
      const jobList = jobIdsByShipment.get(shipment.id) ?? [];
      return {
        ...shipment,
        shipment_kind: "SUBSHIPMENT",
        master_shipment_id: masterShipmentId,
        customer_names: customerNames.length
          ? Array.from(new Set(customerNames)).join(", ")
          : null,
        job_ids: jobList.length ? jobList.join(", ") : null,
      } as MasterSubshipmentRow;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getShipment(
  shipmentId: number,
): Promise<(ShipmentRow & { customer_names: string | null }) | null> {
  const shipment = await getItem<ShipmentRow>(SHIPMENTS_TABLE, { id: shipmentId });
  if (!shipment) return null;

  const [shipmentCustomers, parties] = await Promise.all([
    scanAll<{ shipment_id: number; customer_party_id: number }>(
      SHIPMENT_CUSTOMERS_TABLE,
    ),
    scanAll<{ id: number; name: string }>(PARTIES_TABLE),
  ]);
  const partyNames = new Map(parties.map((party) => [party.id, party.name]));
  const customerNames = shipmentCustomers
    .filter((row) => row.shipment_id === shipmentId)
    .map((row) => partyNames.get(row.customer_party_id))
    .filter((name): name is string => !!name);

  return {
    ...shipment,
    customer_party_id: shipment.customer_party_id ?? null,
    shipment_kind: normalizeShipmentKind(
      shipment.shipment_kind,
      shipment.master_shipment_id ?? null,
    ),
    master_shipment_id:
      typeof shipment.master_shipment_id === "number" &&
      Number.isFinite(shipment.master_shipment_id)
        ? shipment.master_shipment_id
        : null,
    customer_names: customerNames.length
      ? Array.from(new Set(customerNames)).join(", ")
      : null,
  };
}

export async function getShipmentByCode(
  shipmentCode: string,
): Promise<(ShipmentRow & { customer_names: string | null }) | null> {
  const shipments = await scanAll<ShipmentRow>(SHIPMENTS_TABLE);
  const shipment = shipments.find((row) => row.shipment_code === shipmentCode);
  if (!shipment) return null;
  return await getShipment(shipment.id);
}

export async function listShipmentCustomers(shipmentId: number): Promise<PartyRow[]> {
  const [shipmentCustomers, parties] = await Promise.all([
    scanAll<{ shipment_id: number; customer_party_id: number }>(
      SHIPMENT_CUSTOMERS_TABLE,
    ),
    scanAll<PartyRow>(PARTIES_TABLE),
  ]);
  const partyMap = new Map(parties.map((party) => [party.id, party]));
  const customers = shipmentCustomers
    .filter((row) => row.shipment_id === shipmentId)
    .map((row) => partyMap.get(row.customer_party_id))
    .filter((party): party is PartyRow => !!party);
  return customers.sort((a, b) => a.name.localeCompare(b.name));
}

export async function deleteShipment(shipmentId: number) {
  await deleteItem(SHIPMENTS_TABLE, { id: shipmentId });
}

export async function listShipmentSteps(shipmentId: number) {
  const steps = await scanAll<ShipmentStepRow>(SHIPMENT_STEPS_TABLE);
  return steps
    .filter((row) => row.shipment_id === shipmentId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function updateShipmentWorkflowGlobals(input: {
  shipmentId: number;
  valuesJson: string;
  updatedByUserId?: number | null;
}) {
  await updateItem(
    SHIPMENTS_TABLE,
    { id: input.shipmentId },
    "SET workflow_global_values_json = :workflow_global_values_json, last_update_at = :last_update_at, last_update_by_user_id = :last_update_by_user_id",
    {
      ":workflow_global_values_json": input.valuesJson,
      ":last_update_at": nowIso(),
      ":last_update_by_user_id": input.updatedByUserId ?? null,
    },
  );
}

export async function listShipmentJobIds(shipmentId: number) {
  const [jobIds, users] = await Promise.all([
    scanAll<ShipmentJobIdRow>(SHIPMENT_JOB_IDS_TABLE),
    scanAll<{ id: number; name: string }>(USERS_TABLE),
  ]);
  const userMap = new Map(users.map((user) => [user.id, user.name]));

  return jobIds
    .filter((row) => row.shipment_id === shipmentId)
    .map((row) => ({
      ...row,
      created_by_name: row.created_by_user_id
        ? userMap.get(row.created_by_user_id) ?? null
        : null,
    }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function grantShipmentAccess(input: {
  shipmentId: number;
  userId: number;
  grantedByUserId?: number | null;
}) {
  await putItem(
    SHIPMENT_ACCESS_TABLE,
    {
      shipment_id: input.shipmentId,
      user_id: input.userId,
      granted_by_user_id: input.grantedByUserId ?? null,
      created_at: nowIso(),
    },
    {
      conditionExpression:
        "attribute_not_exists(shipment_id) AND attribute_not_exists(user_id)",
    },
  );
}

export async function createShipment(input: {
  customerPartyIds?: number[];
  transportMode: TransportMode;
  origin: string;
  destination: string;
  shipmentType: ShipmentType;
  cargoDescription: string;
  packagesCount?: number | null;
  weightKg?: number | null;
  dimensions?: string | null;
  etd?: string | null;
  eta?: string | null;
  containerNumber?: string | null;
  blNumber?: string | null;
  jobIds?: string[];
  workflowTemplateId?: number | null;
  shipmentKind?: ShipmentKind;
  masterShipmentId?: number | null;
  skipTrackingToken?: boolean;
  createdByUserId: number;
}) {
  const ts = nowIso();
  const shipmentKind = normalizeShipmentKind(
    input.shipmentKind ?? "STANDARD",
    input.masterShipmentId ?? null,
  );
  const customerIds = Array.from(
    new Set(
      (input.customerPartyIds ?? [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );
  if (shipmentKind === "MASTER" && customerIds.length) {
    throw new Error("Master shipment cannot have customers");
  }
  if (shipmentKind === "SUBSHIPMENT" && customerIds.length !== 1) {
    throw new Error("Subshipment must have exactly one customer");
  }
  if (shipmentKind === "STANDARD" && customerIds.length < 1) {
    throw new Error("Shipment must have at least one customer");
  }
  const primaryCustomerId = shipmentKind === "MASTER" ? null : (customerIds[0] ?? null);

  const masterShipmentId =
    shipmentKind === "SUBSHIPMENT"
      ? Number(input.masterShipmentId ?? 0)
      : null;
  if (shipmentKind === "SUBSHIPMENT" && (!Number.isFinite(masterShipmentId) || !masterShipmentId)) {
    throw new Error("Subshipment must be linked to a master shipment");
  }

  const shipmentId = await nextId("shipments");
  const shipmentCode = await allocateShipmentCode(shipmentKind);

  await putItem(SHIPMENTS_TABLE, {
    id: shipmentId,
    shipment_code: shipmentCode,
    customer_party_id: primaryCustomerId,
    shipment_kind: shipmentKind,
    master_shipment_id: masterShipmentId,
    transport_mode: input.transportMode,
    origin: input.origin,
    destination: input.destination,
    shipment_type: input.shipmentType,
    container_number: input.containerNumber ?? null,
    bl_number: input.blNumber ?? null,
    cargo_description: input.cargoDescription,
    packages_count: input.packagesCount ?? null,
    weight_kg: input.weightKg ?? null,
    dimensions: input.dimensions ?? null,
    etd: input.etd ?? null,
    eta: input.eta ?? null,
    overall_status: "CREATED",
    risk: "ON_TRACK",
    workflow_template_id: input.workflowTemplateId ?? null,
    workflow_global_values_json: "{}",
    last_update_at: ts,
    last_update_by_user_id: input.createdByUserId,
    created_at: ts,
    created_by_user_id: input.createdByUserId,
  });

  if (customerIds.length) {
    for (const customerPartyId of customerIds) {
      await putItem(
        SHIPMENT_CUSTOMERS_TABLE,
        {
          shipment_id: shipmentId,
          customer_party_id: customerPartyId,
          created_at: ts,
          created_by_user_id: input.createdByUserId,
        },
        {
          conditionExpression:
            "attribute_not_exists(shipment_id) AND attribute_not_exists(customer_party_id)",
        },
      );
    }
  }

  if (input.jobIds?.length) {
    for (const jobId of input.jobIds) {
      const trimmed = jobId.trim();
      if (!trimmed) continue;
      const id = await nextId("shipment_job_ids");
      await putItem(SHIPMENT_JOB_IDS_TABLE, {
        id,
        shipment_id: shipmentId,
        job_id: trimmed,
        created_at: ts,
        created_by_user_id: input.createdByUserId,
      });
    }
  }

  await grantShipmentAccess({
    shipmentId,
    userId: input.createdByUserId,
    grantedByUserId: input.createdByUserId,
  });

  if (input.workflowTemplateId) {
    const templateSteps = await listTemplateSteps(input.workflowTemplateId);
    const stepIdMap = new Map<number, number>();

    for (const step of templateSteps) {
      const stepId = await nextId("shipment_steps");
      await putItem(SHIPMENT_STEPS_TABLE, {
        id: stepId,
        shipment_id: shipmentId,
        sort_order: step.sort_order,
        name: step.name,
        owner_role: step.owner_role,
        related_party_id: null,
        status: "PENDING",
        notes: null,
        required_fields_json: step.required_fields_json,
        required_document_types_json: step.required_document_types_json,
        field_values_json: "{}",
        field_schema_json: step.field_schema_json ?? "{}",
        is_external: step.is_external,
        checklist_groups_json: step.checklist_groups_json,
        depends_on_step_ids_json: JSON.stringify([]),
        sla_hours: step.sla_hours ?? null,
        due_at: null,
        started_at: null,
        completed_at: null,
        customer_visible: step.is_external ? 1 : step.customer_visible,
        customer_completion_message_template:
          step.customer_completion_message_template ?? null,
        created_at: ts,
        updated_at: ts,
      });

      stepIdMap.set(step.id, stepId);

      const userIds = await listActiveUserIdsByRole(step.owner_role);
      for (const userId of userIds) {
        await grantShipmentAccess({
          shipmentId,
          userId,
          grantedByUserId: input.createdByUserId,
        });
      }
    }

    if (stepIdMap.size) {
      for (const step of templateSteps) {
        const mappedId = stepIdMap.get(step.id);
        if (!mappedId) continue;
        const rawDeps = jsonParse(step.depends_on_step_ids_json, [] as number[]);
        if (rawDeps.length) {
          const mappedDeps = rawDeps
            .map((id) => stepIdMap.get(id))
            .filter((id): id is number => !!id);
          await updateItem(
            SHIPMENT_STEPS_TABLE,
            { id: mappedId },
            "SET depends_on_step_ids_json = :depends_on_step_ids_json",
            { ":depends_on_step_ids_json": JSON.stringify(mappedDeps) },
          );
        }
        const schema = parseStepFieldSchema(step.field_schema_json);
        if (schema.fields.length) {
          const mappedSchema = mapStopCountdownPaths(schema, (id) => stepIdMap.get(id) ?? null);
          if (JSON.stringify(schema) !== JSON.stringify(mappedSchema)) {
            await updateItem(
              SHIPMENT_STEPS_TABLE,
              { id: mappedId },
              "SET field_schema_json = :field_schema_json",
              { ":field_schema_json": JSON.stringify(mappedSchema) },
            );
          }
        }
      }
    }
  }

  const trackingToken =
    input.skipTrackingToken || shipmentKind === "MASTER"
      ? null
      : await createTrackingToken(shipmentId);

  await putItem(ACTIVITIES_TABLE, {
    id: await nextId("activities"),
    shipment_id: shipmentId,
    type: "CREATED",
    message: `Shipment created (${shipmentCode})`,
    actor_user_id: input.createdByUserId,
    created_at: ts,
    data_json: JSON.stringify({
      workflowTemplateId: input.workflowTemplateId ?? null,
      shipmentKind,
      masterShipmentId: masterShipmentId ?? null,
    }),
  });

  return { shipmentId, shipmentCode, trackingToken };
}

export async function syncShipmentStepsFromTemplate(input: {
  shipmentId: number;
  templateId: number;
  createdByUserId?: number | null;
}) {
  const [templateSteps, shipmentSteps] = await Promise.all([
    listTemplateSteps(input.templateId),
    listShipmentSteps(input.shipmentId),
  ]);

  if (!templateSteps.length) {
    return { added: 0 };
  }

  const existingByName = new Map(shipmentSteps.map((step) => [step.name, step]));
  const stepIdMap = new Map<number, number>();
  const createdStepIds = new Set<number>();
  const ts = nowIso();

  for (const step of templateSteps) {
    const existing = existingByName.get(step.name);
    if (existing) {
      stepIdMap.set(step.id, existing.id);
      continue;
    }

    const stepId = await nextId("shipment_steps");
    await putItem(SHIPMENT_STEPS_TABLE, {
      id: stepId,
      shipment_id: input.shipmentId,
      sort_order: step.sort_order,
      name: step.name,
      owner_role: step.owner_role,
      related_party_id: null,
      status: "PENDING",
      notes: null,
      required_fields_json: step.required_fields_json,
      required_document_types_json: step.required_document_types_json,
      field_values_json: "{}",
      field_schema_json: step.field_schema_json ?? "{}",
      is_external: step.is_external,
      checklist_groups_json: step.checklist_groups_json,
      depends_on_step_ids_json: JSON.stringify([]),
      sla_hours: step.sla_hours ?? null,
      due_at: null,
      started_at: null,
      completed_at: null,
      customer_visible: step.is_external ? 1 : step.customer_visible,
      customer_completion_message_template:
        step.customer_completion_message_template ?? null,
      created_at: ts,
      updated_at: ts,
    });

    stepIdMap.set(step.id, stepId);
    createdStepIds.add(stepId);

    const userIds = await listActiveUserIdsByRole(step.owner_role);
    for (const userId of userIds) {
      await grantShipmentAccess({
        shipmentId: input.shipmentId,
        userId,
        grantedByUserId: input.createdByUserId ?? null,
      });
    }
  }

  if (createdStepIds.size) {
    for (const step of templateSteps) {
      const mappedId = stepIdMap.get(step.id);
      if (!mappedId || !createdStepIds.has(mappedId)) continue;

      const updateParts: string[] = [];
      const values: Record<string, unknown> = {};

      const rawDeps = jsonParse(step.depends_on_step_ids_json, [] as number[]);
      if (rawDeps.length) {
        const mappedDeps = rawDeps
          .map((id) => stepIdMap.get(id))
          .filter((id): id is number => !!id);
        updateParts.push("depends_on_step_ids_json = :depends_on_step_ids_json");
        values[":depends_on_step_ids_json"] = JSON.stringify(mappedDeps);
      }

      const schema = parseStepFieldSchema(step.field_schema_json);
      if (schema.fields.length) {
        const mappedSchema = mapStopCountdownPaths(schema, (id) =>
          stepIdMap.get(id) ?? null,
        );
        if (JSON.stringify(schema) !== JSON.stringify(mappedSchema)) {
          updateParts.push("field_schema_json = :field_schema_json");
          values[":field_schema_json"] = JSON.stringify(mappedSchema);
        }
      }

      if (updateParts.length) {
        updateParts.push("updated_at = :updated_at");
        values[":updated_at"] = nowIso();
        await updateItem(
          SHIPMENT_STEPS_TABLE,
          { id: mappedId },
          `SET ${updateParts.join(", ")}`,
          values,
        );
      }
    }
  }

  return { added: createdStepIds.size };
}
