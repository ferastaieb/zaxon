import "server-only";

import {
  ShipmentOverallStatuses,
  StepStatuses,
  TransportModes,
  overallStatusLabel,
  transportModeLabel,
  type ShipmentOverallStatus,
  type ShipmentType,
  type StepStatus,
  type TransportMode,
} from "@/lib/domain";
import {
  ShipmentKinds,
  type ShipmentKind,
} from "@/lib/data/shipments";
import { scanAll, tableName } from "@/lib/db";
import { parseStepFieldValues } from "@/lib/stepFields";

export const OverviewRangeValues = ["7d", "30d", "90d", "all"] as const;
export type OverviewRange = (typeof OverviewRangeValues)[number];
export type OverviewDateBasis = "last_update";

export const OverviewFocusTypeValues = [
  "status",
  "kind",
  "mode",
  "customer",
  "lane",
  "agent",
  "tracking",
] as const;
export type OverviewFocusType = (typeof OverviewFocusTypeValues)[number];

type TrackingRegionId = "uae" | "ksa" | "jordan" | "syria";

type ShipmentScanRow = {
  id: number;
  shipment_code: string;
  shipment_kind?: ShipmentKind | null;
  master_shipment_id?: number | null;
  customer_party_id: number | null;
  transport_mode: TransportMode;
  shipment_type: ShipmentType;
  cargo_description: string;
  origin: string;
  destination: string;
  overall_status: ShipmentOverallStatus;
  workflow_template_id: number | null;
  last_update_at: string;
};

type ShipmentCustomerScanRow = {
  shipment_id: number;
  customer_party_id: number;
};

type PartyScanRow = {
  id: number;
  name: string;
};

type StepScanRow = {
  shipment_id: number;
  name: string;
  status: StepStatus;
  field_values_json: string;
};

type TrackingTokenScanRow = {
  shipment_id: number;
  token: string;
  revoked_at: string | null;
  created_at: string;
};

type TaskScanRow = {
  shipment_id: number;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "BLOCKED";
};

type ExceptionScanRow = {
  shipment_id: number;
  status: "OPEN" | "RESOLVED";
};

type DocumentRequestScanRow = {
  shipment_id: number;
  status: "OPEN" | "FULFILLED";
};

type ActivityScanRow = {
  id: number;
  shipment_id: number;
  type: string;
  message: string;
  actor_user_id: number | null;
  actor_name: string | null;
  created_at: string;
};

type UserScanRow = {
  id: number;
  name: string;
};

type WorkflowTemplateScanRow = {
  id: number;
  name: string;
};

type InternalAgentEntry = {
  border: string;
  agent: string;
  normalized_key: string;
  focus_value: string;
};

type InternalShipment = {
  id: number;
  shipment_code: string;
  shipment_kind: ShipmentKind;
  master_shipment_id: number | null;
  transport_mode: TransportMode;
  shipment_type: ShipmentType;
  cargo_description: string;
  origin: string;
  destination: string;
  overall_status: ShipmentOverallStatus;
  workflow_template_id: number | null;
  last_update_at: string;
  last_update_ms: number | null;
  customer_ids: number[];
  customer_names: string | null;
  is_tracked: boolean;
  customs_agents: InternalAgentEntry[];
  tracking_region_statuses: Partial<Record<TrackingRegionId, StepStatus>>;
};

type FocusMatcher = (shipment: InternalShipment) => boolean;

export type OverviewKpi = {
  id:
    | "total"
    | "in_progress"
    | "completed"
    | "delayed"
    | "masters"
    | "subshipments"
    | "tracked"
    | "active_customers";
  label: string;
  value: number;
  delta: number | null;
  focus_type: OverviewFocusType | null;
  focus_value: string | null;
};

export type OverviewDistributionRow = {
  key: string;
  label: string;
  count: number;
  percentage: number;
  focus_type: OverviewFocusType | null;
  focus_value: string | null;
};

export type OverviewLaneRow = {
  key: string;
  label: string;
  origin: string;
  destination: string;
  focus_value: string;
  total: number;
  in_progress: number;
  completed: number;
  delayed: number;
};

export type OverviewAgentRow = {
  key: string;
  border: string;
  agent: string;
  focus_value: string;
  shipment_count: number;
};

export type OverviewTrackingRegion = {
  region_id: TrackingRegionId;
  label: string;
  pending: number;
  in_progress: number;
  done: number;
  blocked: number;
};

export type OverviewTopCustomerRow = {
  customer_id: number;
  customer_name: string;
  shipment_count: number;
  completed_count: number;
  delayed_count: number;
  tracked_count: number;
  focus_value: string;
};

export type OverviewActivityRow = {
  id: number;
  shipment_id: number;
  shipment_code: string | null;
  type: string;
  message: string;
  actor_name: string | null;
  created_at: string;
};

export type OverviewWorkflowUsageRow = {
  template_id: number | null;
  template_name: string;
  shipment_count: number;
};

export type OverviewFocusedShipmentRow = {
  id: number;
  shipment_code: string;
  shipment_kind: ShipmentKind;
  master_shipment_id: number | null;
  customer_names: string | null;
  transport_mode: TransportMode;
  shipment_type: ShipmentType;
  cargo_description: string;
  overall_status: ShipmentOverallStatus;
  last_update_at: string;
  origin: string;
  destination: string;
  is_tracked: boolean;
};

