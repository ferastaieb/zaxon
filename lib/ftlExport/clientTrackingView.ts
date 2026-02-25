import type { ShipmentOverallStatus, StepStatus } from "@/lib/domain";
import { overallStatusLabel } from "@/lib/domain";
import { parseStepFieldValues, encodeFieldPath, stepFieldDocType } from "@/lib/stepFields";
import {
  getString,
  isTruthy,
  parseImportShipmentRows,
  parseLoadingRows,
  parseTruckBookingRows,
  toRecord,
  type ImportShipmentAllocationRow,
  type LoadingTruckRow,
  type TruckBookingRow,
} from "@/lib/ftlExport/helpers";
import { FTL_EXPORT_STEP_NAMES } from "@/lib/ftlExport/constants";
import {
  resolveJafzaLandRoute,
  type JafzaLandRouteId,
} from "@/lib/routes/jafzaLandRoutes";
import {
  trackingRegionFlowForRoute,
  trackingStagesForRegion,
  type SyriaClearanceMode,
  type TrackingRegion,
  type TrackingStageDefinition,
} from "@/components/shipments/ftl-export/forms/trackingTimelineConfig";

export type FtlClientTrackingShipment = {
  id: number;
  shipment_code: string;
  origin: string;
  destination: string;
  overall_status: ShipmentOverallStatus;
  cargo_description?: string | null;
  last_update_at: string;
  created_at?: string | null;
};

export type FtlClientTrackingStep = {
  id: number;
  name: string;
  status: StepStatus;
  field_values_json: string;
};

export type FtlClientTrackingDoc = {
  id: number;
  document_type: string;
  file_name: string;
  uploaded_at: string;
};

export type FtlClientTrackingProgressState = "PENDING" | "IN_PROGRESS" | "DONE";
export type FtlClientTrackingAvailability = "AVAILABLE" | "NOT_AVAILABLE" | "UNAVAILABLE";
export type FtlClientTrackingTab = "overview" | "tracking" | "documents" | "cargo";
export type FtlClientTrackingSubTab = "overview" | "loading" | "international";

export type FtlClientStatusChip = {
  id: string;
  label: string;
  state: FtlClientTrackingProgressState;
};

export type FtlClientRegionLane = {
  id: TrackingRegion;
  label: string;
  code: string;
  state: FtlClientTrackingProgressState;
  tone: "past" | "current" | "future";
  latest_timestamp: string | null;
};

export type FtlClientCheckpointSummary = {
  id: string;
  region: TrackingRegion;
  label: string;
  timestamp: string | null;
  state: FtlClientTrackingProgressState;
};

export type FtlClientTruckOverviewRow = {
  index: number;
  truck_reference: string;
  truck_number: string;
  trailer_type: string;
  driver_summary: string;
  booking_status: string;
};

export type FtlClientLoadingCard = {
  index: number;
  truck_reference: string;
  truck_number: string;
  trailer_type: string;
  loading_origin: string;
  actual_loading_date: string | null;
  status: "Pending" | "Loaded";
  supplier_name: string | null;
  supplier_location: string | null;
};

export type FtlClientInternationalEvent = {
  id: string;
  label: string;
  location: string;
  state: FtlClientTrackingProgressState;
  timestamp: string | null;
  file: { id: number; file_name: string } | null;
};

export type FtlClientInternationalRegion = {
  id: TrackingRegion;
  label: string;
  code: string;
  state: FtlClientTrackingProgressState;
  events: FtlClientInternationalEvent[];
};

export type FtlClientDocumentRow = {
  id: string;
  label: string;
  status: FtlClientTrackingAvailability;
  reason: string | null;
  file: { id: number; file_name: string } | null;
  details: string[];
};

export type FtlClientImportReferenceRow = {
  index: number;
  import_reference: string;
  boe: string;
  cargo_description: string;
  allocated_quantity: number;
  allocated_weight: number;
  package_type: string;
};

export type FtlClientTruckCargoRow = {
  index: number;
  truck_reference: string;
  loading_origin: string;
  quantity_label: string;
  weight_kg: number;
};

