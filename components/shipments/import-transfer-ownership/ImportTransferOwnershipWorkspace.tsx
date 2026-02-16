"use client";

import { useMemo, useState } from "react";

import { AppIcon } from "@/components/ui/AppIcon";
import { Badge } from "@/components/ui/Badge";
import {
  overallStatusLabel,
  riskLabel,
  type ShipmentOverallStatus,
  type ShipmentRisk,
} from "@/lib/domain";
import { IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES } from "@/lib/importTransferOwnership/constants";
import { computeImportTransferOwnershipStatuses } from "@/lib/importTransferOwnership/status";
import { CollectionOutcomeStepForm } from "./forms/CollectionOutcomeStepForm";
import { DocumentsBoeStepForm } from "./forms/DocumentsBoeStepForm";
import { OverviewStepForm } from "./forms/OverviewStepForm";
import { PartiesCargoStepForm } from "./forms/PartiesCargoStepForm";
import { StockViewStepForm } from "./forms/StockViewStepForm";
import type {
  ImportTransferDocumentMeta,
  ImportTransferShipmentMeta,
  ImportTransferStepData,
  ImportTransferStockSummary,
} from "./types";

export type ImportTransferTab =
  | "overview"
  | "parties-cargo"
  | "documents-boe"
  | "collection-outcome"
  | "stock-view";

type Props = {
  headingClassName?: string;
  shipment: ImportTransferShipmentMeta;
  steps: ImportTransferStepData[];
  latestDocsByType: Record<string, ImportTransferDocumentMeta>;
  canEdit: boolean;
  isAdmin: boolean;
  updateAction: (formData: FormData) => void;
  stockSummary: ImportTransferStockSummary;
  initialTab?: ImportTransferTab;
};

function riskTone(risk: ShipmentRisk) {
  if (risk === "BLOCKED") return "red";
  if (risk === "AT_RISK") return "yellow";
  return "green";
}

function isMainTab(value: string | undefined): value is ImportTransferTab {
  return (
    value === "overview" ||
    value === "parties-cargo" ||
    value === "documents-boe" ||
    value === "collection-outcome" ||
    value === "stock-view"
  );
}

function MissingStep({ name }: { name: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Step not found in this shipment: {name}
    </div>
  );
}

