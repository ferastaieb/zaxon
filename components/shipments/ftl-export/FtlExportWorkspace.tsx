"use client";

import { useMemo, useState } from "react";

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
import { TrackingStepForm } from "./forms/TrackingStepForm";
import { TrucksDetailsStepForm } from "./forms/TrucksDetailsStepForm";
import { TRACKING_REGION_FLOW } from "./forms/trackingTimelineConfig";

export type FtlMainTab =
  | "plan"
  | "trucks"
  | "loading"
  | "invoice"
  | "agents"
  | "tracking";
export type FtlInvoiceTab = "imports" | "invoice" | "stock";
export type FtlTrackingTab = "uae" | "ksa" | "jordan" | "syria";

type WorkspaceProps = {
  headingClassName?: string;
  shipment: FtlShipmentMeta;
  steps: FtlStepData[];
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
  return value === "uae" || value === "ksa" || value === "jordan" || value === "syria";
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
  const [tab, setTab] = useState<FtlMainTab>(initialTab && isMainTab(initialTab) ? initialTab : "plan");
  const [invoiceTab, setInvoiceTab] = useState<FtlInvoiceTab>(
    initialInvoiceTab && isInvoiceTab(initialInvoiceTab) ? initialInvoiceTab : "imports",
  );
  const [trackingTab, setTrackingTab] = useState<FtlTrackingTab>(
    initialTrackingTab && isTrackingTab(initialTrackingTab) ? initialTrackingTab : "uae",
  );

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

  const truckRows = parseTruckBookingRows((trucksStep?.values ?? {}) as Record<string, unknown>);
  const loadingRows = parseLoadingRows((loadingStep?.values ?? {}) as Record<string, unknown>);
  const loadingProgress = computeLoadingProgress({ truckRows, loadingRows });
  const importRows = parseImportShipmentRows((importStep?.values ?? {}) as Record<string, unknown>);
  const importWarnings = computeImportWarnings(importRows);
  const stockSummary = buildImportStockSummary(importRows);
  const importsAvailable = allReferencedImportsAvailable(importRows);
  const loadingCompleted = loadingProgress.expected > 0 && loadingProgress.loaded >= loadingProgress.expected;
  const canFinalizeInvoice = loadingCompleted && importsAvailable;
  const invoiceFinalized = isTruthy(invoiceStep?.values.invoice_finalized);
  const invoiceDone = invoiceStep?.status === "DONE";
  const agentsDone = agentsStep?.status === "DONE";
  const trackingUnlocked = loadingCompleted && invoiceDone && agentsDone;
  const trackingLink = trackingToken ? `/track/${trackingToken}` : "";
  const trackingRegionStates = TRACKING_REGION_FLOW.map((regionEntry) => {
    const step =
      regionEntry.id === "uae"
        ? uaeStep
        : regionEntry.id === "ksa"
          ? ksaStep
          : regionEntry.id === "jordan"
            ? jordanStep
            : syriaStep;
    const latestDate = latestDateValue((step?.values ?? {}) as Record<string, unknown>);
    const stalled =
      !!latestDate && step?.status !== "DONE" && daysSince(latestDate) >= 3;
    return {
      ...regionEntry,
      stepStatus: step?.status ?? "PENDING",
      stalled,
    };
  });
  const syriaClearanceMode =
    getString(agentsStep?.values.naseeb_clearance_mode).toUpperCase() === "ZAXON"
      ? "ZAXON"
      : "CLIENT";

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
      uaeStep?.status === "DONE" &&
      ksaStep?.status === "DONE" &&
      jordanStep?.status === "DONE" &&
      syriaStep?.status === "DONE",
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">FTL export workflow</div>
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

      <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        {[
          { id: "plan", label: "1. Export Plan Overview" },
          { id: "trucks", label: "2. Trucks Details" },
          { id: "loading", label: "3. Loading Details" },
          { id: "invoice", label: "4. Export Invoice & Reference" },
          { id: "agents", label: "5. Customs Agents" },
          { id: "tracking", label: "6. Shipment Tracking" },
        ].map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id as FtlMainTab)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === entry.id
                ? mainTabDone[entry.id as FtlMainTab]
                  ? "bg-emerald-200 text-emerald-900"
                  : "bg-zinc-900 text-white"
                : mainTabDone[entry.id as FtlMainTab]
                  ? "border border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                  : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {entry.label}
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
          <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-3">
            {[
              { id: "imports", label: "Import shipments" },
              { id: "invoice", label: "Export invoice" },
              { id: "stock", label: "Stock view" },
            ].map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setInvoiceTab(entry.id as FtlInvoiceTab)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  invoiceTab === entry.id
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {entry.label}
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
          />
        ) : (
          <MissingStep name={FTL_EXPORT_STEP_NAMES.customsAgentsAllocation} />
        )
      ) : null}

      {tab === "tracking" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
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

          {trackingTab === "uae" ? (
            uaeStep ? (
              <TrackingStepForm
                step={uaeStep}
                updateAction={updateAction}
                returnTo={returnTo("tracking", "uae")}
                canEdit={canEdit}
                isAdmin={isAdmin}
                region="uae"
                locked={!trackingUnlocked}
                lockedMessage={
                  !trackingUnlocked
                    ? "Tracking starts only after loading is done, invoice is finalized, and customs agents are allocated."
                    : undefined
                }
                latestDocsByType={latestDocsByType}
              />
            ) : (
              <MissingStep name={FTL_EXPORT_STEP_NAMES.trackingUae} />
            )
          ) : null}

          {trackingTab === "ksa" ? (
            ksaStep ? (
              <TrackingStepForm
                step={ksaStep}
                updateAction={updateAction}
                returnTo={returnTo("tracking", "ksa")}
                canEdit={canEdit}
                isAdmin={isAdmin}
                region="ksa"
                locked={!trackingUnlocked}
                lockedMessage={
                  !trackingUnlocked
                    ? "Tracking starts only after loading is done, invoice is finalized, and customs agents are allocated."
                    : undefined
                }
                latestDocsByType={latestDocsByType}
              />
            ) : (
              <MissingStep name={FTL_EXPORT_STEP_NAMES.trackingKsa} />
            )
          ) : null}

          {trackingTab === "jordan" ? (
            jordanStep ? (
              <TrackingStepForm
                step={jordanStep}
                updateAction={updateAction}
                returnTo={returnTo("tracking", "jordan")}
                canEdit={canEdit}
                isAdmin={isAdmin}
                region="jordan"
                locked={!trackingUnlocked}
                lockedMessage={
                  !trackingUnlocked
                    ? "Tracking starts only after loading is done, invoice is finalized, and customs agents are allocated."
                    : undefined
                }
                latestDocsByType={latestDocsByType}
              />
            ) : (
              <MissingStep name={FTL_EXPORT_STEP_NAMES.trackingJordan} />
            )
          ) : null}

          {trackingTab === "syria" ? (
            syriaStep ? (
              <TrackingStepForm
                step={syriaStep}
                updateAction={updateAction}
                returnTo={returnTo("tracking", "syria")}
                canEdit={canEdit}
                isAdmin={isAdmin}
                region="syria"
                locked={!trackingUnlocked}
                lockedMessage={
                  !trackingUnlocked
                    ? "Tracking starts only after loading is done, invoice is finalized, and customs agents are allocated."
                    : undefined
                }
                syriaClearanceMode={syriaClearanceMode}
                latestDocsByType={latestDocsByType}
              />
            ) : (
              <MissingStep name={FTL_EXPORT_STEP_NAMES.trackingSyria} />
            )
          ) : null}
        </div>
      ) : null}

    </div>
  );
}
