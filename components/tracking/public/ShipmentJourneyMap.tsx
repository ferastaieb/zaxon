"use client";

import type {
  FtlClientSnapshotAgentKey,
  FtlClientTrackingAvailability,
  FtlClientTrackingProgressState,
  FtlClientTrackingViewModel,
} from "@/lib/ftlExport/clientTrackingView";

type Props = {
  viewModel: FtlClientTrackingViewModel;
};

type RouteNodeId = "uae" | "ksa" | "jordan" | "syria" | "mushtarakah" | "lebanon";

type RouteNode = {
  id: RouteNodeId;
  label: string;
  x: number;
  y: number;
  tagSide: "left" | "right";
  labelSide: "bottom" | "left";
  agentKey: FtlClientSnapshotAgentKey;
};

type TrackingPoint = {
  id: string;
  label: string;
  x: number;
  y: number;
  side: "left" | "right";
  agentKey: FtlClientSnapshotAgentKey;
};

const TRACKING_POINT_TAG_OFFSET_Y: Record<string, number> = {
  "jebel-ali": 6,
  sila: -34,
  batha: -26,
  omari: -14,
  naseeb: -26,
  mushtarakah: -14,
  masnaa: -8,
};

const TRACKING_POINT_TAG_OFFSET_X: Record<string, number> = {
  "jebel-ali": -126,
  sila: 24,
  batha: 22,
  omari: 16,
  naseeb: 12,
  mushtarakah: 12,
  masnaa: 12,
};

const NODE_BY_ID: Record<RouteNodeId, RouteNode> = {
  uae: {
    id: "uae",
    label: "UAE",
    x: 320,
    y: 720,
    tagSide: "left",
    labelSide: "bottom",
    agentKey: "sila",
  },
  ksa: {
    id: "ksa",
    label: "KSA",
    x: 250,
    y: 630,
    tagSide: "right",
    labelSide: "left",
    agentKey: "batha",
  },
  jordan: {
    id: "jordan",
    label: "Jordan",
    x: 170,
    y: 510,
    tagSide: "right",
    labelSide: "bottom",
    agentKey: "omari",
  },
  syria: {
    id: "syria",
    label: "Syria",
    x: 130,
    y: 420,
    tagSide: "right",
    labelSide: "left",
    agentKey: "naseeb",
  },
  mushtarakah: {
    id: "mushtarakah",
    label: "Mushtarakah",
    x: 130,
    y: 420,
    tagSide: "right",
    labelSide: "left",
    agentKey: "mushtarakah",
  },
  lebanon: {
    id: "lebanon",
    label: "Lebanon",
    x: 90,
    y: 330,
    tagSide: "right",
    labelSide: "left",
    agentKey: "masnaa",
  },
};

const ROUTE_NODE_SEQUENCE: Record<FtlClientTrackingViewModel["route_id"], RouteNodeId[]> = {
  JAFZA_TO_KSA: ["uae", "ksa"],
  JAFZA_TO_SYRIA: ["uae", "ksa", "jordan", "syria"],
  JAFZA_TO_MUSHTARAKAH: ["uae", "ksa", "jordan", "mushtarakah", "lebanon"],
};