export type FtlClientTrackingViewModel = {
  route_id: JafzaLandRouteId;
  route_label: string;
  service_type_label: string;
  shipment_status_label: string;
  shipment_date: string | null;
  last_updated_at: string;
  status_chips: FtlClientStatusChip[];
  region_lanes: FtlClientRegionLane[];
  compact_checkpoints: FtlClientCheckpointSummary[];
  trucks_overview: FtlClientTruckOverviewRow[];
  expected_loading_date_label: string | null;
  actual_loading_date_label: string | null;
  loading_cards: FtlClientLoadingCard[];
  international_regions: FtlClientInternationalRegion[];
  documents: {
    warehouse: FtlClientDocumentRow[];
    export_invoice: FtlClientDocumentRow;
    customs: FtlClientDocumentRow[];
  };
  cargo: {
    description: string;
    total_weight_kg: number;
    total_quantity_label: string;
    import_references: FtlClientImportReferenceRow[];
    truck_allocations: FtlClientTruckCargoRow[];
    loaded_total_weight_kg: number;
    loaded_total_quantity_label: string;
  };
};

type BuildInput = {
  shipment: FtlClientTrackingShipment;
  steps: FtlClientTrackingStep[];
  docs: FtlClientTrackingDoc[];
  connectedShipments?: unknown[];
  exceptions?: unknown[];
  requests?: unknown[];
};

type StageRuntime = {
  stage: TrackingStageDefinition;
  done: boolean;
  touched: boolean;
  timestamp: string | null;
  file: { id: number; file_name: string } | null;
};

function toDateOrNull(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed ? trimmed : null;
}

function toProgressFromStepStatus(status: StepStatus | undefined): FtlClientTrackingProgressState {
  if (!status) return "PENDING";
  if (status === "DONE") return "DONE";
  if (status === "IN_PROGRESS" || status === "BLOCKED") return "IN_PROGRESS";
  return "PENDING";
}

function toOriginLabel(origin: LoadingTruckRow["loading_origin"]) {
  if (origin === "ZAXON_WAREHOUSE") return "Zaxon Warehouse";
  if (origin === "EXTERNAL_SUPPLIER") return "Supplier";
  if (origin === "MIXED") return "Mixed";
  return "Not selected";
}

