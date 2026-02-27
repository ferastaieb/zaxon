"use client";

import { useMemo, useState } from "react";

import { AppIcon } from "@/components/ui/AppIcon";
import { Badge } from "@/components/ui/Badge";
import { CopyField } from "@/components/ui/CopyField";
import {
  overallStatusLabel,
  riskLabel,
  type ShipmentOverallStatus,
  type ShipmentRisk,
} from "@/lib/domain";
import { FTL_EXPORT_STEP_NAMES } from "@/lib/ftlExport/constants";
import {
  allReferencedImportsAvailable,
  buildImportStockSummary,
  computeImportWarnings,
  computeLoadingProgress,
  getString,
  isTruthy,
  parseImportShipmentRows,
  parseLoadingRows,
  parseTruckBookingRows,
} from "@/lib/ftlExport/helpers";
import { computeFtlExportStatuses } from "@/lib/ftlExport/status";
import type {
  FtlDocumentMeta,
  FtlImportCandidate,
  FtlShipmentMeta,
  FtlStepData,
} from "./types";
import { CustomsAgentsStepForm } from "./forms/CustomsAgentsStepForm";
import { ExportInvoiceStepForm } from "./forms/ExportInvoiceStepForm";
import { ExportPlanStepForm } from "./forms/ExportPlanStepForm";
import { ImportShipmentSelectionStepForm } from "./forms/ImportShipmentSelectionStepForm";
import { LoadingDetailsStepForm } from "./forms/LoadingDetailsStepForm";
import { StockViewStepForm } from "./forms/StockViewStepForm";
import { TrackingStepForm, type TrackingAgentGate } from "./forms/TrackingStepForm";
import { TrucksDetailsStepForm } from "./forms/TrucksDetailsStepForm";
import {
  trackingRegionFlowForRoute,
  type TrackingRegion,
} from "./forms/trackingTimelineConfig";
import {
  jafzaRouteById,
  resolveJafzaLandRoute,
} from "@/lib/routes/jafzaLandRoutes";

export type FtlMainTab =
  | "plan"
  | "trucks"
  | "loading"
  | "invoice"
  | "agents"
  | "tracking";
export type FtlInvoiceTab = "imports" | "invoice" | "stock";
export type FtlTrackingTab =
  | "uae"
  | "ksa"
  | "jordan"
  | "syria"
  | "mushtarakah"
  | "lebanon";

type WorkspaceProps = {
  headingClassName?: string;
  shipment: FtlShipmentMeta;
  steps: FtlStepData[];
  brokers: Array<{ id: number; name: string }>;
  customers: Array<{ id: number; name: string }>;
  latestDocsByType: Record<string, FtlDocumentMeta>;
  importCandidates: FtlImportCandidate[];
  trackingToken: string | null;
  canEdit: boolean;
  isAdmin: boolean;
  updateAction: (formData: FormData) => void;
  initialTab?: FtlMainTab;
  initialInvoiceTab?: FtlInvoiceTab;
  initialTrackingTab?: FtlTrackingTab;
};

function riskTone(risk: ShipmentRisk) {
  if (risk === "BLOCKED") return "red";
  if (risk === "AT_RISK") return "yellow";
  return "green";
}

function loadingTone(input: { expected: number; loaded: number }) {
  if (input.expected <= 0 || input.loaded <= 0) return "zinc";
  if (input.loaded >= input.expected) return "green";
  return "blue";
}

function loadingLabel(input: { expected: number; loaded: number }) {
  if (input.expected <= 0 || input.loaded <= 0) return "Pending";
  if (input.loaded >= input.expected) return "Done";
  return "In progress";
}

function isMainTab(value: string | undefined): value is FtlMainTab {
  return value === "plan" || value === "trucks" || value === "loading" || value === "invoice" || value === "agents" || value === "tracking";
}

function isInvoiceTab(value: string | undefined): value is FtlInvoiceTab {
  return value === "imports" || value === "invoice" || value === "stock";
}

function isTrackingTab(value: string | undefined): value is FtlTrackingTab {
  return (
    value === "uae" ||
    value === "ksa" ||
    value === "jordan" ||
    value === "syria" ||
    value === "mushtarakah" ||
    value === "lebanon"
  );
}