const TRACKING_POINTS_BY_ROUTE: Record<FtlClientTrackingViewModel["route_id"], TrackingPoint[]> = {
  JAFZA_TO_KSA: [
    { id: "jebel-ali", label: "Jebel Ali", x: 356, y: 742, side: "left", agentKey: "jebel_ali" },
    { id: "sila", label: "Sila", x: 293, y: 652, side: "right", agentKey: "sila" },
    { id: "batha", label: "Batha", x: 252, y: 607, side: "right", agentKey: "batha" },
  ],
  JAFZA_TO_SYRIA: [
    { id: "jebel-ali", label: "Jebel Ali", x: 356, y: 742, side: "left", agentKey: "jebel_ali" },
    { id: "sila", label: "Sila", x: 293, y: 652, side: "right", agentKey: "sila" },
    { id: "batha", label: "Batha", x: 252, y: 607, side: "right", agentKey: "batha" },
    { id: "omari", label: "Omari Customs", x: 180, y: 486, side: "right", agentKey: "omari" },
    { id: "naseeb", label: "Naseeb", x: 136, y: 398, side: "right", agentKey: "naseeb" },
  ],
  JAFZA_TO_MUSHTARAKAH: [
    { id: "jebel-ali", label: "Jebel Ali", x: 356, y: 742, side: "left", agentKey: "jebel_ali" },
    { id: "sila", label: "Sila", x: 293, y: 652, side: "right", agentKey: "sila" },
    { id: "batha", label: "Batha", x: 252, y: 607, side: "right", agentKey: "batha" },
    { id: "omari", label: "Omari Customs", x: 180, y: 486, side: "right", agentKey: "omari" },
    { id: "mushtarakah", label: "Mushtarakah", x: 136, y: 398, side: "right", agentKey: "mushtarakah" },
    { id: "masnaa", label: "Masnaa", x: 97, y: 346, side: "right", agentKey: "masnaa" },
  ],
};

function fmtDate(input: string | null | undefined) {
  if (!input) return "-";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return input;
  return parsed.toLocaleDateString();
}

function fmtDateTime(input: string | null | undefined) {
  if (!input) return "Pending update";
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return input;
  return parsed.toLocaleString();
}