function safeNumber(input: unknown) {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string") {
    const parsed = Number(input.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeUnit(unitType: string, unitOther: string) {
  const normalizedType = unitType.trim();
  if (!normalizedType) return "Units";
  if (normalizedType.toLowerCase() !== "other") return normalizedType;
  const other = unitOther.trim();
  return other || "Other";
}

function pushQuantity(
  quantitiesByUnit: Map<string, number>,
  quantity: number,
  unitType: string,
  unitOther: string,
) {
  if (!Number.isFinite(quantity) || quantity <= 0) return;
  const unit = normalizeUnit(unitType, unitOther);
  quantitiesByUnit.set(unit, (quantitiesByUnit.get(unit) ?? 0) + quantity);
}

function formatQuantitySummary(quantitiesByUnit: Map<string, number>) {
  const entries = Array.from(quantitiesByUnit.entries()).filter(
    ([, value]) => Number.isFinite(value) && value > 0,
  );
  if (!entries.length) return "0 units";
  return entries
    .map(([unit, value]) => `${Number(value.toFixed(2))} ${unit}`)
    .join(" + ");
}

function formatDateRangeLabel(dates: Array<string | null>) {
  const filtered = dates
    .filter((value): value is string => !!value)
    .sort((a, b) => a.localeCompare(b));
  if (!filtered.length) return null;
  if (filtered.length === 1) return filtered[0];
  const first = filtered[0];
  const last = filtered[filtered.length - 1];
  if (first === last) return first;
  return `${first} to ${last}`;
}

function fileForKey(
  docsByType: Map<string, { id: number; file_name: string }>,
  stepId: number | undefined,
  key: string | undefined,
) {
  if (!stepId || !key) return null;
  const docType = stepFieldDocType(stepId, encodeFieldPath([key]));
  return docsByType.get(docType) ?? null;
}

function fileForTruckKey(
  docsByType: Map<string, { id: number; file_name: string }>,
  stepId: number | undefined,
  index: number,
  key: string,
) {
  if (!stepId) return null;
  const docType = stepFieldDocType(
    stepId,
    encodeFieldPath(["trucks", String(index), key]),
  );
  return docsByType.get(docType) ?? null;
}

function trackingStepNameForRegion(region: TrackingRegion) {
  if (region === "uae") return FTL_EXPORT_STEP_NAMES.trackingUae;
  if (region === "ksa") return FTL_EXPORT_STEP_NAMES.trackingKsa;
  if (region === "jordan") return FTL_EXPORT_STEP_NAMES.trackingJordan;
  return FTL_EXPORT_STEP_NAMES.trackingSyria;
}

function parseSyriaMode(input: {
  customsValues: Record<string, unknown>;
  syriaValues: Record<string, unknown>;
}): SyriaClearanceMode {
  const fromTracking = getString(input.syriaValues.syria_clearance_mode).toUpperCase();
  if (fromTracking === "ZAXON" || fromTracking === "CLIENT") {
    return fromTracking as SyriaClearanceMode;
  }
  const fromCustoms = getString(input.customsValues.naseeb_clearance_mode).toUpperCase();
  if (fromCustoms === "ZAXON" || fromCustoms === "CLIENT") {
    return fromCustoms as SyriaClearanceMode;
  }
  return "CLIENT";
}

function stageRuntimeForRegion(input: {
  region: TrackingRegion;
  routeId: JafzaLandRouteId;
  syriaMode: SyriaClearanceMode;
  values: Record<string, unknown>;
  stepId?: number;
  docsByType: Map<string, { id: number; file_name: string }>;
}): StageRuntime[] {
  const stages = trackingStagesForRegion({
    region: input.region,
    routeId: input.routeId,
    syriaMode: input.syriaMode,
  });
  return stages.map((stage) => {
    const timestamp = toDateOrNull(input.values[stage.dateKey]);
    const checked = stage.flagKey ? isTruthy(input.values[stage.flagKey]) : false;
    const done = stage.type === "checkpoint" ? checked || !!timestamp : !!timestamp;
    const touched = checked || !!timestamp;
    return {
      stage,
      done,
      touched,
      timestamp,
      file: fileForKey(input.docsByType, input.stepId, stage.fileKey),
    };
  });
}

function regionStateFromStages(stages: StageRuntime[]): FtlClientTrackingProgressState {
  const checkpoints = stages.filter((entry) => entry.stage.type === "checkpoint");
  if (!checkpoints.length) return "PENDING";
  const doneCount = checkpoints.filter((entry) => entry.done).length;
  if (doneCount === checkpoints.length) return "DONE";
  const touched = checkpoints.some((entry) => entry.touched);
  return touched ? "IN_PROGRESS" : "PENDING";
}

function shipmentStatusHeadline(input: {
  overall: ShipmentOverallStatus;
  deliveredState: FtlClientTrackingProgressState;
  invoiceState: FtlClientTrackingProgressState;
  customsState: FtlClientTrackingProgressState;
  inTransitState: FtlClientTrackingProgressState;
}) {
  if (input.deliveredState === "DONE") return "Delivered";
  if (input.invoiceState !== "DONE" || input.customsState !== "DONE") {
    return "Awaiting Documents";
  }
  if (input.inTransitState !== "PENDING") return "In Transit";
  return overallStatusLabel(input.overall);
}

function buildTruckDriverSummary(row: TruckBookingRow) {
  const name = row.driver_name.trim();
  const contact = row.driver_contact.trim();
  if (name && contact) return `${name} (${contact})`;
  if (name) return name;
  if (contact) return contact;
  return "N/A";
}

function effectiveLoaded(row: LoadingTruckRow) {
  if (row.loading_origin === "MIXED") {
    return row.mixed_supplier_loaded && row.mixed_zaxon_loaded;
  }
  return row.truck_loaded;
}

function rowActualLoadingDate(row: LoadingTruckRow) {
  if (row.loading_origin === "EXTERNAL_SUPPLIER") {
    return row.external_loading_date || null;
  }
  if (row.loading_origin === "ZAXON_WAREHOUSE") {
    return row.zaxon_actual_loading_date || null;
  }
  if (row.loading_origin === "MIXED") {
    return row.mixed_supplier_loading_date || row.mixed_zaxon_loading_date || null;
  }
  return null;
}

function rowQuantityLabel(row: LoadingTruckRow) {
  const units = new Map<string, number>();
  if (row.loading_origin === "MIXED") {
    pushQuantity(
      units,
      row.mixed_supplier_cargo_quantity,
      row.mixed_supplier_cargo_unit_type,
      row.mixed_supplier_cargo_unit_type_other,
    );
    pushQuantity(
      units,
      row.mixed_zaxon_cargo_quantity,
      row.mixed_zaxon_cargo_unit_type,
      row.mixed_zaxon_cargo_unit_type_other,
    );
  } else {
    pushQuantity(units, row.cargo_quantity, row.cargo_unit_type, row.cargo_unit_type_other);
  }
  return formatQuantitySummary(units);
}

function rowWeightKg(row: LoadingTruckRow) {
  if (row.loading_origin === "MIXED") {
    return row.mixed_supplier_cargo_weight + row.mixed_zaxon_cargo_weight;
  }
  return row.cargo_weight;
}

function stageStatusBySequence(stages: StageRuntime[]): FtlClientTrackingProgressState[] {
  const statuses: FtlClientTrackingProgressState[] = [];
  let blocked = false;
  for (const entry of stages) {
    if (entry.done) {
      statuses.push("DONE");
      continue;
    }
    if (blocked) {
      statuses.push("PENDING");
      continue;
    }
    statuses.push(entry.touched ? "IN_PROGRESS" : "PENDING");
    blocked = true;
  }
  return statuses;
}

function normalizeShippingStep(step: FtlClientTrackingStep | undefined) {
  if (!step) return { stepId: undefined, values: {} as Record<string, unknown>, status: undefined as StepStatus | undefined };
  return {
    stepId: step.id,
    values: toRecord(parseStepFieldValues(step.field_values_json)),
    status: step.status,
  };
}

function docLabelByStageId(stageId: string) {
  if (stageId === "jebel_ali_customs") return "UAE: Jebel Ali Exit Declaration";
  if (stageId === "sila_customs") return "UAE: Sila Exit Declaration";
  if (stageId === "batha_customs") return "KSA: Batha Entry Declaration";
  if (stageId === "omari_customs") return "Jordan: Omari Entry Declaration";
  if (stageId === "syria_customs") return "Syria: Naseeb Entry Declaration";
  if (stageId === "mushtarakah_customs") return "Mushtarakah Declaration";
  if (stageId === "masnaa_customs") return "Lebanon: Masnaa Entry Declaration";
  return stageId.replace(/_/g, " ");
}

function expectedCustomsDeclarationStages(routeId: JafzaLandRouteId): string[] {
  if (routeId === "JAFZA_TO_KSA") {
    return ["jebel_ali_customs", "sila_customs", "batha_customs"];
  }
  if (routeId === "JAFZA_TO_MUSHTARAKAH") {
    return [
      "jebel_ali_customs",
      "sila_customs",
      "batha_customs",
      "omari_customs",
      "mushtarakah_customs",
      "masnaa_customs",
    ];
  }
  return [
    "jebel_ali_customs",
    "sila_customs",
    "batha_customs",
    "omari_customs",
    "syria_customs",
  ];
}

function customsRowStatus(input: {
  stageId: string;
  file: { id: number; file_name: string } | null;
  customsValues: Record<string, unknown>;
}): { status: FtlClientTrackingAvailability; reason: string | null; details: string[] } {
  if (input.stageId !== "syria_customs") {
    return {
      status: input.file ? "AVAILABLE" : "NOT_AVAILABLE",
      reason: input.file ? null : "Declaration file was not shared yet.",
      details: [],
    };
  }

  const mode = getString(input.customsValues.naseeb_clearance_mode).toUpperCase();
  const details: string[] = [];
  const showConsignee =
    getString(input.customsValues.show_syria_consignee_to_client).toUpperCase() === "YES";
  const consignee = getString(input.customsValues.syria_consignee_name);
  if (showConsignee && consignee) {
    details.push(`Consignee: ${consignee}`);
  }

  if (mode === "CLIENT") {
    const clientAgent = getString(input.customsValues.naseeb_client_final_choice);
    if (clientAgent) {
      details.push(`Client clearing agent: ${clientAgent}`);
    }
    return {
      status: "UNAVAILABLE",
      reason: "Unavailable by clearance rule (client clearance selected).",
      details,
    };
  }

  return {
    status: input.file ? "AVAILABLE" : "NOT_AVAILABLE",
    reason: input.file ? null : "Declaration file was not shared yet.",
    details,
  };
}

export function buildFtlClientTrackingViewModel(
  input: BuildInput,
): FtlClientTrackingViewModel {
  const routeId = resolveJafzaLandRoute(input.shipment.origin, input.shipment.destination);
  const stepsByName = new Map(input.steps.map((step) => [step.name, step]));

  const plan = normalizeShippingStep(stepsByName.get(FTL_EXPORT_STEP_NAMES.exportPlanOverview));
  const trucks = normalizeShippingStep(stepsByName.get(FTL_EXPORT_STEP_NAMES.trucksDetails));
  const loading = normalizeShippingStep(stepsByName.get(FTL_EXPORT_STEP_NAMES.loadingDetails));
  const importSelection = normalizeShippingStep(
    stepsByName.get(FTL_EXPORT_STEP_NAMES.importShipmentSelection),
  );
  const invoice = normalizeShippingStep(stepsByName.get(FTL_EXPORT_STEP_NAMES.exportInvoice));
  const customs = normalizeShippingStep(
    stepsByName.get(FTL_EXPORT_STEP_NAMES.customsAgentsAllocation),
  );
  const trackingSyria = normalizeShippingStep(
    stepsByName.get(FTL_EXPORT_STEP_NAMES.trackingSyria),
  );

  const docsByType = new Map<string, { id: number; file_name: string }>();
  for (const doc of [...input.docs].sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))) {
    if (!docsByType.has(doc.document_type)) {
      docsByType.set(doc.document_type, { id: doc.id, file_name: doc.file_name });
    }
  }

  const truckRows = parseTruckBookingRows(trucks.values);
  const loadingRows = parseLoadingRows(loading.values);
  const importRows = parseImportShipmentRows(importSelection.values);
  const syriaMode = parseSyriaMode({
    customsValues: customs.values,
    syriaValues: trackingSyria.values,
  });

  const regionFlow = trackingRegionFlowForRoute(routeId);
  const regionsRuntime = regionFlow.map((region) => {
    const stepName = trackingStepNameForRegion(region.id);
    const source = normalizeShippingStep(stepsByName.get(stepName));
    const stageRuntime = stageRuntimeForRegion({
      region: region.id,
      routeId,
      syriaMode,
      values: source.values,
      stepId: source.stepId,
      docsByType,
    });
    const state = regionStateFromStages(stageRuntime);
    const latestTimestamp = [...stageRuntime]
      .map((entry) => entry.timestamp)
      .filter((entry): entry is string => !!entry)
      .sort((a, b) => b.localeCompare(a))[0] ?? null;
    return {
      region,
      state,
      stepId: source.stepId,
      stageRuntime,
      latestTimestamp,
      stepStatus: source.status,
    };
  });

  const currentLaneIndex = (() => {
    const firstInProgress = regionsRuntime.findIndex((entry) => entry.state === "IN_PROGRESS");
    if (firstInProgress >= 0) return firstInProgress;
    const firstPending = regionsRuntime.findIndex((entry) => entry.state === "PENDING");
    if (firstPending >= 0) return firstPending;
    return Math.max(regionsRuntime.length - 1, 0);
  })();

  const regionLanes: FtlClientRegionLane[] = regionsRuntime.map((entry, index) => ({
    id: entry.region.id,
    label: entry.region.label,
    code: entry.region.code,
    state: entry.state,
    tone: index < currentLaneIndex ? "past" : index === currentLaneIndex ? "current" : "future",
    latest_timestamp: entry.latestTimestamp,
  }));

  const finalRegion = regionsRuntime[regionsRuntime.length - 1];
  const deliveredState = finalRegion?.state ?? "PENDING";
  const invoiceState = toProgressFromStepStatus(invoice.status);
  const customsState = toProgressFromStepStatus(customs.status);
  const anyTransitProgress = regionsRuntime.some((entry) => entry.state !== "PENDING");
  const inTransitState: FtlClientTrackingProgressState =
    deliveredState === "DONE"
      ? "DONE"
      : anyTransitProgress
        ? "IN_PROGRESS"
        : "PENDING";

  const activeTruckRows = truckRows.filter((row) => row.booking_status !== "CANCELLED");
  const bookedCount = activeTruckRows.filter(
    (row) => row.booking_status === "BOOKED" || row.truck_booked,
  ).length;
  const trucksState: FtlClientTrackingProgressState =
    activeTruckRows.length === 0
      ? "PENDING"
      : bookedCount === activeTruckRows.length
        ? "DONE"
        : bookedCount > 0
          ? "IN_PROGRESS"
          : "PENDING";

  const loadedCount = loadingRows.filter((row) => effectiveLoaded(row)).length;
  const loadingState: FtlClientTrackingProgressState =
    loadingRows.length === 0
      ? toProgressFromStepStatus(loading.status)
      : loadedCount === loadingRows.length
        ? "DONE"
        : loadedCount > 0
          ? "IN_PROGRESS"
          : "PENDING";

  const orderReceivedDone =
    isTruthy(plan.values.order_received) || !!toDateOrNull(plan.values.order_received_date);
  const orderReceivedTouched = !!toDateOrNull(plan.values.order_received_date);
  const orderReceivedState: FtlClientTrackingProgressState = orderReceivedDone
    ? "DONE"
    : orderReceivedTouched
      ? "IN_PROGRESS"
      : "PENDING";

  const statusChips: FtlClientStatusChip[] = [
    { id: "order-received", label: "Order received", state: orderReceivedState },
    { id: "trucks-booked", label: "Trucks booked", state: trucksState },
    { id: "loading", label: "Loading", state: loadingState },
    { id: "export-invoice", label: "Export invoice", state: invoiceState },
    { id: "customs-allocation", label: "Customs allocation", state: customsState },
    { id: "in-transit", label: "In transit", state: inTransitState },
    { id: "delivered", label: "Delivered", state: deliveredState },
  ];

  const compactCheckpoints: FtlClientCheckpointSummary[] = [];
  for (const regionEntry of regionsRuntime) {
    const stageStatuses = stageStatusBySequence(regionEntry.stageRuntime);
    regionEntry.stageRuntime.forEach((entry, index) => {
      if (entry.stage.type !== "checkpoint") return;
      compactCheckpoints.push({
        id: `${regionEntry.region.id}-${entry.stage.id}`,
        region: regionEntry.region.id,
        label: `${regionEntry.region.label}: ${entry.stage.shortLabel}`,
        timestamp: entry.timestamp,
        state: stageStatuses[index],
      });
    });
  }

  const trucksOverview: FtlClientTruckOverviewRow[] = activeTruckRows.map((row) => ({
    index: row.index,
    truck_reference: row.truck_reference || `Truck ${row.index + 1}`,
    truck_number: row.truck_number || "-",
    trailer_type: row.trailer_type || "-",
    driver_summary: buildTruckDriverSummary(row),
    booking_status: row.booking_status || "PENDING",
  }));

  const loadingByIndex = new Map(loadingRows.map((row) => [row.index, row]));
  const loadingCards: FtlClientLoadingCard[] = trucksOverview.map((truck) => {
    const loadingRow = loadingByIndex.get(truck.index);
    if (!loadingRow) {
      return {
        index: truck.index,
        truck_reference: truck.truck_reference,
        truck_number: truck.truck_number,
        trailer_type: truck.trailer_type,
        loading_origin: "Not selected",
        actual_loading_date: null,
        status: "Pending",
        supplier_name: null,
        supplier_location: null,
      };
    }
    const supplierName =
      loadingRow.loading_origin === "EXTERNAL_SUPPLIER" ||
      loadingRow.loading_origin === "MIXED"
        ? loadingRow.supplier_name || null
        : null;
    const supplierLocation =
      loadingRow.loading_origin === "EXTERNAL_SUPPLIER" ||
      loadingRow.loading_origin === "MIXED"
        ? loadingRow.external_loading_location || null
        : null;
    return {
      index: truck.index,
      truck_reference: truck.truck_reference,
      truck_number: truck.truck_number,
      trailer_type: truck.trailer_type,
      loading_origin: toOriginLabel(loadingRow.loading_origin),
      actual_loading_date: rowActualLoadingDate(loadingRow),
      status: effectiveLoaded(loadingRow) ? "Loaded" : "Pending",
      supplier_name: supplierName,
      supplier_location: supplierLocation,
    };
  });

  const expectedLoadingDateLabel = formatDateRangeLabel(
    activeTruckRows.map((row) => toDateOrNull(row.estimated_loading_date)),
  );
  const actualLoadingDateLabel = formatDateRangeLabel(
    loadingRows.flatMap((row) => {
      if (row.loading_origin === "MIXED") {
        return [
          toDateOrNull(row.mixed_supplier_loading_date),
          toDateOrNull(row.mixed_zaxon_loading_date),
        ];
      }
      return [rowActualLoadingDate(row)];
    }),
  );

  const internationalRegions: FtlClientInternationalRegion[] = regionsRuntime.map((entry) => {
    const eventStates = stageStatusBySequence(entry.stageRuntime);
    const events = entry.stageRuntime.map((runtime, index) => ({
      id: runtime.stage.id,
      label: runtime.stage.title,
      location: runtime.stage.location,
      state: eventStates[index],
      timestamp: runtime.timestamp,
      file: runtime.file,
    }));
    return {
      id: entry.region.id,
      label: entry.region.label,
      code: entry.region.code,
      state: entry.state,
      events,
    };
  });

  const loadingStepId = loading.stepId;
  const warehouseRows: FtlClientDocumentRow[] = trucksOverview.flatMap((truck) => {
    const index = truck.index;
    const loadingSheet = fileForTruckKey(docsByType, loadingStepId, index, "loading_sheet_upload");
    const loadingPhoto = fileForTruckKey(docsByType, loadingStepId, index, "loading_photo");
    const truckLabel = truck.truck_reference || `Truck ${index + 1}`;
    return [
      {
        id: `warehouse-sheet-${index}`,
        label: `${truckLabel} - Loading sheet`,
        status: loadingSheet ? "AVAILABLE" : "NOT_AVAILABLE",
        reason: loadingSheet ? null : "Loading sheet was not shared yet.",
        file: loadingSheet,
        details: [],
      },
      {
        id: `warehouse-photo-${index}`,
        label: `${truckLabel} - Loading pictures`,
        status: loadingPhoto ? "AVAILABLE" : "NOT_AVAILABLE",
        reason: loadingPhoto ? null : "Loading pictures were not shared yet.",
        file: loadingPhoto,
        details: [],
      },
    ];
  });

  const exportInvoiceFile = fileForKey(docsByType, invoice.stepId, "invoice_upload");
  const exportInvoiceRow: FtlClientDocumentRow = {
    id: "export-invoice",
    label: "Export invoice",
    status: exportInvoiceFile ? "AVAILABLE" : "NOT_AVAILABLE",
    reason: exportInvoiceFile ? null : "Export invoice was not shared yet.",
    file: exportInvoiceFile,
    details: [],
  };

  const customsRows: FtlClientDocumentRow[] = [];
  const customsByStage = new Map<string, StageRuntime>();
  for (const region of regionsRuntime) {
    for (const stage of region.stageRuntime) {
      if (stage.stage.type !== "customs") continue;
      if (!customsByStage.has(stage.stage.id)) {
        customsByStage.set(stage.stage.id, stage);
      }
    }
  }
  const expectedCustomsStages = expectedCustomsDeclarationStages(routeId);
  for (const stageId of expectedCustomsStages) {
    const stage = customsByStage.get(stageId);
    const base = customsRowStatus({
      stageId,
      file: stage?.file ?? null,
      customsValues: customs.values,
    });
    customsRows.push({
      id: `customs-${stageId}`,
      label: docLabelByStageId(stageId),
      status: base.status,
      reason: base.reason,
      file: base.status === "AVAILABLE" ? stage?.file ?? null : null,
      details: base.details,
    });
  }

  const quantityByUnit = new Map<string, number>();
  let totalWeightFromImports = 0;
  for (const row of importRows) {
    totalWeightFromImports += safeNumber(row.allocated_weight);
    pushQuantity(
      quantityByUnit,
      safeNumber(row.allocated_quantity),
      getString(row.package_type),
      "",
    );
  }

  const truckQuantityByUnit = new Map<string, number>();
  let truckWeightTotal = 0;
  const truckAllocationRows: FtlClientTruckCargoRow[] = [];
  for (const truck of trucksOverview) {
    const load = loadingByIndex.get(truck.index);
    if (!load) continue;
    const weight = rowWeightKg(load);
    truckWeightTotal += weight;
    if (load.loading_origin === "MIXED") {
      pushQuantity(
        truckQuantityByUnit,
        load.mixed_supplier_cargo_quantity,
        load.mixed_supplier_cargo_unit_type,
        load.mixed_supplier_cargo_unit_type_other,
      );
      pushQuantity(
        truckQuantityByUnit,
        load.mixed_zaxon_cargo_quantity,
        load.mixed_zaxon_cargo_unit_type,
        load.mixed_zaxon_cargo_unit_type_other,
      );
    } else {
      pushQuantity(
        truckQuantityByUnit,
        load.cargo_quantity,
        load.cargo_unit_type,
        load.cargo_unit_type_other,
      );
    }
    truckAllocationRows.push({
      index: truck.index,
      truck_reference: truck.truck_reference,
      loading_origin: toOriginLabel(load.loading_origin),
      quantity_label: rowQuantityLabel(load),
      weight_kg: Number(weight.toFixed(2)),
    });
  }

  const importReferenceRows: FtlClientImportReferenceRow[] = importRows.map((row, index) => ({
    index,
    import_reference: row.import_shipment_reference || "-",
    boe: row.import_boe_number || "-",
    cargo_description: row.cargo_description || "-",
    allocated_quantity: Number(row.allocated_quantity.toFixed(2)),
    allocated_weight: Number(row.allocated_weight.toFixed(2)),
    package_type: row.package_type || "-",
  }));

  const descriptionFromImports = Array.from(
    new Set(
      importRows
        .map((row: ImportShipmentAllocationRow) => row.cargo_description.trim())
        .filter((value) => !!value),
    ),
  ).join(" | ");
  const cargoDescription = descriptionFromImports || input.shipment.cargo_description || "N/A";

  const totalQuantityLabel =
    totalWeightFromImports > 0 || quantityByUnit.size
      ? formatQuantitySummary(quantityByUnit)
      : formatQuantitySummary(truckQuantityByUnit);
  const totalWeightKg =
    totalWeightFromImports > 0
      ? Number(totalWeightFromImports.toFixed(2))
      : Number(truckWeightTotal.toFixed(2));

  const shipmentDate =
    toDateOrNull(plan.values.order_received_date) ??
    toDateOrNull(input.shipment.created_at) ??
    toDateOrNull(input.shipment.last_update_at);

  const shipmentStatusLabel = shipmentStatusHeadline({
    overall: input.shipment.overall_status,
    deliveredState,
    invoiceState,
    customsState,
    inTransitState,
  });

  return {
    route_id: routeId,
    route_label: `${input.shipment.origin} -> ${input.shipment.destination}`,
    service_type_label: "Full truck Export",
    shipment_status_label: shipmentStatusLabel,
    shipment_date: shipmentDate,
    last_updated_at: input.shipment.last_update_at,
    status_chips: statusChips,
    region_lanes: regionLanes,
    compact_checkpoints: compactCheckpoints,
    trucks_overview: trucksOverview,
    expected_loading_date_label: expectedLoadingDateLabel,
    actual_loading_date_label: actualLoadingDateLabel,
    loading_cards: loadingCards,
    international_regions: internationalRegions,
    documents: {
      warehouse: warehouseRows,
      export_invoice: exportInvoiceRow,
      customs: customsRows,
    },
    cargo: {
      description: cargoDescription,
      total_weight_kg: totalWeightKg,
      total_quantity_label: totalQuantityLabel,
      import_references: importReferenceRows,
      truck_allocations: truckAllocationRows,
      loaded_total_weight_kg: Number(truckWeightTotal.toFixed(2)),
      loaded_total_quantity_label: formatQuantitySummary(truckQuantityByUnit),
    },
  };
}