export type OverviewFocusState = {
  requested_type: string | null;
  requested_value: string | null;
  type: OverviewFocusType | null;
  value: string | null;
  label: string | null;
  valid: boolean;
  match_count: number;
  shipments: OverviewFocusedShipmentRow[];
  available_by_range: Record<OverviewRange, boolean>;
};

export type OverviewRangeSummary = {
  range: OverviewRange;
  label: string;
  shipment_count: number;
};

export type ManagementOverviewData = {
  range: OverviewRange;
  date_basis: OverviewDateBasis;
  generated_at: string;
  period: {
    label: string;
    start_at: string | null;
    end_at: string;
    previous_start_at: string | null;
    previous_end_at: string | null;
  };
  range_summaries: OverviewRangeSummary[];
  kpis: OverviewKpi[];
  distributions: {
    by_status: OverviewDistributionRow[];
    by_kind: OverviewDistributionRow[];
    by_mode: OverviewDistributionRow[];
  };
  lanes: OverviewLaneRow[];
  agents: OverviewAgentRow[];
  tracking: {
    tracked: number;
    untracked: number;
    coverage_percent: number;
    regions: OverviewTrackingRegion[];
  };
  operational_health: {
    open_workload: number;
    open_tasks: number;
    in_progress_tasks: number;
    blocked_tasks: number;
    exceptions_open: number;
    exceptions_resolved: number;
    document_requests_open: number;
    document_requests_fulfilled: number;
  };
  top_customers: OverviewTopCustomerRow[];
  recent_activity: OverviewActivityRow[];
  workflows: OverviewWorkflowUsageRow[];
  focus: OverviewFocusState;
};

const SHIPMENTS_TABLE = tableName("shipments");
const SHIPMENT_CUSTOMERS_TABLE = tableName("shipment_customers");
const PARTIES_TABLE = tableName("parties");
const SHIPMENT_STEPS_TABLE = tableName("shipment_steps");
const TRACKING_TOKENS_TABLE = tableName("tracking_tokens");
const TASKS_TABLE = tableName("tasks");
const SHIPMENT_EXCEPTIONS_TABLE = tableName("shipment_exceptions");
const DOCUMENT_REQUESTS_TABLE = tableName("document_requests");
const ACTIVITIES_TABLE = tableName("activities");
const USERS_TABLE = tableName("users");
const WORKFLOW_TEMPLATES_TABLE = tableName("workflow_templates");

const DEFAULT_RANGE: OverviewRange = "30d";
const RANGE_DAYS: Record<Exclude<OverviewRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const CUSTOMS_STEP_NAME = "Customs agents allocation";
const TRACKING_STEP_NAMES: Record<TrackingRegionId, string> = {
  uae: "Tracking - UAE",
  ksa: "Tracking - KSA",
  jordan: "Tracking - Jordan",
  syria: "Tracking - Syria",
};
const TRACKING_REGION_LABELS: Record<TrackingRegionId, string> = {
  uae: "UAE",
  ksa: "KSA",
  jordan: "Jordan",
  syria: "Syria",
};

const BORDER_AGENT_FIELDS = [
  { border: "Jebel Ali", key: "jebel_ali_agent_name" },
  { border: "Sila", key: "sila_agent_name" },
  { border: "Batha", key: "batha_agent_name" },
  { border: "Omari", key: "omari_agent_name" },
  { border: "Naseeb", key: "naseeb_agent_name" },
  { border: "Mushtarakah", key: "mushtarakah_agent_name" },
  { border: "Masnaa", key: "masnaa_agent_name" },
] as const;

function normalizeShipmentKind(
  value: unknown,
  masterShipmentId: number | null | undefined,
): ShipmentKind {
  if (value === "MASTER") return "MASTER";
  if (value === "SUBSHIPMENT") return "SUBSHIPMENT";
  if (value === "STANDARD") return "STANDARD";
  if (
    typeof masterShipmentId === "number" &&
    Number.isFinite(masterShipmentId) &&
    masterShipmentId > 0
  ) {
    return "SUBSHIPMENT";
  }
  return "STANDARD";
}

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function normalizeTextKey(value: string): string {
  return value.trim().toLowerCase();
}