function daysSince(isoDate: string) {
  if (!isoDate) return 0;
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return 0;
  const diff = Date.now() - target.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function latestDateValue(values: Record<string, unknown>) {
  const dates = Object.entries(values)
    .filter(([key, value]) => key.endsWith("_date") && typeof value === "string" && !!value)
    .map(([, value]) => String(value));
  return dates.sort().at(-1) ?? "";
}

function MissingStep({ name }: { name: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Step not found in this shipment: {name}
    </div>
  );
}

export function FtlExportWorkspace({
  headingClassName = "",
  shipment,
  steps,
  brokers,
  customers,
  latestDocsByType,
  importCandidates,
  trackingToken,
  canEdit,
  isAdmin,
  updateAction,
  initialTab,
  initialInvoiceTab,
  initialTrackingTab,
}: WorkspaceProps) {
  const routeId = resolveJafzaLandRoute(shipment.origin, shipment.destination);
  const routeProfile = jafzaRouteById(routeId);
  const trackingFlow = trackingRegionFlowForRoute(routeId);
  const defaultTrackingTab = (routeProfile.trackingTabs[0] ?? "uae") as FtlTrackingTab;
  const [tab, setTab] = useState<FtlMainTab>(initialTab && isMainTab(initialTab) ? initialTab : "plan");
  const [invoiceTab, setInvoiceTab] = useState<FtlInvoiceTab>(
    initialInvoiceTab && isInvoiceTab(initialInvoiceTab) ? initialInvoiceTab : "imports",
  );
  const [trackingTab, setTrackingTab] = useState<FtlTrackingTab>(() => {
    if (initialTrackingTab && isTrackingTab(initialTrackingTab)) {
      return routeProfile.trackingTabs.includes(initialTrackingTab)
        ? initialTrackingTab
        : defaultTrackingTab;
    }
    return defaultTrackingTab;
  });

  const stepByName = useMemo(() => new Map(steps.map((step) => [step.name, step])), [steps]);

  const planStep = stepByName.get(FTL_EXPORT_STEP_NAMES.exportPlanOverview);
  const trucksStep = stepByName.get(FTL_EXPORT_STEP_NAMES.trucksDetails);
  const loadingStep = stepByName.get(FTL_EXPORT_STEP_NAMES.loadingDetails);
  const importStep = stepByName.get(FTL_EXPORT_STEP_NAMES.importShipmentSelection);
  const invoiceStep = stepByName.get(FTL_EXPORT_STEP_NAMES.exportInvoice);
  const stockStep = stepByName.get(FTL_EXPORT_STEP_NAMES.stockView);
  const agentsStep = stepByName.get(FTL_EXPORT_STEP_NAMES.customsAgentsAllocation);
  const uaeStep = stepByName.get(FTL_EXPORT_STEP_NAMES.trackingUae);
  const ksaStep = stepByName.get(FTL_EXPORT_STEP_NAMES.trackingKsa);
  const jordanStep = stepByName.get(FTL_EXPORT_STEP_NAMES.trackingJordan);
  const syriaStep = stepByName.get(FTL_EXPORT_STEP_NAMES.trackingSyria);
  const orderReceivedDate = getString(
    (planStep?.values ?? {})["order_received_date"],
  );

  const truckRows = parseTruckBookingRows((trucksStep?.values ?? {}) as Record<string, unknown>);
  const loadingRows = parseLoadingRows((loadingStep?.values ?? {}) as Record<string, unknown>);
  const loadingProgress = computeLoadingProgress({ truckRows, loadingRows });
  const importRows = parseImportShipmentRows((importStep?.values ?? {}) as Record<string, unknown>);
  const importWarnings = computeImportWarnings(importRows);
  const stockSummary = buildImportStockSummary(importRows);
  const importsAvailable = allReferencedImportsAvailable(importRows);
  const stepsByNameForStatus: Record<
    string,
    { id: number; values: Record<string, unknown> } | undefined
  > = {};
  for (const currentStep of steps) {
    stepsByNameForStatus[currentStep.name] = {
      id: currentStep.id,
      values: (currentStep.values ?? {}) as Record<string, unknown>,
    };
  }
  const computedStatus = computeFtlExportStatuses({
    stepsByName: stepsByNameForStatus,
    docTypes: new Set(Object.keys(latestDocsByType)),
    routeId,
  });
  const loadingCompleted =
    computedStatus.statuses[FTL_EXPORT_STEP_NAMES.loadingDetails] === "DONE";
  const canFinalizeInvoice = computedStatus.canFinalizeInvoice;
  const trucksReadyForInvoice = computedStatus.invoiceTruckDetailsComplete;
  const missingTruckRefs = computedStatus.missingInvoiceTruckDetails;
  const missingTruckPreview = missingTruckRefs.slice(0, 3).join(", ");
  const missingTruckSuffix =
    missingTruckRefs.length > 3 ? ` +${missingTruckRefs.length - 3} more` : "";
  const invoicePrereqMessageParts: string[] = [];
  if (!loadingCompleted) {
    invoicePrereqMessageParts.push("Complete loading for all trucks.");
  }
  if (!importsAvailable) {
    invoicePrereqMessageParts.push(
      "All linked import shipments must be processed/available.",
    );
  }
  if (!trucksReadyForInvoice) {
    invoicePrereqMessageParts.push(
      missingTruckRefs.length
        ? `Complete truck details (truck number, driver name, driver contact) for: ${missingTruckPreview}${missingTruckSuffix}.`
        : "Complete truck details (truck number, driver name, driver contact) in Trucks Details tab.",
    );
  }
  const invoicePrereqMessage = invoicePrereqMessageParts.join(" ");
  const invoiceFinalized = isTruthy(invoiceStep?.values.invoice_finalized);
  const invoiceDone = invoiceStep?.status === "DONE";
  const trackingUnlocked = loadingCompleted && invoiceDone;
  const trackingLink = trackingToken ? `/track/${trackingToken}` : "";
  const stepForTrackingTab = (tabId: FtlTrackingTab) => {
    if (tabId === "uae") return uaeStep;
    if (tabId === "ksa") return ksaStep;
    if (tabId === "jordan") return jordanStep;
    return syriaStep;
  };
  const stepNameForTrackingTab = (tabId: FtlTrackingTab) => {
    if (tabId === "uae") return FTL_EXPORT_STEP_NAMES.trackingUae;
    if (tabId === "ksa") return FTL_EXPORT_STEP_NAMES.trackingKsa;
    if (tabId === "jordan") return FTL_EXPORT_STEP_NAMES.trackingJordan;
    return FTL_EXPORT_STEP_NAMES.trackingSyria;
  };

  const trackingRegionStates = trackingFlow.map((regionEntry) => {
    const step = stepForTrackingTab(regionEntry.id as FtlTrackingTab);
    const stepName = stepNameForTrackingTab(regionEntry.id as FtlTrackingTab);
    const stepStatus = computedStatus.statuses[stepName] ?? step?.status ?? "PENDING";
    const latestDate = latestDateValue((step?.values ?? {}) as Record<string, unknown>);
    const stalled =
      !!latestDate && stepStatus !== "DONE" && daysSince(latestDate) >= 3;
    return {
      ...regionEntry,
      stepStatus,
      stalled,
    };
  });
  const syriaClearanceMode =
    getString(agentsStep?.values.naseeb_clearance_mode).toUpperCase() === "ZAXON"
      ? "ZAXON"
      : "CLIENT";
  const agentValues = (agentsStep?.values ?? {}) as Record<string, unknown>;
  const bathaMode = getString(agentValues.batha_clearance_mode).toUpperCase();
  const bathaModeReady =
    routeId !== "JAFZA_TO_KSA"
      ? !!getString(agentValues.batha_agent_name)
      : bathaMode === "ZAXON"
        ? !!getString(agentValues.batha_agent_name) &&
          !!getString(agentValues.batha_consignee_name) &&
          !!getString(agentValues.show_batha_consignee_to_client)
        : bathaMode === "CLIENT"
          ? !!getString(agentValues.batha_client_final_choice)
          : false;
  const masnaaMode = getString(agentValues.masnaa_clearance_mode).toUpperCase();
  const masnaaReady =
    routeId !== "JAFZA_TO_MUSHTARAKAH"
      ? true
      : masnaaMode === "ZAXON"
        ? !!getString(agentValues.masnaa_agent_name) &&
          !!getString(agentValues.masnaa_consignee_name) &&
          !!getString(agentValues.show_masnaa_consignee_to_client)
        : masnaaMode === "CLIENT"
          ? !!getString(agentValues.masnaa_client_final_choice)
          : false;
  const trackingAgentGate: TrackingAgentGate = {
    jebelAliReady: !!getString(agentValues.jebel_ali_agent_name),
    silaReady: !!getString(agentValues.sila_agent_name),
    bathaReady: !!getString(agentValues.batha_agent_name),
    bathaModeReady,
    omariReady: !!getString(agentValues.omari_agent_name),
    naseebReady:
      syriaClearanceMode === "ZAXON"
        ? !!getString(agentValues.naseeb_agent_name)
        : !!getString(agentValues.naseeb_client_final_choice),
    mushtarakahReady:
      routeId !== "JAFZA_TO_MUSHTARAKAH"
        ? true
        : !!getString(agentValues.mushtarakah_agent_name) &&
          !!getString(agentValues.mushtarakah_consignee_name),
    masnaaReady,
  };

  const baseUrl = `/shipments/ftl-export/${shipment.id}`;
  const returnTo = (nextTab: FtlMainTab, sub?: string) => {
    const params = new URLSearchParams({ tab: nextTab });
    if (nextTab === "invoice" && sub) params.set("invoice", sub);
    if (nextTab === "tracking" && sub) params.set("tracking", sub);
    return `${baseUrl}?${params.toString()}`;
  };

  const mainTabDone: Record<FtlMainTab, boolean> = {
    plan: planStep?.status === "DONE",
    trucks: trucksStep?.status === "DONE",
    loading: loadingStep?.status === "DONE",
    invoice: invoiceStep?.status === "DONE",
    agents: agentsStep?.status === "DONE",
    tracking:
      routeProfile.trackingTabs.every((tabId) => stepForTrackingTab(tabId)?.status === "DONE"),
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
          <AppIcon name="icon-route" size={22} />
          FTL export workflow
        </div>
        <h1 className={`${headingClassName} mt-2 text-2xl font-semibold text-zinc-900`}>
          {shipment.shipment_code}
        </h1>
        <div className="mt-1 text-sm text-zinc-600">
          {shipment.origin} to {shipment.destination}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="zinc">{overallStatusLabel(shipment.overall_status as ShipmentOverallStatus)}</Badge>
          <Badge tone={riskTone(shipment.risk as ShipmentRisk)}>
            {riskLabel(shipment.risk as ShipmentRisk)}
          </Badge>
          <Badge tone={loadingTone(loadingProgress)}>
            Loading: {loadingLabel(loadingProgress)} ({loadingProgress.loaded}/{loadingProgress.expected || 0})
          </Badge>
        </div>
        <div className="mt-4">
          <CopyField value={trackingLink || "-"} />
        </div>
      </header>

      <div className="flex flex-nowrap gap-2 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        {[
          { id: "plan", label: "1. Export Plan Overview", icon: "icon-order-received" as const },
          { id: "trucks", label: "2. Trucks Details", icon: "icon-calendar-trigger" as const },
          { id: "loading", label: "3. Loading Details", icon: "icon-upload-proof" as const },
          { id: "invoice", label: "4. Export Invoice & Reference", icon: "icon-finalized" as const },
          { id: "agents", label: "5. Customs Agents", icon: "icon-doc-required" as const },
          { id: "tracking", label: "6. Shipment Tracking", icon: "icon-route" as const },
        ].map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id as FtlMainTab)}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              tab === entry.id
                ? mainTabDone[entry.id as FtlMainTab]
                  ? "bg-emerald-200 text-emerald-900"
                  : "bg-zinc-900 text-white"
                : mainTabDone[entry.id as FtlMainTab]
                  ? "border border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                  : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <AppIcon
                name={entry.icon}
                size={20}
                className={
                  tab === entry.id
                    ? mainTabDone[entry.id as FtlMainTab]
                      ? "opacity-90"
                      : "invert"
                    : "opacity-80"
                }
              />
              {entry.label}
            </span>
          </button>
        ))}
      </div>

      {tab === "plan" ? (
        planStep ? (
          <ExportPlanStepForm
            step={planStep}
            updateAction={updateAction}
            returnTo={returnTo("plan")}
            canEdit={canEdit}
            isAdmin={isAdmin}
          />
        ) : (
          <MissingStep name={FTL_EXPORT_STEP_NAMES.exportPlanOverview} />
        )
      ) : null}

      {tab === "trucks" ? (
        trucksStep ? (
          <TrucksDetailsStepForm
            step={trucksStep}
            updateAction={updateAction}
            returnTo={returnTo("trucks")}
            canEdit={canEdit}
            isAdmin={isAdmin}
            invoiceFinalized={invoiceFinalized}
            defaultEstimatedLoadingDate={orderReceivedDate}
          />
        ) : (
          <MissingStep name={FTL_EXPORT_STEP_NAMES.trucksDetails} />
        )
      ) : null}

      {tab === "loading" ? (
        loadingStep ? (
          <LoadingDetailsStepForm
            step={loadingStep}
            updateAction={updateAction}
            returnTo={returnTo("loading")}
            canEdit={canEdit}
            isAdmin={isAdmin}
            truckRows={truckRows}
            latestDocsByType={latestDocsByType}
          />
        ) : (
          <MissingStep name={FTL_EXPORT_STEP_NAMES.loadingDetails} />
        )
      ) : null}

      {tab === "invoice" ? (
        <div className="space-y-4">
          <div className="flex flex-nowrap gap-2 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-3">
            {[
              { id: "imports", label: "Import shipments", icon: "icon-allocation" as const },
              { id: "invoice", label: "Export invoice", icon: "icon-finalized" as const },
              { id: "stock", label: "Stock view", icon: "icon-stock" as const },
            ].map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setInvoiceTab(entry.id as FtlInvoiceTab)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                  invoiceTab === entry.id
                    ? "bg-zinc-900 text-white"
                    : entry.id === "invoice" && !trucksReadyForInvoice
                      ? "border border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <AppIcon
                    name={entry.icon}
                    size={20}
                    className={invoiceTab === entry.id ? "invert" : "opacity-80"}
                  />
                  <span>{entry.label}</span>
                  {entry.id === "invoice" && !trucksReadyForInvoice ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        invoiceTab === entry.id
                          ? "bg-white/20 text-white"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      Truck details required
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>

          {invoiceTab === "imports" ? (
            importStep ? (
              <>
                {importWarnings.unavailable.length || importWarnings.overallocation.length ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {importWarnings.unavailable.length
                      ? `${importWarnings.unavailable.length} reference(s) are not processed/available. `
                      : ""}
                    {importWarnings.overallocation.length
                      ? `${importWarnings.overallocation.length} row(s) exceed remaining balance.`
                      : ""}
                  </div>
                ) : null}
                <ImportShipmentSelectionStepForm
                  step={importStep}
                  updateAction={updateAction}
                  returnTo={returnTo("invoice", "imports")}
                  canEdit={canEdit}
                  isAdmin={isAdmin}
                  candidates={importCandidates}
                />
              </>
            ) : (
              <MissingStep name={FTL_EXPORT_STEP_NAMES.importShipmentSelection} />
            )
          ) : null}

          {invoiceTab === "invoice" ? (
            invoiceStep ? (
              <ExportInvoiceStepForm
                step={invoiceStep}
                updateAction={updateAction}
                returnTo={returnTo("invoice", "invoice")}
                canEdit={canEdit}
                isAdmin={isAdmin}
                canFinalizeInvoice={canFinalizeInvoice}
                prerequisiteMessage={invoicePrereqMessage || undefined}
                latestDocsByType={latestDocsByType}
              />
            ) : (
              <MissingStep name={FTL_EXPORT_STEP_NAMES.exportInvoice} />
            )
          ) : null}

          {invoiceTab === "stock" ? (
            stockStep ? (
              <StockViewStepForm
                step={stockStep}
                updateAction={updateAction}
                returnTo={returnTo("invoice", "stock")}
                canEdit={canEdit}
                isAdmin={isAdmin}
                summaryRows={stockSummary}
              />
            ) : (
              <MissingStep name={FTL_EXPORT_STEP_NAMES.stockView} />
            )
          ) : null}
        </div>
      ) : null}

      {tab === "agents" ? (
        agentsStep ? (
          <CustomsAgentsStepForm
            step={agentsStep}
            updateAction={updateAction}
            returnTo={returnTo("agents")}
            canEdit={canEdit}
            isAdmin={isAdmin}
            brokers={brokers}
            consigneeParties={customers}
            routeId={routeId}
          />
        ) : (
          <MissingStep name={FTL_EXPORT_STEP_NAMES.customsAgentsAllocation} />
        )
      ) : null}

      {tab === "tracking" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-3">
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              <AppIcon name="icon-route" size={19} />
              Route timeline
            </div>
            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-max items-center gap-2">
                {trackingRegionStates.map((entry, index) => {
                  const tone =
                    entry.stepStatus === "DONE"
                      ? "done"
                      : entry.stalled
                        ? "stalled"
                        : trackingTab === entry.id
                          ? "active"
                          : entry.stepStatus === "IN_PROGRESS"
                            ? "active"
                            : "pending";
                  const buttonClass =
                    tone === "done"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : tone === "stalled"
                        ? "border-red-300 bg-red-50 text-red-900"
                        : tone === "active"
                          ? "border-blue-300 bg-blue-50 text-blue-900"
                          : "border-zinc-200 bg-white text-zinc-700";
                  const dotClass =
                    tone === "done"
                      ? "bg-emerald-500"
                      : tone === "stalled"
                        ? "bg-red-500"
                        : tone === "active"
                          ? "bg-blue-500"
                          : "bg-zinc-300";

                  return (
                    <div key={entry.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTrackingTab(entry.id as FtlTrackingTab)}
                        className={`w-32 rounded-lg border px-3 py-2 text-left text-xs transition ${buttonClass}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                          <span className="font-semibold">
                            {entry.label} ({entry.code})
                          </span>
                        </div>
                        <div className="mt-1 opacity-80">
                          {entry.stepStatus === "DONE"
                            ? "Completed"
                            : entry.stalled
                              ? "Stalled"
                              : entry.stepStatus === "IN_PROGRESS"
                                ? "In progress"
                                : "Pending"}
                        </div>
                      </button>
                      {index < trackingRegionStates.length - 1 ? (
                        <div
                          className={`h-[3px] w-8 rounded-full ${
                            entry.stepStatus === "DONE"
                              ? "bg-emerald-400"
                              : entry.stalled
                                ? "bg-red-400"
                                : "bg-zinc-300"
                          }`}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {(() => {
            const activeStep = stepForTrackingTab(trackingTab);
            const missingStepName =
              trackingTab === "uae"
                ? FTL_EXPORT_STEP_NAMES.trackingUae
                : trackingTab === "ksa"
                  ? FTL_EXPORT_STEP_NAMES.trackingKsa
                  : trackingTab === "jordan"
                    ? FTL_EXPORT_STEP_NAMES.trackingJordan
                    : FTL_EXPORT_STEP_NAMES.trackingSyria;
            const region = trackingTab as TrackingRegion;
            const trackingOrder = trackingFlow.map((entry) => entry.id as FtlTrackingTab);
            const trackingTabIndex = trackingOrder.indexOf(trackingTab);
            const previousRegionStates =
              trackingTabIndex > 0 ? trackingRegionStates.slice(0, trackingTabIndex) : [];
            const blockingRegionState = previousRegionStates.find(
              (entry) => (entry.stepStatus ?? "PENDING") !== "DONE",
            );
            const currentRegionLabel =
              trackingRegionStates.find((entry) => entry.id === trackingTab)?.label ??
              trackingTab.toUpperCase();
            const blockingRegionLabel = blockingRegionState?.label;
            const trackingSequenceLocked = trackingTabIndex > 0 && !!blockingRegionState;

            if (!activeStep) return <MissingStep name={missingStepName} />;

            return (
              <TrackingStepForm
                step={activeStep}
                updateAction={updateAction}
                returnTo={returnTo("tracking", trackingTab)}
                canEdit={canEdit}
                isAdmin={isAdmin}
                region={region}
                routeId={routeId}
                locked={!trackingUnlocked}
                lockedMessage={
                  !trackingUnlocked
                    ? "Tracking starts only after loading is done and export invoice is finalized."
                    : undefined
                }
                trackingSectionLocked={trackingSequenceLocked}
                trackingSectionLockedMessage={
                  trackingSequenceLocked
                    ? `Complete ${blockingRegionLabel} tracking before updating ${currentRegionLabel} tracking checkpoints. Customs section remains available.`
                    : undefined
                }
                syriaClearanceMode={syriaClearanceMode}
                agentGate={trackingAgentGate}
                latestDocsByType={latestDocsByType}
              />
            );
          })()}
        </div>
      ) : null}

    </div>
  );
}