export function ImportTransferOwnershipWorkspace({
  headingClassName = "",
  shipment,
  steps,
  latestDocsByType,
  canEdit,
  isAdmin,
  updateAction,
  stockSummary,
  initialTab,
}: Props) {
  const [tab, setTab] = useState<ImportTransferTab>(
    initialTab && isMainTab(initialTab) ? initialTab : "overview",
  );

  const stepByName = useMemo(() => new Map(steps.map((step) => [step.name, step])), [steps]);
  const overviewStep = stepByName.get(IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.overview);
  const partiesStep = stepByName.get(IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.partiesCargo);
  const documentsStep = stepByName.get(IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.documentsBoe);
  const collectionStep = stepByName.get(
    IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.collectionOutcome,
  );
  const stockStep = stepByName.get(IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.stockView);

  const computed = useMemo(() => {
    const stepsByName: Record<string, { id: number; values: Record<string, unknown> } | undefined> =
      {};
    for (const currentStep of steps) {
      stepsByName[currentStep.name] = {
        id: currentStep.id,
        values: (currentStep.values ?? {}) as Record<string, unknown>,
      };
    }
    return computeImportTransferOwnershipStatuses({
      stepsByName,
      docTypes: new Set(Object.keys(latestDocsByType)),
    });
  }, [steps, latestDocsByType]);

  const summary: ImportTransferStockSummary = {
    ...stockSummary,
    stockType: computed.stockType,
    importedQuantity: stockSummary.importedQuantity || computed.importedQuantity,
    importedWeight: stockSummary.importedWeight || computed.importedWeight,
    remainingQuantity:
      (stockSummary.importedQuantity || computed.importedQuantity) -
      stockSummary.exportedQuantity,
    remainingWeight:
      (stockSummary.importedWeight || computed.importedWeight) -
      stockSummary.exportedWeight,
  };

  const baseUrl = `/shipments/import-transfer-ownership/${shipment.id}`;
  const returnTo = (nextTab: ImportTransferTab) => `${baseUrl}?tab=${nextTab}`;

  const tabDone: Record<ImportTransferTab, boolean> = {
    overview: overviewStep?.status === "DONE",
    "parties-cargo": partiesStep?.status === "DONE",
    "documents-boe": documentsStep?.status === "DONE",
    "collection-outcome": collectionStep?.status === "DONE",
    "stock-view": stockStep?.status === "DONE",
  };

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-500">
          <AppIcon name="icon-shipment-create" size={22} />
          Import transfer of ownership
        </div>
        <h1 className={`${headingClassName} mt-2 text-2xl font-semibold text-zinc-900`}>
          {shipment.shipment_code}
        </h1>
        <div className="mt-1 text-sm text-zinc-600">
          {shipment.origin} to {shipment.destination}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="zinc">
            {overallStatusLabel(shipment.overall_status as ShipmentOverallStatus)}
          </Badge>
          <Badge tone={riskTone(shipment.risk as ShipmentRisk)}>
            {riskLabel(shipment.risk as ShipmentRisk)}
          </Badge>
          <Badge
            tone={
              computed.stockType === "WAREHOUSE_STOCK"
                ? "green"
                : computed.stockType === "OWNERSHIP_STOCK"
                  ? "blue"
                  : "yellow"
            }
          >
            {computed.stockType === "WAREHOUSE_STOCK"
              ? "Warehouse stock"
              : computed.stockType === "OWNERSHIP_STOCK"
                ? "Ownership stock"
                : "Stock pending"}
          </Badge>
        </div>
        {computed.pendingCollectionReasonMissing ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Pending collection reason is required while cargo is not yet delivered to Zaxon warehouse.
          </div>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
        {[
          { id: "overview", label: "1. Overview", icon: "icon-order-received" as const },
          { id: "parties-cargo", label: "2. Parties and Cargo", icon: "icon-client-single" as const },
          { id: "documents-boe", label: "3. Documents and BOE", icon: "icon-doc-required" as const },
          { id: "collection-outcome", label: "4. Collection and Outcome", icon: "icon-calendar-trigger" as const },
          { id: "stock-view", label: "5. Stock View", icon: "icon-stock" as const },
        ].map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id as ImportTransferTab)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${
              tab === entry.id
                ? tabDone[entry.id as ImportTransferTab]
                  ? "bg-emerald-200 text-emerald-900"
                  : "bg-zinc-900 text-white"
                : tabDone[entry.id as ImportTransferTab]
                  ? "border border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                  : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <AppIcon
                name={entry.icon}
                size={20}
                className={
                  tab === entry.id
                    ? tabDone[entry.id as ImportTransferTab]
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

      {tab === "overview" ? (
        overviewStep ? (
          <OverviewStepForm
            step={overviewStep}
            updateAction={updateAction}
            returnTo={returnTo("overview")}
            canEdit={canEdit}
            isAdmin={isAdmin}
          />
        ) : (
          <MissingStep name={IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.overview} />
        )
      ) : null}

      {tab === "parties-cargo" ? (
        partiesStep ? (
          <PartiesCargoStepForm
            step={partiesStep}
            updateAction={updateAction}
            returnTo={returnTo("parties-cargo")}
            canEdit={canEdit}
            isAdmin={isAdmin}
          />
        ) : (
          <MissingStep name={IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.partiesCargo} />
        )
      ) : null}

      {tab === "documents-boe" ? (
        documentsStep ? (
          <DocumentsBoeStepForm
            step={documentsStep}
            latestDocsByType={latestDocsByType}
            updateAction={updateAction}
            returnTo={returnTo("documents-boe")}
            canEdit={canEdit}
            isAdmin={isAdmin}
          />
        ) : (
          <MissingStep name={IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.documentsBoe} />
        )
      ) : null}

      {tab === "collection-outcome" ? (
        collectionStep ? (
          <CollectionOutcomeStepForm
            step={collectionStep}
            updateAction={updateAction}
            returnTo={returnTo("collection-outcome")}
            canEdit={canEdit}
            isAdmin={isAdmin}
            boeDone={computed.boeDone}
          />
        ) : (
          <MissingStep name={IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.collectionOutcome} />
        )
      ) : null}

      {tab === "stock-view" ? (
        stockStep ? (
          <StockViewStepForm
            step={stockStep}
            updateAction={updateAction}
            returnTo={returnTo("stock-view")}
            canEdit={canEdit}
            isAdmin={isAdmin}
            summary={summary}
          />
        ) : (
          <MissingStep name={IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.stockView} />
        )
      ) : null}
    </div>
  );
}