function compactText(input: string | null | undefined, maxLength: number) {
  const value = (input ?? "").trim();
  if (!value) return "-";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function iconIdForDocStatus(status: FtlClientTrackingAvailability) {
  if (status === "AVAILABLE") return "icon-doc-check";
  if (status === "UNAVAILABLE") return "icon-doc-unavailable";
  return "icon-doc-missing";
}

function labelFillForDocStatus(status: FtlClientTrackingAvailability) {
  if (status === "UNAVAILABLE") return "#94A3B8";
  return "#334155";
}

function routeNodeState(
  stateByRegion: Map<string, FtlClientTrackingProgressState>,
  nodeId: RouteNodeId,
): FtlClientTrackingProgressState {
  return stateByRegion.get(nodeId) ?? "PENDING";
}

function currentSegmentFromStates(states: FtlClientTrackingProgressState[]) {
  if (states.length <= 1) return null;

  const firstInProgress = states.findIndex((state) => state === "IN_PROGRESS");
  if (firstInProgress >= 0) {
    return Math.max(0, firstInProgress - 1);
  }

  const firstPending = states.findIndex((state) => state === "PENDING");
  if (firstPending >= 0) {
    return Math.max(0, firstPending - 1);
  }

  return null;
}

function midpoint(a: RouteNode, b: RouteNode) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function doneNodeFill(nodeId: RouteNodeId) {
  if (nodeId === "uae") return "#86EFAC";
  if (nodeId === "ksa") return "#10B981";
  return "#94A3B8";
}

function doneSegmentColor(index: number) {
  return index === 0 ? "#86EFAC" : "#10B981";
}

export function ShipmentJourneyMap({ viewModel }: Props) {
  const nodes = ROUTE_NODE_SEQUENCE[viewModel.route_id].map((nodeId) => NODE_BY_ID[nodeId]);
  if (!nodes.length) return null;

  const stateByRegion = new Map(
    viewModel.international_regions.map((region) => [region.id, region.state]),
  );
  const nodeStates = nodes.map((node) => routeNodeState(stateByRegion, node.id));

  const lastDoneNodeIndex = nodeStates.reduce((last, state, index) => {
    if (state === "DONE") return index;
    return last;
  }, -1);
  const allDone = lastDoneNodeIndex === nodeStates.length - 1 && nodeStates.length > 0;

  const doneSegments = new Set<number>();
  for (let index = 0; index < nodes.length - 1; index += 1) {
    if (index <= lastDoneNodeIndex - 1) {
      doneSegments.add(index);
    }
  }

  const currentSegment = allDone ? null : currentSegmentFromStates(nodeStates);

  const markerPoint = (() => {
    if (allDone) {
      return {
        x: nodes[nodes.length - 1].x,
        y: nodes[nodes.length - 1].y,
      };
    }
    if (currentSegment !== null && nodes[currentSegment + 1]) {
      return midpoint(nodes[currentSegment], nodes[currentSegment + 1]);
    }
    return {
      x: nodes[0].x,
      y: nodes[0].y,
    };
  })();

  const trackingPoints = TRACKING_POINTS_BY_ROUTE[viewModel.route_id];
  const milestoneEta = fmtDateTime(viewModel.snapshot.next_milestone.eta);
  const nextMilestoneLabel = compactText(viewModel.snapshot.next_milestone.label || "Delivered", 32);
  const cargoDescription = compactText(viewModel.cargo.description, 32);
  const packageCount = compactText(viewModel.cargo.total_quantity_label, 20);
  const timelineEvents = viewModel.international_regions.flatMap((region) =>
    region.events.map((event) => ({
      regionLabel: region.label,
      label: event.label,
      state: event.state,
      timestamp: event.timestamp,
    })),
  );
  const firstInProgressEvent = timelineEvents.find((event) => event.state === "IN_PROGRESS");
  const firstPendingEvent = timelineEvents.find((event) => event.state === "PENDING");
  const lastDoneEvent = [...timelineEvents].reverse().find((event) => event.state === "DONE");
  const currentTrackingEvent = firstInProgressEvent ?? lastDoneEvent ?? firstPendingEvent ?? null;
  const currentTrackingTone = firstInProgressEvent
    ? "IN PROGRESS"
    : lastDoneEvent
      ? "LAST DONE"
      : firstPendingEvent
        ? "NEXT"
        : "PENDING";
  const currentTrackingLabel = currentTrackingEvent
    ? compactText(
        `${currentTrackingEvent.regionLabel}: ${currentTrackingEvent.label}`,
        34,
      )
    : "Awaiting first checkpoint";

  const truckSnapshot = viewModel.snapshot.trucks;
  const truckRows = viewModel.trucks_overview.map((truck) => {
    const loading = viewModel.loading_cards.find((row) => row.index === truck.index);
    return {
      index: truck.index,
      truck_number: truck.truck_number || truck.truck_reference,
      trailer_type: truck.trailer_type,
      expected_loading_date: truck.estimated_loading_date || null,
      actual_loading_date: loading?.actual_loading_date ?? null,
      loading_origin: loading?.loading_origin ?? "Not selected",
      supplier_name: loading?.supplier_name ?? null,
      supplier_location: loading?.supplier_location ?? null,
    };
  });
  const displayedTruckRows = truckRows.slice(0, 3);
  const extraTruckCount = Math.max(truckRows.length - displayedTruckRows.length, 0);
  const truckCardWidth = 176;
  const truckRowHeight = 46;
  const truckCardHeight =
    84 + displayedTruckRows.length * truckRowHeight + (extraTruckCount > 0 ? 16 : 0);

  return (
    <div className="mx-auto w-full max-w-md sm:max-w-3xl">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 400 900"
        width="100%"
        height="100%"
        role="img"
        aria-label="FTL shipment snapshot"
        style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      >
        <defs>
          <filter id="shadow-sm" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0F172A" floodOpacity="0.08" />
          </filter>
          <filter id="shadow-md" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0F172A" floodOpacity="0.12" />
          </filter>

          <linearGradient id="emerald-glow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <g id="icon-doc-check">
            <rect x="3" y="2" width="14" height="18" rx="3" fill="#E6F4EA" stroke="#10B981" strokeWidth="1.5" />
            <path d="M7 11 l 2 2 l 4 -4" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g id="icon-doc-missing">
            <rect x="3" y="2" width="14" height="18" rx="3" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1.5" />
            <circle cx="10" cy="12" r="1.5" fill="#F59E0B" />
            <line x1="10" y1="6" x2="10" y2="9" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" />
          </g>
          <g id="icon-doc-unavailable">
            <rect x="3" y="2" width="14" height="18" rx="3" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1.5" />
            <line x1="7" y1="11" x2="13" y2="11" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
          </g>
          <g id="icon-truck">
            <path d="M3 6 h11 v10 H3 z M14 10 h4 l2 3 v3 h-6 z" fill="none" stroke="#64748B" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="6" cy="16" r="2" fill="#F8FAFC" stroke="#64748B" strokeWidth="1.5" />
            <circle cx="17" cy="16" r="2" fill="#F8FAFC" stroke="#64748B" strokeWidth="1.5" />
          </g>
        </defs>

        <rect x="0" y="0" width="400" height="900" fill="#E2E8F0" />

        <g id="map">
          <path
            d="M 0 250 L 60 280 L 70 350 L 30 400 L 0 420 L 0 550 L 60 650 L 100 800 L 120 900 L 400 900 L 400 750 L 360 680 L 350 580 L 400 500 L 400 0 L 0 0 Z"
            fill="#F8FAFC"
            stroke="#CBD5E1"
            strokeWidth="2"
          />
          <path d="M 280 750 L 350 650 L 400 660" fill="none" stroke="#E2E8F0" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M 100 550 L 220 500 L 350 480" fill="none" stroke="#E2E8F0" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M 80 460 L 150 450 L 220 380 L 400 350" fill="none" stroke="#E2E8F0" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M 60 380 L 100 360 L 120 300 L 180 200" fill="none" stroke="#E2E8F0" strokeWidth="2" strokeDasharray="4 4" />

          <text x="260" y="610" fontSize="14" fontWeight="800" fill="#CBD5E1" letterSpacing="2" transform="rotate(-15, 260, 610)">
            SAUDI ARABIA
          </text>
          <text x="350" y="720" fontSize="12" fontWeight="800" fill="#CBD5E1" letterSpacing="1">UAE</text>
          <text x="170" y="480" fontSize="12" fontWeight="800" fill="#CBD5E1" letterSpacing="1">JORDAN</text>
          <text x="170" y="380" fontSize="12" fontWeight="800" fill="#CBD5E1" letterSpacing="1">SYRIA</text>
        </g>

        <g id="header">
          <text x="20" y="40" fontSize="12" fontWeight="800" fill="#64748B" letterSpacing="1.5">
            FULL TRUCK EXPORT
          </text>

          <rect x="20" y="55" width="170" height="26" rx="13" fill="#E2E8F0" />
          <text x="105" y="73" fontSize="11" fontWeight="700" fill="#334155" textAnchor="middle">
            {viewModel.route_label}
          </text>

          <rect x="200" y="55" width="180" height="26" rx="13" fill="#D1FAE5" />
          <text x="290" y="73" fontSize="11" fontWeight="700" fill="#065F46" textAnchor="middle">
            {viewModel.shipment_status_label}
          </text>
        </g>

        <g id="summary_strip">
          <rect x="20" y="100" width="360" height="210" rx="16" fill="#FFFFFF" filter="url(#shadow-md)" />

          <text x="40" y="130" fontSize="11" fontWeight="700" fill="#94A3B8" letterSpacing="0.5">SHIPMENT CODE</text>
          <text x="40" y="152" fontSize="18" fontWeight="800" fill="#0F172A">{viewModel.shipment_code}</text>

          <text x="360" y="130" fontSize="10" fontWeight="600" fill="#64748B" textAnchor="end">TOTAL WEIGHT</text>
          <text x="360" y="150" fontSize="13" fontWeight="700" fill="#10B981" textAnchor="end">{viewModel.cargo.total_weight_kg} kg</text>

          <line x1="40" y1="168" x2="360" y2="168" stroke="#F1F5F9" strokeWidth="2" />

          <text x="40" y="190" fontSize="12" fontWeight="600" fill="#334155">
            Started: <tspan fill="#64748B">{fmtDate(viewModel.shipment_date)}</tspan>
          </text>
          <text x="360" y="190" fontSize="11" fontWeight="500" fill="#94A3B8" textAnchor="end">
            Updated: {fmtDateTime(viewModel.last_updated_at)}
          </text>

          <line x1="40" y1="202" x2="360" y2="202" stroke="#F1F5F9" strokeWidth="2" />

          <text x="40" y="220" fontSize="10" fontWeight="700" fill="#64748B">CARGO DESCRIPTION</text>
          <text x="40" y="238" fontSize="12" fontWeight="700" fill="#0F172A">{cargoDescription}</text>

          <text x="360" y="220" fontSize="10" fontWeight="700" fill="#64748B" textAnchor="end">TOTAL PACKAGES</text>
          <text x="360" y="238" fontSize="12" fontWeight="700" fill="#0F172A" textAnchor="end">{packageCount}</text>

          <line x1="40" y1="244" x2="360" y2="244" stroke="#F1F5F9" strokeWidth="2" />

          <circle cx="46" cy="263" r="4" fill="#F59E0B" />
          <text x="60" y="267" fontSize="12" fontWeight="700" fill="#0F172A">Next: {nextMilestoneLabel}</text>
          <text x="360" y="267" fontSize="12" fontWeight="700" fill="#F59E0B" textAnchor="end">{milestoneEta}</text>

          <line x1="40" y1="276" x2="360" y2="276" stroke="#F1F5F9" strokeWidth="2" />
          <text x="40" y="294" fontSize="11" fontWeight="800" fill="#0F172A">
            Now tracking: {currentTrackingLabel}
          </text>
          <text x="360" y="294" fontSize="10" fontWeight="700" fill="#64748B" textAnchor="end">
            {currentTrackingTone}
          </text>
        </g>

        <g id="route">
          {nodes.slice(0, -1).map((node, index) => {
            const nextNode = nodes[index + 1];
            const isDone = doneSegments.has(index);
            const isCurrent = currentSegment === index;
            const isFuture = !isDone && !isCurrent;

            if (isDone) {
              return (
                <line
                  key={`route-done-${node.id}-${nextNode.id}`}
                  x1={node.x}
                  y1={node.y}
                  x2={nextNode.x}
                  y2={nextNode.y}
                  stroke={doneSegmentColor(index)}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            }

            if (isCurrent) {
              return (
                <g key={`route-current-${node.id}-${nextNode.id}`}>
                  <line
                    x1={node.x}
                    y1={node.y}
                    x2={nextNode.x}
                    y2={nextNode.y}
                    stroke="url(#emerald-glow)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    filter="url(#glow)"
                  />
                  <line
                    x1={node.x}
                    y1={node.y}
                    x2={nextNode.x}
                    y2={nextNode.y}
                    stroke="#34D399"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </g>
              );
            }

            if (isFuture) {
              return (
                <line
                  key={`route-future-${node.id}-${nextNode.id}`}
                  x1={node.x}
                  y1={node.y}
                  x2={nextNode.x}
                  y2={nextNode.y}
                  stroke="#CBD5E1"
                  strokeWidth="5"
                  strokeDasharray="8 8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            }

            return null;
          })}
        </g>

        <g id="tracking_points">
          {trackingPoints.map((point) => {
            const agent = viewModel.snapshot.agents[point.agentKey];
            const agentLabel = compactText(agent.name || "TBD", 10);
            const defaultTagX = point.side === "left" ? -108 : 8;
            const tagX = TRACKING_POINT_TAG_OFFSET_X[point.id] ?? defaultTagX;
            const tagY = TRACKING_POINT_TAG_OFFSET_Y[point.id] ?? -16;
            return (
              <a key={`tracking-point-${point.id}`} href="?tab=documents">
                <g transform={`translate(${point.x}, ${point.y})`} style={{ cursor: "pointer" }}>
                  <circle cx="0" cy="0" r="3" fill="#64748B" />
                  <g transform={`translate(${tagX}, ${tagY})`}>
                    <rect width="100" height="30" rx="6" fill="#FFFFFF" filter="url(#shadow-sm)" />
                    <use href={`#${iconIdForDocStatus(agent.doc_status)}`} x="4" y="7" width="14" height="14" />
                    <text x="22" y="13" fontSize="8" fontWeight="700" fill="#64748B">
                      {point.label}
                    </text>
                    <text x="22" y="23" fontSize="8.5" fontWeight="800" fill={labelFillForDocStatus(agent.doc_status)}>
                      {agentLabel}
                    </text>
                  </g>
                </g>
              </a>
            );
          })}
        </g>

        <g id="nodes">
          {nodes.map((node, index) => {
            const nodeState = nodeStates[index];
            const isDone = nodeState === "DONE";
            const isInProgress = nodeState === "IN_PROGRESS";
            const radius = isDone ? 10 : 8;
            const fill = isDone ? doneNodeFill(node.id) : "#FFFFFF";
            const stroke = isInProgress ? "#10B981" : isDone ? "#FFFFFF" : "#CBD5E1";
            const strokeWidth = isInProgress ? 4 : isDone ? 3 : 3;

            return (
              <a key={`node-${node.id}`} href="?tab=documents">
                <g transform={`translate(${node.x}, ${node.y})`} style={{ cursor: "pointer" }}>
                  <circle
                    cx="0"
                    cy="0"
                    r={radius}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    filter={isDone ? "url(#shadow-sm)" : undefined}
                  />

                  {node.labelSide === "bottom" ? (
                    <text x="0" y="24" fontSize="12" fontWeight="800" fill="#0F172A" textAnchor="middle">
                      {node.label}
                    </text>
                  ) : (
                    <text x="-15" y="4" fontSize="12" fontWeight="800" fill="#0F172A" textAnchor="end">
                      {node.label}
                    </text>
                  )}
                </g>
              </a>
            );
          })}
        </g>

        <g id="current_position">
          <line
            x1="126"
            y1="602"
            x2={markerPoint.x}
            y2={markerPoint.y}
            stroke="#94A3B8"
            strokeWidth="2"
            strokeDasharray="3 3"
          />

          <a href="?tab=cargo">
            <g transform={`translate(${markerPoint.x}, ${markerPoint.y})`} style={{ cursor: "pointer" }}>
              <circle cx="0" cy="0" r="24" fill="#10B981" opacity="0.2">
                <animate attributeName="r" values="12; 24; 12" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4; 0; 0.4" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx="0" cy="0" r="12" fill="#10B981" opacity="0.4" />
              <circle cx="0" cy="0" r="6" fill="#10B981" />

              <rect x="10" y="-8" width="40" height="16" rx="8" fill="#0F172A" />
              <text x="30" y="3" fontSize="9" fontWeight="800" fill="#FFFFFF" textAnchor="middle" letterSpacing="0.5">
                NOW
              </text>
            </g>
          </a>

          <a href="?tab=cargo">
            <g transform="translate(10, 546)" style={{ cursor: "pointer" }}>
              <rect width={truckCardWidth} height={truckCardHeight} rx="12" fill="#FFFFFF" filter="url(#shadow-md)" />

              <rect width={truckCardWidth} height="34" rx="12" fill="#F8FAFC" />
              <rect y="22" width={truckCardWidth} height="12" fill="#F8FAFC" />

              <use href="#icon-truck" x="10" y="7" width="20" height="20" />
              <text x="36" y="21" fontSize="11" fontWeight="800" fill="#334155">
                Fleet: {truckSnapshot.active_count} Active
              </text>

              <line x1="0" y1="34" x2={truckCardWidth} y2="34" stroke="#E2E8F0" strokeWidth="1" />

              <text x="12" y="54" fontSize="9" fontWeight="700" fill="#64748B">LOADING STATUS</text>
              <text x="12" y="70" fontSize="12" fontWeight="800" fill="#0F172A">
                {truckSnapshot.loaded_count} Loaded <tspan fill="#CBD5E1" fontWeight="400">|</tspan>{" "}
                <tspan fill="#F59E0B">{truckSnapshot.pending_count} Pend</tspan>
              </text>
              {displayedTruckRows.map((row, rowIndex) => {
                const startY = 92 + rowIndex * truckRowHeight;
                const supplierText =
                  row.loading_origin === "Supplier" || row.loading_origin === "Mixed"
                    ? `${row.supplier_name ?? "-"} / ${row.supplier_location ?? "-"}`
                    : row.loading_origin;
                return (
                  <g key={`truck-row-${row.index}`}>
                    <line
                      x1="10"
                      y1={startY - 12}
                      x2={truckCardWidth - 10}
                      y2={startY - 12}
                      stroke="#F1F5F9"
                      strokeWidth="1"
                    />
                    <text x="12" y={startY} fontSize="9.5" fontWeight="800" fill="#334155">
                      {compactText(row.truck_number, 16)} / {compactText(row.trailer_type, 14)}
                    </text>
                    <text x="12" y={startY + 14} fontSize="8.5" fontWeight="700" fill="#64748B">
                      Exp {fmtDate(row.expected_loading_date)} | Act {fmtDate(row.actual_loading_date)}
                    </text>
                    <text x="12" y={startY + 27} fontSize="8.5" fontWeight="700" fill="#64748B">
                      {compactText(supplierText, 42)}
                    </text>
                  </g>
                );
              })}
              {extraTruckCount > 0 ? (
                <text x="12" y={truckCardHeight - 8} fontSize="8.5" fontWeight="800" fill="#64748B">
                  +{extraTruckCount} more truck(s)
                </text>
              ) : null}
            </g>
          </a>
        </g>

        <g id="legend" transform="translate(20, 820)">
          <rect width="360" height="55" rx="12" fill="#FFFFFF" filter="url(#shadow-sm)" />

          <text x="15" y="32" fontSize="10" fontWeight="800" fill="#64748B" letterSpacing="0.5">LEGEND:</text>
          <line x1="65" y1="15" x2="65" y2="40" stroke="#E2E8F0" strokeWidth="2" />

          <line x1="75" y1="28" x2="95" y2="28" stroke="#10B981" strokeWidth="3" strokeLinecap="round" />
          <text x="100" y="31" fontSize="10" fontWeight="700" fill="#334155">Done</text>

          <line x1="135" y1="28" x2="155" y2="28" stroke="#CBD5E1" strokeWidth="3" strokeDasharray="3 3" strokeLinecap="round" />
          <text x="160" y="31" fontSize="10" fontWeight="700" fill="#334155">Plan</text>

          <line x1="190" y1="15" x2="190" y2="40" stroke="#E2E8F0" strokeWidth="2" />

          <g transform="translate(200, 18)">
            <use href="#icon-doc-check" x="0" y="0" width="20" height="20" transform="scale(0.8)" />
            <text x="18" y="13" fontSize="10" fontWeight="700" fill="#334155">OK</text>
          </g>

          <g transform="translate(250, 18)">
            <use href="#icon-doc-missing" x="0" y="0" width="20" height="20" transform="scale(0.8)" />
            <text x="18" y="13" fontSize="10" fontWeight="700" fill="#334155">Planed</text>
          </g>

          <g transform="translate(305, 18)">
            <use href="#icon-doc-unavailable" x="0" y="0" width="20" height="20" transform="scale(0.8)" />
            <text x="18" y="13" fontSize="10" fontWeight="700" fill="#334155">N/A</text>
          </g>
        </g>
      </svg>
    </div>
  );
}