function safeTimeMs(isoValue: string): number | null {
  const parsed = Date.parse(isoValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function currentIso(nowMs: number): string {
  return new Date(nowMs).toISOString();
}

function parseRange(input: string | null | undefined): OverviewRange {
  if (OverviewRangeValues.includes(input as OverviewRange)) {
    return input as OverviewRange;
  }
  return DEFAULT_RANGE;
}

function rangeLabel(range: OverviewRange): string {
  if (range === "7d") return "Last 7 days";
  if (range === "30d") return "Last 30 days";
  if (range === "90d") return "Last 90 days";
  return "All time";
}

function rangeStartMs(range: OverviewRange, nowMs: number): number | null {
  if (range === "all") return null;
  const days = RANGE_DAYS[range];
  return nowMs - days * 24 * 60 * 60 * 1000;
}

function inCurrentRange(
  shipment: InternalShipment,
  range: OverviewRange,
  nowMs: number,
): boolean {
  if (range === "all") return true;
  if (shipment.last_update_ms === null) return false;
  const start = rangeStartMs(range, nowMs);
  if (start === null) return true;
  return shipment.last_update_ms >= start && shipment.last_update_ms <= nowMs;
}

function inPreviousRange(
  shipment: InternalShipment,
  range: OverviewRange,
  nowMs: number,
): boolean {
  if (range === "all") return false;
  if (shipment.last_update_ms === null) return false;
  const start = rangeStartMs(range, nowMs);
  if (start === null) return false;
  const spanMs = RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
  const previousStart = start - spanMs;
  return shipment.last_update_ms >= previousStart && shipment.last_update_ms < start;
}

function shipmentSummaryRow(shipment: InternalShipment): OverviewFocusedShipmentRow {
  return {
    id: shipment.id,
    shipment_code: shipment.shipment_code,
    shipment_kind: shipment.shipment_kind,
    master_shipment_id: shipment.master_shipment_id,
    customer_names: shipment.customer_names,
    transport_mode: shipment.transport_mode,
    shipment_type: shipment.shipment_type,
    cargo_description: shipment.cargo_description,
    overall_status: shipment.overall_status,
    last_update_at: shipment.last_update_at,
    origin: shipment.origin,
    destination: shipment.destination,
    is_tracked: shipment.is_tracked,
  };
}

function percentage(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function modeLabelForDistribution(mode: TransportMode): string {
  return transportModeLabel(mode);
}

function encodeLaneFocusValue(origin: string, destination: string): string {
  return `${origin}|||${destination}`;
}

function decodeLaneFocusValue(value: string): { origin: string; destination: string } | null {
  const separator = "|||";
  const index = value.indexOf(separator);
  if (index <= 0) return null;
  const origin = cleanText(value.slice(0, index));
  const destination = cleanText(value.slice(index + separator.length));
  if (!origin || !destination) return null;
  return { origin, destination };
}

function encodeAgentFocusValue(border: string, agent: string): string {
  return `${border}:::${agent}`;
}

function decodeAgentFocusValue(value: string): { border: string; agent: string } | null {
  const separator = ":::";
  const index = value.indexOf(separator);
  if (index <= 0) return null;
  const border = cleanText(value.slice(0, index));
  const agent = cleanText(value.slice(index + separator.length));
  if (!border || !agent) return null;
  return { border, agent };
}

function borderAgentValues(fieldValuesJson: string): InternalAgentEntry[] {
  const values = parseStepFieldValues(fieldValuesJson);
  const results: InternalAgentEntry[] = [];
  const seen = new Set<string>();

  for (const field of BORDER_AGENT_FIELDS) {
    const raw = values[field.key];
    const agent = typeof raw === "string" ? raw.trim() : "";
    if (!agent) continue;
    const normalized = `${normalizeTextKey(field.border)}::${normalizeTextKey(agent)}`;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    results.push({
      border: field.border,
      agent,
      normalized_key: normalized,
      focus_value: encodeAgentFocusValue(field.border, agent),
    });
  }

  return results;
}

function computeKpis(shipments: InternalShipment[]): Record<OverviewKpi["id"], number> {
  const totals: Record<OverviewKpi["id"], number> = {
    total: 0,
    in_progress: 0,
    completed: 0,
    delayed: 0,
    masters: 0,
    subshipments: 0,
    tracked: 0,
    active_customers: 0,
  };

  const customerSet = new Set<number>();
  for (const shipment of shipments) {
    totals.total += 1;
    if (shipment.overall_status === "IN_PROGRESS") totals.in_progress += 1;
    if (shipment.overall_status === "COMPLETED") totals.completed += 1;
    if (shipment.overall_status === "DELAYED") totals.delayed += 1;
    if (shipment.shipment_kind === "MASTER") totals.masters += 1;
    if (shipment.shipment_kind === "SUBSHIPMENT") totals.subshipments += 1;
    if (shipment.is_tracked) totals.tracked += 1;
    for (const customerId of shipment.customer_ids) {
      customerSet.add(customerId);
    }
  }

  totals.active_customers = customerSet.size;
  return totals;
}

function modeSortRank(mode: TransportMode): number {
  if (mode === "LAND") return 0;
  if (mode === "SEA_LAND") return 1;
  return 2;
}

function statusSortRank(status: ShipmentOverallStatus): number {
  if (status === "IN_PROGRESS") return 0;
  if (status === "COMPLETED") return 1;
  if (status === "DELAYED") return 2;
  return 3;
}

function buildFocus(
  shipmentsByRange: Record<OverviewRange, InternalShipment[]>,
  currentRange: OverviewRange,
  requestedType: string | null,
  requestedValue: string | null,
  partyNames: Map<number, string>,
): OverviewFocusState {
  const emptyAvailability: Record<OverviewRange, boolean> = {
    "7d": false,
    "30d": false,
    "90d": false,
    all: false,
  };

  if (!requestedType && !requestedValue) {
    return {
      requested_type: null,
      requested_value: null,
      type: null,
      value: null,
      label: null,
      valid: true,
      match_count: 0,
      shipments: [],
      available_by_range: emptyAvailability,
    };
  }

  if (!requestedType || !requestedValue) {
    return {
      requested_type: requestedType,
      requested_value: requestedValue,
      type: null,
      value: null,
      label: null,
      valid: false,
      match_count: 0,
      shipments: [],
      available_by_range: emptyAvailability,
    };
  }

  const requestedTypeNormalized = requestedType.trim().toLowerCase();
  if (!OverviewFocusTypeValues.includes(requestedTypeNormalized as OverviewFocusType)) {
    return {
      requested_type: requestedType,
      requested_value: requestedValue,
      type: null,
      value: null,
      label: null,
      valid: false,
      match_count: 0,
      shipments: [],
      available_by_range: emptyAvailability,
    };
  }

  const type = requestedTypeNormalized as OverviewFocusType;
  const value = requestedValue.trim();
  if (!value) {
    return {
      requested_type: requestedType,
      requested_value: requestedValue,
      type: null,
      value: null,
      label: null,
      valid: false,
      match_count: 0,
      shipments: [],
      available_by_range: emptyAvailability,
    };
  }

  let matcher: FocusMatcher | null = null;
  let label: string | null = null;

  if (type === "status") {
    if (!ShipmentOverallStatuses.includes(value as ShipmentOverallStatus)) {
      return {
        requested_type: requestedType,
        requested_value: requestedValue,
        type: null,
        value: null,
        label: null,
        valid: false,
        match_count: 0,
        shipments: [],
        available_by_range: emptyAvailability,
      };
    }
    const statusValue = value as ShipmentOverallStatus;
    matcher = (shipment) => shipment.overall_status === statusValue;
    label = `Status: ${overallStatusLabel(statusValue)}`;
  } else if (type === "kind") {
    if (!ShipmentKinds.includes(value as ShipmentKind)) {
      return {
        requested_type: requestedType,
        requested_value: requestedValue,
        type: null,
        value: null,
        label: null,
        valid: false,
        match_count: 0,
        shipments: [],
        available_by_range: emptyAvailability,
      };
    }
    const kindValue = value as ShipmentKind;
    matcher = (shipment) => shipment.shipment_kind === kindValue;
    label = `Kind: ${kindValue}`;
  } else if (type === "mode") {
    if (!TransportModes.includes(value as TransportMode)) {
      return {
        requested_type: requestedType,
        requested_value: requestedValue,
        type: null,
        value: null,
        label: null,
        valid: false,
        match_count: 0,
        shipments: [],
        available_by_range: emptyAvailability,
      };
    }
    const modeValue = value as TransportMode;
    matcher = (shipment) => shipment.transport_mode === modeValue;
    label = `Mode: ${transportModeLabel(modeValue)}`;
  } else if (type === "customer") {
    const customerId = Number(value);
    if (!Number.isFinite(customerId) || customerId < 1) {
      return {
        requested_type: requestedType,
        requested_value: requestedValue,
        type: null,
        value: null,
        label: null,
        valid: false,
        match_count: 0,
        shipments: [],
        available_by_range: emptyAvailability,
      };
    }
    matcher = (shipment) => shipment.customer_ids.includes(customerId);
    label = `Customer: ${partyNames.get(customerId) ?? `#${customerId}`}`;
  } else if (type === "lane") {
    const lane = decodeLaneFocusValue(value);
    if (!lane) {
      return {
        requested_type: requestedType,
        requested_value: requestedValue,
        type: null,
        value: null,
        label: null,
        valid: false,
        match_count: 0,
        shipments: [],
        available_by_range: emptyAvailability,
      };
    }
    const originKey = normalizeTextKey(lane.origin);
    const destinationKey = normalizeTextKey(lane.destination);
    matcher = (shipment) =>
      normalizeTextKey(shipment.origin) === originKey &&
      normalizeTextKey(shipment.destination) === destinationKey;
    label = `Lane: ${lane.origin} -> ${lane.destination}`;
  } else if (type === "agent") {
    const agentFocus = decodeAgentFocusValue(value);
    if (!agentFocus) {
      return {
        requested_type: requestedType,
        requested_value: requestedValue,
        type: null,
        value: null,
        label: null,
        valid: false,
        match_count: 0,
        shipments: [],
        available_by_range: emptyAvailability,
      };
    }
    const normalized = `${normalizeTextKey(agentFocus.border)}::${normalizeTextKey(
      agentFocus.agent,
    )}`;
    matcher = (shipment) =>
      shipment.customs_agents.some((entry) => entry.normalized_key === normalized);
    label = `Agent: ${agentFocus.border} - ${agentFocus.agent}`;
  } else if (type === "tracking") {
    const normalized = normalizeTextKey(value);
    if (normalized !== "tracked" && normalized !== "untracked") {
      return {
        requested_type: requestedType,
        requested_value: requestedValue,
        type: null,
        value: null,
        label: null,
        valid: false,
        match_count: 0,
        shipments: [],
        available_by_range: emptyAvailability,
      };
    }
    const isTracked = normalized === "tracked";
    matcher = (shipment) => shipment.is_tracked === isTracked;
    label = isTracked ? "Tracking: Tracked" : "Tracking: Untracked";
  }

  if (!matcher) {
    return {
      requested_type: requestedType,
      requested_value: requestedValue,
      type: null,
      value: null,
      label: null,
      valid: false,
      match_count: 0,
      shipments: [],
      available_by_range: emptyAvailability,
    };
  }

  const availability: Record<OverviewRange, boolean> = {
    "7d": shipmentsByRange["7d"].some(matcher),
    "30d": shipmentsByRange["30d"].some(matcher),
    "90d": shipmentsByRange["90d"].some(matcher),
    all: shipmentsByRange.all.some(matcher),
  };

  const currentMatches = shipmentsByRange[currentRange]
    .filter(matcher)
    .sort((left, right) => right.last_update_at.localeCompare(left.last_update_at))
    .slice(0, 200)
    .map(shipmentSummaryRow);

  return {
    requested_type: requestedType,
    requested_value: requestedValue,
    type,
    value,
    label,
    valid: true,
    match_count: currentMatches.length,
    shipments: currentMatches,
    available_by_range: availability,
  };
}

export async function getManagementOverview(input?: {
  range?: string | null;
  focusType?: string | null;
  focusValue?: string | null;
  nowIso?: string;
}): Promise<ManagementOverviewData> {
  const nowMs = input?.nowIso ? safeTimeMs(input.nowIso) ?? Date.now() : Date.now();
  const range = parseRange(input?.range ?? null);
  const requestedFocusType = input?.focusType?.trim() ?? null;
  const requestedFocusValue = input?.focusValue?.trim() ?? null;

  const [
    shipmentRows,
    shipmentCustomerRows,
    partyRows,
    stepRows,
    trackingTokenRows,
    taskRows,
    exceptionRows,
    documentRequestRows,
    activityRows,
    userRows,
    workflowTemplateRows,
  ] = await Promise.all([
    scanAll<ShipmentScanRow>(SHIPMENTS_TABLE),
    scanAll<ShipmentCustomerScanRow>(SHIPMENT_CUSTOMERS_TABLE),
    scanAll<PartyScanRow>(PARTIES_TABLE),
    scanAll<StepScanRow>(SHIPMENT_STEPS_TABLE),
    scanAll<TrackingTokenScanRow>(TRACKING_TOKENS_TABLE),
    scanAll<TaskScanRow>(TASKS_TABLE),
    scanAll<ExceptionScanRow>(SHIPMENT_EXCEPTIONS_TABLE),
    scanAll<DocumentRequestScanRow>(DOCUMENT_REQUESTS_TABLE),
    scanAll<ActivityScanRow>(ACTIVITIES_TABLE),
    scanAll<UserScanRow>(USERS_TABLE),
    scanAll<WorkflowTemplateScanRow>(WORKFLOW_TEMPLATES_TABLE),
  ]);

  const partyNames = new Map(partyRows.map((party) => [party.id, party.name]));
  const userNames = new Map(userRows.map((user) => [user.id, user.name]));
  const shipmentCodeById = new Map(
    shipmentRows.map((shipment) => [shipment.id, shipment.shipment_code]),
  );
  const workflowNamesById = new Map(
    workflowTemplateRows.map((workflow) => [workflow.id, workflow.name]),
  );

  const customersByShipment = new Map<number, Set<number>>();
  for (const row of shipmentCustomerRows) {
    const set = customersByShipment.get(row.shipment_id) ?? new Set<number>();
    set.add(row.customer_party_id);
    customersByShipment.set(row.shipment_id, set);
  }

  const latestTokenByShipment = new Map<number, string>();
  for (const token of trackingTokenRows) {
    if (token.revoked_at) continue;
    const existing = latestTokenByShipment.get(token.shipment_id);
    if (!existing) {
      latestTokenByShipment.set(token.shipment_id, token.created_at);
      continue;
    }
    if (token.created_at > existing) {
      latestTokenByShipment.set(token.shipment_id, token.created_at);
    }
  }

  const customsAgentsByShipment = new Map<number, InternalAgentEntry[]>();
  const trackingStatusesByShipment = new Map<
    number,
    Partial<Record<TrackingRegionId, StepStatus>>
  >();

  for (const step of stepRows) {
    if (step.name === CUSTOMS_STEP_NAME) {
      customsAgentsByShipment.set(
        step.shipment_id,
        borderAgentValues(step.field_values_json),
      );
    }
    const region = (Object.keys(TRACKING_STEP_NAMES) as TrackingRegionId[]).find(
      (entry) => TRACKING_STEP_NAMES[entry] === step.name,
    );
    if (!region) continue;
    if (!StepStatuses.includes(step.status)) continue;
    const current = trackingStatusesByShipment.get(step.shipment_id) ?? {};
    current[region] = step.status;
    trackingStatusesByShipment.set(step.shipment_id, current);
  }

  const shipments: InternalShipment[] = shipmentRows.map((row) => {
    const shipmentKind = normalizeShipmentKind(
      row.shipment_kind,
      row.master_shipment_id ?? null,
    );
    const masterShipmentId =
      typeof row.master_shipment_id === "number" &&
      Number.isFinite(row.master_shipment_id) &&
      row.master_shipment_id > 0
        ? row.master_shipment_id
        : null;

    const customerIds = Array.from(customersByShipment.get(row.id) ?? new Set<number>())
      .filter((id) => Number.isFinite(id) && id > 0)
      .sort((left, right) => left - right);

    const names = customerIds
      .map((id) => partyNames.get(id))
      .filter((name): name is string => !!name);

    return {
      id: row.id,
      shipment_code: row.shipment_code,
      shipment_kind: shipmentKind,
      master_shipment_id: masterShipmentId,
      transport_mode: row.transport_mode,
      shipment_type: row.shipment_type,
      cargo_description: row.cargo_description,
      origin: row.origin,
      destination: row.destination,
      overall_status: row.overall_status,
      workflow_template_id: row.workflow_template_id ?? null,
      last_update_at: row.last_update_at,
      last_update_ms: safeTimeMs(row.last_update_at),
      customer_ids: customerIds,
      customer_names: names.length ? Array.from(new Set(names)).join(", ") : null,
      is_tracked: latestTokenByShipment.has(row.id),
      customs_agents: customsAgentsByShipment.get(row.id) ?? [],
      tracking_region_statuses: trackingStatusesByShipment.get(row.id) ?? {},
    };
  });

  const shipmentsByRange: Record<OverviewRange, InternalShipment[]> = {
    "7d": shipments.filter((shipment) => inCurrentRange(shipment, "7d", nowMs)),
    "30d": shipments.filter((shipment) => inCurrentRange(shipment, "30d", nowMs)),
    "90d": shipments.filter((shipment) => inCurrentRange(shipment, "90d", nowMs)),
    all: shipments.slice(),
  };

  const currentShipments = shipmentsByRange[range];
  const previousShipments =
    range === "all"
      ? ([] as InternalShipment[])
      : shipments.filter((shipment) => inPreviousRange(shipment, range, nowMs));

  const currentKpis = computeKpis(currentShipments);
  const previousKpis = computeKpis(previousShipments);

  const kpis: OverviewKpi[] = [
    {
      id: "total",
      label: "Total shipments",
      value: currentKpis.total,
      delta: range === "all" ? null : currentKpis.total - previousKpis.total,
      focus_type: null,
      focus_value: null,
    },
    {
      id: "in_progress",
      label: "In progress",
      value: currentKpis.in_progress,
      delta:
        range === "all"
          ? null
          : currentKpis.in_progress - previousKpis.in_progress,
      focus_type: "status",
      focus_value: "IN_PROGRESS",
    },
    {
      id: "completed",
      label: "Completed",
      value: currentKpis.completed,
      delta: range === "all" ? null : currentKpis.completed - previousKpis.completed,
      focus_type: "status",
      focus_value: "COMPLETED",
    },
    {
      id: "delayed",
      label: "Delayed",
      value: currentKpis.delayed,
      delta: range === "all" ? null : currentKpis.delayed - previousKpis.delayed,
      focus_type: "status",
      focus_value: "DELAYED",
    },
    {
      id: "masters",
      label: "Master shipments",
      value: currentKpis.masters,
      delta: range === "all" ? null : currentKpis.masters - previousKpis.masters,
      focus_type: "kind",
      focus_value: "MASTER",
    },
    {
      id: "subshipments",
      label: "Subshipments",
      value: currentKpis.subshipments,
      delta:
        range === "all"
          ? null
          : currentKpis.subshipments - previousKpis.subshipments,
      focus_type: "kind",
      focus_value: "SUBSHIPMENT",
    },
    {
      id: "tracked",
      label: "Tracked shipments",
      value: currentKpis.tracked,
      delta: range === "all" ? null : currentKpis.tracked - previousKpis.tracked,
      focus_type: "tracking",
      focus_value: "tracked",
    },
    {
      id: "active_customers",
      label: "Active customers",
      value: currentKpis.active_customers,
      delta:
        range === "all"
          ? null
          : currentKpis.active_customers - previousKpis.active_customers,
      focus_type: null,
      focus_value: null,
    },
  ];

  const statusCounts = new Map<ShipmentOverallStatus, number>();
  for (const status of ShipmentOverallStatuses) {
    statusCounts.set(status, 0);
  }
  const kindCounts = new Map<ShipmentKind, number>();
  for (const kind of ShipmentKinds) {
    kindCounts.set(kind, 0);
  }
  const modeCounts = new Map<TransportMode, number>();
  for (const mode of TransportModes) {
    modeCounts.set(mode, 0);
  }

  for (const shipment of currentShipments) {
    statusCounts.set(
      shipment.overall_status,
      (statusCounts.get(shipment.overall_status) ?? 0) + 1,
    );
    kindCounts.set(
      shipment.shipment_kind,
      (kindCounts.get(shipment.shipment_kind) ?? 0) + 1,
    );
    modeCounts.set(
      shipment.transport_mode,
      (modeCounts.get(shipment.transport_mode) ?? 0) + 1,
    );
  }

  const totalCurrent = currentShipments.length;
  const byStatus: OverviewDistributionRow[] = ShipmentOverallStatuses.map((status) => ({
    key: status,
    label: overallStatusLabel(status),
    count: statusCounts.get(status) ?? 0,
    percentage: percentage(statusCounts.get(status) ?? 0, totalCurrent),
    focus_type: "status" as const,
    focus_value: status,
  })).sort(
    (left, right) =>
      statusSortRank(left.key as ShipmentOverallStatus) -
      statusSortRank(right.key as ShipmentOverallStatus),
  );

  const byKind: OverviewDistributionRow[] = ShipmentKinds.map((kind) => ({
    key: kind,
    label:
      kind === "MASTER"
        ? "Master"
        : kind === "SUBSHIPMENT"
          ? "Subshipment"
          : "Standard",
    count: kindCounts.get(kind) ?? 0,
    percentage: percentage(kindCounts.get(kind) ?? 0, totalCurrent),
    focus_type: "kind" as const,
    focus_value: kind,
  }));

  const byMode: OverviewDistributionRow[] = TransportModes.map((mode) => ({
    key: mode,
    label: modeLabelForDistribution(mode),
    count: modeCounts.get(mode) ?? 0,
    percentage: percentage(modeCounts.get(mode) ?? 0, totalCurrent),
    focus_type: "mode" as const,
    focus_value: mode,
  })).sort(
    (left, right) =>
      modeSortRank(left.key as TransportMode) - modeSortRank(right.key as TransportMode),
  );

  const laneMap = new Map<
    string,
    {
      origin: string;
      destination: string;
      total: number;
      in_progress: number;
      completed: number;
      delayed: number;
    }
  >();
  for (const shipment of currentShipments) {
    const origin = cleanText(shipment.origin) || "Unknown origin";
    const destination = cleanText(shipment.destination) || "Unknown destination";
    const key = `${origin}|||${destination}`;
    const entry = laneMap.get(key) ?? {
      origin,
      destination,
      total: 0,
      in_progress: 0,
      completed: 0,
      delayed: 0,
    };
    entry.total += 1;
    if (shipment.overall_status === "IN_PROGRESS") entry.in_progress += 1;
    if (shipment.overall_status === "COMPLETED") entry.completed += 1;
    if (shipment.overall_status === "DELAYED") entry.delayed += 1;
    laneMap.set(key, entry);
  }

  const lanes: OverviewLaneRow[] = Array.from(laneMap.entries())
    .map(([key, value]) => ({
      key,
      label: `${value.origin} -> ${value.destination}`,
      origin: value.origin,
      destination: value.destination,
      focus_value: encodeLaneFocusValue(value.origin, value.destination),
      total: value.total,
      in_progress: value.in_progress,
      completed: value.completed,
      delayed: value.delayed,
    }))
    .sort((left, right) => {
      if (right.total !== left.total) return right.total - left.total;
      return left.label.localeCompare(right.label);
    })
    .slice(0, 12);

  const agentMap = new Map<
    string,
    {
      border: string;
      agent: string;
      shipment_count: number;
      focus_value: string;
    }
  >();
  for (const shipment of currentShipments) {
    const shipmentSeen = new Set<string>();
    for (const agentEntry of shipment.customs_agents) {
      if (shipmentSeen.has(agentEntry.normalized_key)) continue;
      shipmentSeen.add(agentEntry.normalized_key);
      const key = agentEntry.normalized_key;
      const entry = agentMap.get(key) ?? {
        border: agentEntry.border,
        agent: agentEntry.agent,
        shipment_count: 0,
        focus_value: agentEntry.focus_value,
      };
      entry.shipment_count += 1;
      agentMap.set(key, entry);
    }
  }

  const agents: OverviewAgentRow[] = Array.from(agentMap.entries())
    .map(([key, value]) => ({
      key,
      border: value.border,
      agent: value.agent,
      focus_value: value.focus_value,
      shipment_count: value.shipment_count,
    }))
    .sort((left, right) => {
      if (right.shipment_count !== left.shipment_count) {
        return right.shipment_count - left.shipment_count;
      }
      if (left.border !== right.border) return left.border.localeCompare(right.border);
      return left.agent.localeCompare(right.agent);
    })
    .slice(0, 12);

  const trackingRegions: OverviewTrackingRegion[] = (
    Object.keys(TRACKING_STEP_NAMES) as TrackingRegionId[]
  ).map((regionId) => ({
    region_id: regionId,
    label: TRACKING_REGION_LABELS[regionId],
    pending: 0,
    in_progress: 0,
    done: 0,
    blocked: 0,
  }));
  const regionById = new Map(trackingRegions.map((region) => [region.region_id, region]));

  for (const shipment of currentShipments) {
    for (const regionId of Object.keys(TRACKING_STEP_NAMES) as TrackingRegionId[]) {
      const status = shipment.tracking_region_statuses[regionId];
      if (!status) continue;
      const entry = regionById.get(regionId);
      if (!entry) continue;
      if (status === "PENDING") entry.pending += 1;
      if (status === "IN_PROGRESS") entry.in_progress += 1;
      if (status === "DONE") entry.done += 1;
      if (status === "BLOCKED") entry.blocked += 1;
    }
  }

  const currentShipmentIds = new Set(currentShipments.map((shipment) => shipment.id));

  let openTasks = 0;
  let inProgressTasks = 0;
  let blockedTasks = 0;
  for (const task of taskRows) {
    if (!currentShipmentIds.has(task.shipment_id)) continue;
    if (task.status === "OPEN") openTasks += 1;
    if (task.status === "IN_PROGRESS") inProgressTasks += 1;
    if (task.status === "BLOCKED") blockedTasks += 1;
  }

  let exceptionsOpen = 0;
  let exceptionsResolved = 0;
  for (const exception of exceptionRows) {
    if (!currentShipmentIds.has(exception.shipment_id)) continue;
    if (exception.status === "OPEN") exceptionsOpen += 1;
    if (exception.status === "RESOLVED") exceptionsResolved += 1;
  }

  let documentRequestsOpen = 0;
  let documentRequestsFulfilled = 0;
  for (const request of documentRequestRows) {
    if (!currentShipmentIds.has(request.shipment_id)) continue;
    if (request.status === "OPEN") documentRequestsOpen += 1;
    if (request.status === "FULFILLED") documentRequestsFulfilled += 1;
  }

  const customerMetrics = new Map<
    number,
    {
      customer_id: number;
      customer_name: string;
      shipment_count: number;
      completed_count: number;
      delayed_count: number;
      tracked_count: number;
    }
  >();
  for (const shipment of currentShipments) {
    for (const customerId of shipment.customer_ids) {
      const metric = customerMetrics.get(customerId) ?? {
        customer_id: customerId,
        customer_name: partyNames.get(customerId) ?? `Customer #${customerId}`,
        shipment_count: 0,
        completed_count: 0,
        delayed_count: 0,
        tracked_count: 0,
      };
      metric.shipment_count += 1;
      if (shipment.overall_status === "COMPLETED") metric.completed_count += 1;
      if (shipment.overall_status === "DELAYED") metric.delayed_count += 1;
      if (shipment.is_tracked) metric.tracked_count += 1;
      customerMetrics.set(customerId, metric);
    }
  }

  const topCustomers: OverviewTopCustomerRow[] = Array.from(customerMetrics.values())
    .sort((left, right) => {
      if (right.shipment_count !== left.shipment_count) {
        return right.shipment_count - left.shipment_count;
      }
      return left.customer_name.localeCompare(right.customer_name);
    })
    .slice(0, 10)
    .map((entry) => ({
      ...entry,
      focus_value: String(entry.customer_id),
    }));

  const recentActivity: OverviewActivityRow[] = activityRows
    .filter((activity) => currentShipmentIds.has(activity.shipment_id))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, 20)
    .map((activity) => ({
      id: activity.id,
      shipment_id: activity.shipment_id,
      shipment_code: shipmentCodeById.get(activity.shipment_id) ?? null,
      type: activity.type,
      message: activity.message,
      actor_name: activity.actor_user_id
        ? userNames.get(activity.actor_user_id) ?? activity.actor_name ?? null
        : activity.actor_name ?? null,
      created_at: activity.created_at,
    }));

  const workflowUsageMap = new Map<number | null, number>();
  for (const shipment of currentShipments) {
    const templateId = shipment.workflow_template_id ?? null;
    workflowUsageMap.set(templateId, (workflowUsageMap.get(templateId) ?? 0) + 1);
  }
  const workflowUsage: OverviewWorkflowUsageRow[] = Array.from(workflowUsageMap.entries())
    .map(([templateId, shipmentCount]) => ({
      template_id: templateId,
      template_name:
        templateId === null
          ? "No workflow template"
          : workflowNamesById.get(templateId) ?? `Template #${templateId}`,
      shipment_count: shipmentCount,
    }))
    .sort((left, right) => {
      if (right.shipment_count !== left.shipment_count) {
        return right.shipment_count - left.shipment_count;
      }
      return left.template_name.localeCompare(right.template_name);
    })
    .slice(0, 8);

  const focus = buildFocus(
    shipmentsByRange,
    range,
    requestedFocusType,
    requestedFocusValue,
    partyNames,
  );

  const rangeSummaries: OverviewRangeSummary[] = OverviewRangeValues.map((entry) => ({
    range: entry,
    label: rangeLabel(entry),
    shipment_count: shipmentsByRange[entry].length,
  }));

  const tracked = currentShipments.filter((shipment) => shipment.is_tracked).length;
  const untracked = Math.max(0, currentShipments.length - tracked);
  const coveragePercent = percentage(tracked, currentShipments.length);

  const currentStart = rangeStartMs(range, nowMs);
  let previousStart: number | null = null;
  let previousEnd: number | null = null;
  if (range !== "all" && currentStart !== null) {
    const span = RANGE_DAYS[range] * 24 * 60 * 60 * 1000;
    previousStart = currentStart - span;
    previousEnd = currentStart;
  }

  return {
    range,
    date_basis: "last_update",
    generated_at: currentIso(nowMs),
    period: {
      label: rangeLabel(range),
      start_at: currentStart === null ? null : new Date(currentStart).toISOString(),
      end_at: currentIso(nowMs),
      previous_start_at:
        previousStart === null ? null : new Date(previousStart).toISOString(),
      previous_end_at: previousEnd === null ? null : new Date(previousEnd).toISOString(),
    },
    range_summaries: rangeSummaries,
    kpis,
    distributions: {
      by_status: byStatus,
      by_kind: byKind,
      by_mode: byMode,
    },
    lanes,
    agents,
    tracking: {
      tracked,
      untracked,
      coverage_percent: coveragePercent,
      regions: trackingRegions,
    },
    operational_health: {
      open_workload: openTasks + inProgressTasks + blockedTasks,
      open_tasks: openTasks,
      in_progress_tasks: inProgressTasks,
      blocked_tasks: blockedTasks,
      exceptions_open: exceptionsOpen,
      exceptions_resolved: exceptionsResolved,
      document_requests_open: documentRequestsOpen,
      document_requests_fulfilled: documentRequestsFulfilled,
    },
    top_customers: topCustomers,
    recent_activity: recentActivity,
    workflows: workflowUsage,
    focus,
  };
}
