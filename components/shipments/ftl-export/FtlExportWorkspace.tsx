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
  countActiveBookedTrucks,
  getString,
  isTruthy,
  parseImportShipmentRows,
  parseLoadingRows,
  parseTruckBookingRows,
} from "@/lib/ftlExport/helpers";
import { StepEditorCard } from "./StepEditorCard";
import type { FtlDocumentMeta, FtlShipmentMeta, FtlStepData } from "./types";

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
  trackingToken: string | null;
  canEdit: boolean;
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
  trackingToken,
  canEdit,
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

  const stepByName = useMemo(
    () => new Map(steps.map((step) => [step.name, step])),
    [steps],
  );

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

  const plannedTrucks = Number(getString(planStep?.values.total_trucks_planned) || "0");
  const truckRows = parseTruckBookingRows((trucksStep?.values ?? {}) as Record<string, unknown>);
  const activeTruckStats = countActiveBookedTrucks(truckRows);
  const actualTrucks = activeTruckStats.active;
  const loadingRows = parseLoadingRows((loadingStep?.values ?? {}) as Record<string, unknown>);
  const loadingProgress = computeLoadingProgress({ truckRows, loadingRows });
  const importRows = parseImportShipmentRows((importStep?.values ?? {}) as Record<string, unknown>);
  const importWarnings = computeImportWarnings(importRows);
  const stockSummary = buildImportStockSummary(importRows);
  const importsAvailable = allReferencedImportsAvailable(importRows);
  const loadingCompleted =
    loadingProgress.expected > 0 && loadingProgress.loaded >= loadingProgress.expected;
  const canFinalizeInvoice = loadingCompleted && importsAvailable;
  const invoiceFinalized = isTruthy(invoiceStep?.values.invoice_finalized);
  const trackingLink = trackingToken ? `/track/${trackingToken}` : "";

  const baseUrl = `/shipments/ftl-export/${shipment.id}`;
  const returnTo = (nextTab: FtlMainTab, sub?: string) => {
    const params = new URLSearchParams({ tab: nextTab });
    if (nextTab === "invoice" && sub) params.set("invoice", sub);
    if (nextTab === "tracking" && sub) params.set("tracking", sub);
    return `${baseUrl}?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
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
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "plan" ? (
        planStep ? (
          <StepEditorCard
            step={planStep}
            title="Export plan overview"
            description="Order trigger, planning date, and truck plan baseline."
            canEdit={canEdit}
            latestDocsByType={latestDocsByType}
            updateAction={updateAction}
            returnTo={returnTo("plan")}
          />
        ) : (
          <MissingStep name={FTL_EXPORT_STEP_NAMES.exportPlanOverview} />
        )
      ) : null}

      {tab === "trucks" ? (
        trucksStep ? (
          <StepEditorCard
            step={trucksStep}
            title="Trucks details"
            description="Plan, book, and maintain truck cards. Keep planned vs actual variance visible."
            canEdit={canEdit}
            latestDocsByType={latestDocsByType}
            updateAction={updateAction}
            returnTo={returnTo("trucks")}
            disabled={invoiceFinalized}
            disabledMessage={
              invoiceFinalized
                ? "Truck details are locked after export invoice is finalized."
                : undefined
            }
            beforeForm={
              <div className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm md:grid-cols-3">
                <div>
                  <div className="text-xs text-zinc-500">Planned trucks</div>
                  <div className="font-semibold text-zinc-900">{plannedTrucks || 0}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Actual trucks</div>
                  <div className="font-semibold text-zinc-900">{actualTrucks}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Variance</div>
                  <div className="font-semibold text-zinc-900">{actualTrucks - (plannedTrucks || 0)}</div>
                </div>
              </div>
            }
          />
        ) : (
          <MissingStep name={FTL_EXPORT_STEP_NAMES.trucksDetails} />
        )
      ) : null}

      {tab === "loading" ? (
        loadingStep ? (
          <StepEditorCard
            step={loadingStep}
            title="Loading details"
            description="Record loading per truck with mandatory loading origin and loading evidence."
            canEdit={canEdit}
            latestDocsByType={latestDocsByType}
            updateAction={updateAction}
            returnTo={returnTo("loading")}
            beforeForm={
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
                Shipment loading status is automatically aggregated from truck-level
                <span className="font-medium"> Truck Loaded </span>
                values.
              </div>
            }
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
              <StepEditorCard
                step={importStep}
                title="Import shipment selection"
                description="Link and allocate import shipment balances for this export shipment."
                canEdit={canEdit}
                latestDocsByType={latestDocsByType}
                updateAction={updateAction}
                returnTo={returnTo("invoice", "imports")}
                beforeForm={
                  <div className="space-y-2">
                    {importWarnings.unavailable.length ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        Warning: {importWarnings.unavailable.length} reference(s) are marked not
                        processed/available.
                      </div>
                    ) : null}
                    {importWarnings.overallocation.length ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        Warning: {importWarnings.overallocation.length} allocation(s) exceed remaining
                        balance. Saving is allowed.
                      </div>
                    ) : null}
                  </div>
                }
              />
            ) : (
              <MissingStep name={FTL_EXPORT_STEP_NAMES.importShipmentSelection} />
            )
          ) : null}

          {invoiceTab === "invoice" ? (
            invoiceStep ? (
              <StepEditorCard
                step={invoiceStep}
                title="Export invoice"
                description="Invoice can be finalized only after all trucks are loaded and import references are available."
                canEdit={canEdit}
                latestDocsByType={latestDocsByType}
                updateAction={updateAction}
                returnTo={returnTo("invoice", "invoice")}
                disabled={!canFinalizeInvoice}
                disabledMessage={
                  !canFinalizeInvoice
                    ? "Invoice finalization requires loading status DONE and all referenced imports available."
                    : undefined
                }
              />
            ) : (
              <MissingStep name={FTL_EXPORT_STEP_NAMES.exportInvoice} />
            )
          ) : null}

          {invoiceTab === "stock" ? (
            stockStep ? (
              <StepEditorCard
                step={stockStep}
                title="Stock view"
                description="Consolidated import/export balance summary."
                canEdit={canEdit}
                latestDocsByType={latestDocsByType}
                updateAction={updateAction}
                returnTo={returnTo("invoice", "stock")}
                beforeForm={
                  <div className="overflow-x-auto rounded-xl border border-zinc-200">
                    <table className="min-w-full text-left text-xs">
                      <thead className="bg-zinc-50 text-zinc-600">
                        <tr>
                          <th className="px-3 py-2">Import Ref</th>
                          <th className="px-3 py-2">Imported Qty</th>
                          <th className="px-3 py-2">Imported Wt</th>
                          <th className="px-3 py-2">Exported Qty</th>
                          <th className="px-3 py-2">Exported Wt</th>
                          <th className="px-3 py-2">Remaining Qty</th>
                          <th className="px-3 py-2">Remaining Wt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stockSummary.map((row) => (
                          <tr key={row.reference} className="border-t border-zinc-200">
                            <td className="px-3 py-2 font-medium text-zinc-900">{row.reference}</td>
                            <td className="px-3 py-2 text-zinc-700">{row.importedQuantity}</td>
                            <td className="px-3 py-2 text-zinc-700">{row.importedWeight}</td>
                            <td className="px-3 py-2 text-zinc-700">{row.exportedQuantity}</td>
                            <td className="px-3 py-2 text-zinc-700">{row.exportedWeight}</td>
                            <td className="px-3 py-2 text-zinc-700">{row.remainingQuantity}</td>
                            <td className="px-3 py-2 text-zinc-700">{row.remainingWeight}</td>
                          </tr>
                        ))}
                        {stockSummary.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-3 py-3 text-zinc-500">
                              No import allocation rows yet.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                }
              />
            ) : (
              <MissingStep name={FTL_EXPORT_STEP_NAMES.stockView} />
            )
          ) : null}
        </div>
      ) : null}

      {tab === "agents" ? (
        agentsStep ? (
          <StepEditorCard
            step={agentsStep}
            title="Customs agents allocation"
            description="Allocate border clearing agents and define Naseeb clearance mode."
            canEdit={canEdit}
            latestDocsByType={latestDocsByType}
            updateAction={updateAction}
            returnTo={returnTo("agents")}
          />
        ) : (
          <MissingStep name={FTL_EXPORT_STEP_NAMES.customsAgentsAllocation} />
        )
      ) : null}

      {tab === "tracking" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-3">
            {[
              { id: "uae", label: "UAE" },
              { id: "ksa", label: "KSA" },
              { id: "jordan", label: "Jordan" },
              { id: "syria", label: "Syria" },
            ].map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTrackingTab(entry.id as FtlTrackingTab)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  trackingTab === entry.id
                    ? "bg-zinc-900 text-white"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          {trackingTab === "uae" ? (
            uaeStep ? (
              <StepEditorCard
                step={uaeStep}
                title="UAE tracking"
                description="Jebel Ali and Sila customs + movement checkpoints."
                canEdit={canEdit}
                latestDocsByType={latestDocsByType}
                updateAction={updateAction}
                returnTo={returnTo("tracking", "uae")}
              />
            ) : (
              <MissingStep name={FTL_EXPORT_STEP_NAMES.trackingUae} />
            )
          ) : null}

          {trackingTab === "ksa" ? (
            ksaStep ? (
              <StepEditorCard
                step={ksaStep}
                title="KSA tracking"
                description="Batha entry and Hadietha exit checkpoints."
                canEdit={canEdit}
                latestDocsByType={latestDocsByType}
                updateAction={updateAction}
                returnTo={returnTo("tracking", "ksa")}
              />
            ) : (
              <MissingStep name={FTL_EXPORT_STEP_NAMES.trackingKsa} />
            )
          ) : null}

          {trackingTab === "jordan" ? (
            jordanStep ? (
              <StepEditorCard
                step={jordanStep}
                title="Jordan tracking"
                description="Omari entry and Jaber exit checkpoints."
                canEdit={canEdit}
                latestDocsByType={latestDocsByType}
                updateAction={updateAction}
                returnTo={returnTo("tracking", "jordan")}
              />
            ) : (
              <MissingStep name={FTL_EXPORT_STEP_NAMES.trackingJordan} />
            )
          ) : null}

          {trackingTab === "syria" ? (
            syriaStep ? (
              <StepEditorCard
                step={syriaStep}
                title="Syria tracking"
                description="Arrival, clearance path, delivery, and offload completion."
                canEdit={canEdit}
                latestDocsByType={latestDocsByType}
                updateAction={updateAction}
                returnTo={returnTo("tracking", "syria")}
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
