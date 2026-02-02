
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Badge } from "@/components/ui/Badge";
import { CopyField } from "@/components/ui/CopyField";
import {
  overallStatusLabel,
  riskLabel,
  stepStatusLabel,
  type ShipmentOverallStatus,
  type ShipmentRisk,
  type StepStatus,
} from "@/lib/domain";
import { FCL_IMPORT_STEP_NAMES } from "@/lib/fclImport/constants";
import { isTruthy, normalizeContainerRows } from "@/lib/fclImport/helpers";
import { encodeFieldPath, fieldInputName, stepFieldDocType } from "@/lib/stepFields";
import { CanvasBackdrop } from "./CanvasBackdrop";

type StepData = {
  id: number;
  name: string;
  status: StepStatus;
  notes: string | null;
  values: Record<string, unknown>;
};

type JobIdRow = {
  id: number;
  job_id: string;
};

type PartyRow = {
  id: number;
  name: string;
};

type DocumentMeta = {
  id: number;
  file_name: string;
  uploaded_at: string;
};

type ShipmentMeta = {
  id: number;
  shipment_code: string;
  origin: string;
  destination: string;
  overall_status: ShipmentOverallStatus;
  risk: ShipmentRisk;
};

type WorkspaceMode = "full" | "tracking" | "operations" | "container-ops";

type WorkspaceProps = {
  headingClassName: string;
  shipment: ShipmentMeta;
  customers: PartyRow[];
  steps: StepData[];
  jobIds: JobIdRow[];
  containerNumbers: string[];
  latestDocsByType: Record<string, DocumentMeta>;
  trackingToken: string | null;
  canEdit: boolean;
  updateAction: (formData: FormData) => void;
  requestDocumentAction?: (formData: FormData) => void;
  mode?: WorkspaceMode;
  returnTo?: string;
};

type ToggleMap = Record<number, boolean>;

function statusTone(status: StepStatus) {
  if (status === "DONE") return "green";
  if (status === "IN_PROGRESS") return "blue";
  if (status === "BLOCKED") return "red";
  return "zinc";
}

function daysUntil(dateRaw: string | undefined) {
  if (!dateRaw) return null;
  const date = new Date(dateRaw);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function valueString(values: Record<string, unknown>, key: string) {
  const value = values[key];
  return typeof value === "string" ? value : "";
}

function buildDocKey(stepId: number, path: string[]) {
  return stepFieldDocType(stepId, encodeFieldPath(path));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function appendQueryParam(url: string, key: string, value: string) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function hasAnyValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some((entry) => hasAnyValue(entry));
  if (isPlainObject(value)) {
    return Object.values(value).some((entry) => hasAnyValue(entry));
  }
  return false;
}

function SubmitButton({
  label,
  pendingLabel,
  disabled,
  className,
}: {
  label: string;
  pendingLabel?: string;
  disabled?: boolean;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className={className}>
      {pending ? pendingLabel ?? "Saving..." : label}
    </button>
  );
}

function StepCard({
  id,
  title,
  status,
  description,
  children,
  footer,
}: {
  id: string;
  title: string;
  status: StepStatus;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      id={id}
      className={`rounded-3xl border border-slate-200 p-5 shadow-sm backdrop-blur ${status === "DONE" ? "bg-amber-50/60" : "bg-white/80"
        }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Step
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">{title}</h3>
          {description ? (
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          ) : null}
        </div>
        <Badge tone={statusTone(status)}>{stepStatusLabel(status)}</Badge>
      </div>
      <div className="mt-4">{children}</div>
      {footer ? <div className="mt-4">{footer}</div> : null}
    </div>
  );
}

export function FclImportWorkspace({
  headingClassName,
  shipment,
  customers,
  steps,
  jobIds,
  containerNumbers,
  latestDocsByType,
  trackingToken,
  canEdit,
  updateAction,
  requestDocumentAction,
  mode = "full",
  returnTo,
}: WorkspaceProps) {
  const [showPalette, setShowPalette] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const trackingLink = trackingToken ? `/track/fcl/${trackingToken}` : "";
  const showOverview = mode === "full";
  const showTracking = mode === "full" || mode === "tracking";
  const showOperations = mode === "full" || mode === "operations";
  const showContainerOps = mode === "full" || mode === "container-ops";
  const isFull = mode === "full";
  const renderReturnTo = () =>
    returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null;
  const renderFileMeta = (stepId: number, path: string[]) => {
    const doc = getLatestDoc(stepId, path);
    const docType = buildDocKey(stepId, path);
    const requestReturnTo = returnTo
      ? appendQueryParam(returnTo, "requested", "1")
      : "";
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {doc ? (
          <a
            href={`/api/documents/${doc.id}`}
            className="font-medium text-slate-700 hover:underline"
          >
            Download latest
          </a>
        ) : (
          <span>No file uploaded yet.</span>
        )}
        {requestDocumentAction ? (
          <form action={requestDocumentAction} className="inline">
            <input type="hidden" name="documentType" value={docType} />
            {requestReturnTo ? (
              <input type="hidden" name="returnTo" value={requestReturnTo} />
            ) : null}
            <button
              type="submit"
              disabled={!canEdit}
              className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
            >
              Request from customer
            </button>
          </form>
        ) : null}
      </div>
    );
  };

  useEffect(() => {
    if (mode !== "full") return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (isTyping) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShowPalette((prev) => !prev);
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setShowShortcuts((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode]);

  const stepsByName = useMemo(() => {
    const map = new Map<string, StepData>();
    steps.forEach((step) => map.set(step.name, step));
    return map;
  }, [steps]);

  const customerLabel = customers.length
    ? customers.map((customer) => customer.name).join(", ")
    : "Customer";

  const vesselStep = stepsByName.get(FCL_IMPORT_STEP_NAMES.vesselTracking);
  const dischargeStep = stepsByName.get(FCL_IMPORT_STEP_NAMES.containersDischarge);
  const pullOutStep = stepsByName.get(FCL_IMPORT_STEP_NAMES.containerPullOut);
  const deliveryStep = stepsByName.get(FCL_IMPORT_STEP_NAMES.containerDelivery);
  const orderStep = stepsByName.get(FCL_IMPORT_STEP_NAMES.orderReceived);
  const blStep = stepsByName.get(FCL_IMPORT_STEP_NAMES.billOfLading);
  const invoiceStep = stepsByName.get(FCL_IMPORT_STEP_NAMES.commercialInvoice);
  const deliveryOrderStep = stepsByName.get(FCL_IMPORT_STEP_NAMES.deliveryOrder);
  const boeStep = stepsByName.get(FCL_IMPORT_STEP_NAMES.billOfEntry);
  const tokenStep = stepsByName.get(FCL_IMPORT_STEP_NAMES.tokenBooking);
  const returnTokenStep = stepsByName.get(FCL_IMPORT_STEP_NAMES.returnTokenBooking);

  const dischargeRows = useMemo(
    () => normalizeContainerRows(containerNumbers, dischargeStep?.values ?? {}),
    [containerNumbers, dischargeStep],
  );
  const pullOutRows = useMemo(
    () => normalizeContainerRows(containerNumbers, pullOutStep?.values ?? {}),
    [containerNumbers, pullOutStep],
  );
  const deliveryRows = useMemo(
    () => normalizeContainerRows(containerNumbers, deliveryStep?.values ?? {}),
    [containerNumbers, deliveryStep],
  );
  const tokenRows = useMemo(
    () => normalizeContainerRows(containerNumbers, tokenStep?.values ?? {}),
    [containerNumbers, tokenStep],
  );
  const returnTokenRows = useMemo(
    () => normalizeContainerRows(containerNumbers, returnTokenStep?.values ?? {}),
    [containerNumbers, returnTokenStep],
  );

  const dischargedFlags = dischargeRows.map(
    (row) => isTruthy(row.container_discharged) || !!row.container_discharged_date?.trim(),
  );
  const pulledOutFlags = pullOutRows.map(
    (row) => isTruthy(row.pulled_out) || !!row.pull_out_date?.trim(),
  );
  const deliveredFlags = deliveryRows.map(
    (row) =>
      isTruthy(row.delivered_offloaded) || !!row.delivered_offloaded_date?.trim(),
  );
  const returnedFlags = deliveryRows.map(
    (row) => isTruthy(row.empty_returned) || !!row.empty_returned_date?.trim(),
  );

  const totalContainers = containerNumbers.length;
  const dischargedCount = dischargedFlags.filter(Boolean).length;
  const pulledOutCount = pulledOutFlags.filter(Boolean).length;
  const deliveredCount = deliveredFlags.filter(Boolean).length;
  const returnedCount = returnedFlags.filter(Boolean).length;

  const boeDone = boeStep?.status === "DONE";
  const blDone = blStep?.status === "DONE";
  const invoiceDone = invoiceStep?.status === "DONE";
  const deliveryOrderDone = deliveryOrderStep?.status === "DONE";
  const allReturned = totalContainers > 0 && returnedCount === totalContainers;

  const vesselEta = valueString(vesselStep?.values ?? {}, "eta");
  const vesselAta = valueString(vesselStep?.values ?? {}, "ata");
  const vesselLabel = vesselAta
    ? "Vessel arrived"
    : vesselEta
      ? "Vessel sailing"
      : "ETA pending";

  const actions = [
    { id: "overview", label: "Overview", target: "overview" },
    { id: "tracking", label: "Tracking", target: "tracking" },
    { id: "operations", label: "Operations", target: "operations" },
    { id: "container-ops", label: "Containers", target: "container-ops" },
  ];

  const [dischargeToggles, setDischargeToggles] = useState<ToggleMap>(() =>
    Object.fromEntries(dischargedFlags.map((value, index) => [index, value])),
  );
  const [pullOutToggles, setPullOutToggles] = useState<ToggleMap>(() =>
    Object.fromEntries(pulledOutFlags.map((value, index) => [index, value])),
  );
  const [deliveryToggles, setDeliveryToggles] = useState<ToggleMap>(() =>
    Object.fromEntries(deliveredFlags.map((value, index) => [index, value])),
  );
  const [returnToggles, setReturnToggles] = useState<ToggleMap>(() =>
    Object.fromEntries(returnedFlags.map((value, index) => [index, value])),
  );
  const [orderReceived, setOrderReceived] = useState(
    isTruthy(orderStep?.values?.order_received),
  );

  const blValues = (blStep?.values ?? {}) as Record<string, unknown>;
  const blChoice = (blValues.bl_type ?? {}) as Record<string, unknown>;
  const originalValues = (blChoice.original ?? {}) as Record<string, unknown>;
  const telexValues = (blChoice.telex ?? {}) as Record<string, unknown>;
  const initialType = hasAnyValue(telexValues)
    ? "telex"
    : hasAnyValue(originalValues)
      ? "original"
      : "telex";
  const [blType, setBlType] = useState(initialType);
  const [blCopyChecked, setBlCopyChecked] = useState(
    isTruthy(originalValues.bl_copy),
  );
  const [telexChecks, setTelexChecks] = useState<Record<string, boolean>>({
    telex_copy_not_released: isTruthy(telexValues.telex_copy_not_released),
    telex_copy_released: isTruthy(telexValues.telex_copy_released),
  });
  const [originalReceived, setOriginalReceived] = useState(
    isTruthy(originalValues.original_received),
  );
  const [originalSurrendered, setOriginalSurrendered] = useState(
    isTruthy(originalValues.original_surrendered),
  );

  const invoiceValues = (invoiceStep?.values ?? {}) as Record<string, unknown>;
  const [copyInvoice, setCopyInvoice] = useState(
    isTruthy(invoiceValues.copy_invoice_received),
  );
  const [originalInvoice, setOriginalInvoice] = useState(
    isTruthy(invoiceValues.original_invoice_received),
  );
  const initialOtherDocs = (() => {
    const raw = invoiceValues.other_documents;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(isPlainObject)
      .map((entry) => ({
        document_name:
          typeof entry.document_name === "string" ? entry.document_name : "",
      }));
  })();
  const [otherDocs, setOtherDocs] = useState(() =>
    initialOtherDocs.length ? initialOtherDocs : [],
  );

  const deliveryValues = (deliveryOrderStep?.values ?? {}) as Record<string, unknown>;
  const [deliveryObtained, setDeliveryObtained] = useState(
    isTruthy(deliveryValues.delivery_order_obtained),
  );

  const isDeliveryValidSoon = (() => {
    const validity = valueString(deliveryValues, "delivery_order_validity");
    const remaining = daysUntil(validity);
    if (remaining === null) return false;
    return remaining <= 2 && !allReturned;
  })();

  const boeValues = (boeStep?.values ?? {}) as Record<string, unknown>;
  const boeDate = valueString(boeValues, "boe_date");

  const messageDaysLeft = (() => {
    if (!boeDate) return null;
    const boe = new Date(boeDate);
    if (Number.isNaN(boe.getTime())) return null;
    const deadline = new Date(boe.getTime() + 20 * 24 * 60 * 60 * 1000);
    const remaining = daysUntil(deadline.toISOString());
    return remaining;
  })();

  const addOtherDoc = () => {
    setOtherDocs((prev) => [...prev, { document_name: "" }]);
  };

  const getLatestDoc = (stepId: number, path: string[]) => {
    const key = buildDocKey(stepId, path);
    return latestDocsByType[key];
  };

  return (
    <div className={isFull ? "relative overflow-hidden bg-slate-50" : "relative"}>
      {isFull ? (
        <CanvasBackdrop className="absolute inset-0 -z-10 h-full w-full opacity-50" />
      ) : null}

      <div
        className={
          isFull
            ? "mx-auto max-w-[1400px] px-6 pb-16 pt-10"
            : "mx-auto max-w-6xl"
        }
      >
        {isFull ? (
          <header className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Clearance workspace
              </div>
              <h1
                className={`${headingClassName} mt-2 text-3xl font-semibold text-slate-900`}
              >
                {shipment.shipment_code}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  {customerLabel}
                </span>
                <span>Origin: {shipment.origin}</span>
                <span>Destination: {shipment.destination}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="zinc">
                {overallStatusLabel(shipment.overall_status)}
              </Badge>
              <Badge tone="blue">{riskLabel(shipment.risk)}</Badge>
              <Link
                href="/shipments"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                Back
              </Link>
            </div>
          </header>
        ) : null}

        <div
          className={
            isFull
              ? "mt-8 grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] transition-all duration-700"
              : "mt-4"
          }
        >
          {isFull ? (
            <aside className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Jump to
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  {actions.map((action) => (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() =>
                        document
                          .getElementById(action.target)
                          ?.scrollIntoView({ behavior: "smooth", block: "start" })
                      }
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <span>{action.label}</span>
                      <span className="text-xs text-slate-400">Go</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Container stats
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between">
                    <span>Total</span>
                    <span className="font-semibold">{totalContainers}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Discharged</span>
                    <span className="font-semibold">
                      {dischargedCount}/{totalContainers || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Pulled out</span>
                    <span className="font-semibold">
                      {pulledOutCount}/{totalContainers || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Delivered</span>
                    <span className="font-semibold">
                      {deliveredCount}/{totalContainers || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Returned</span>
                    <span className="font-semibold">
                      {returnedCount}/{totalContainers || 0}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600 shadow-sm backdrop-blur">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Shortcuts
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span>Command palette</span>
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
                      Ctrl + K
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Show help</span>
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
                      ?
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          ) : null}

          <main className={isFull ? "space-y-8" : "space-y-6"}>
            {showOverview ? (
              <section id="overview" className="space-y-6">
              <StepCard
                id="overview-card"
                title="Overview"
                status="IN_PROGRESS"
                description="Snapshot of shipment essentials and live links."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Job numbers
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      {jobIds.length ? (
                        jobIds.map((job) => (
                          <div
                            key={job.id}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                          >
                            {job.job_id}
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-500">No job numbers yet.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Tracking link
                    </div>
                    <div className="mt-3 text-sm text-slate-700">
                      {trackingToken ? (
                        <CopyField value={trackingLink} />
                      ) : (
                        <div className="text-slate-500">
                          Tracking token not generated yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </StepCard>
              </section>
            ) : null}

            {showTracking ? (
              <section id="tracking" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className={`${headingClassName} text-2xl font-semibold text-slate-900`}>
                  Tracking
                </h2>
                <span className="text-sm text-slate-500">
                  Client-visible milestones
                </span>
              </div>

              {vesselStep ? (
                <form action={updateAction} encType="multipart/form-data" className="space-y-3">
                  <input type="hidden" name="stepId" value={vesselStep.id} />
                  {renderReturnTo()}
                  <StepCard
                    id="vessel-tracking"
                    title="Vessel tracking"
                    status={vesselStep.status}
                    description={`Status: ${vesselLabel}`}
                    footer={
                      <div className="flex items-center justify-between">
                        <SubmitButton
                          label="Save update"
                          disabled={!canEdit}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        />
                        <span className="text-xs text-slate-500">
                          ETA shows until ATA is confirmed.
                        </span>
                      </div>
                    }
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-slate-600">
                          Estimated time of arrival
                        </div>
                        <input
                          type="date"
                          name={fieldInputName(["eta"])}
                          defaultValue={vesselEta}
                          disabled={!canEdit}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                        />
                      </label>
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-slate-600">
                          Actual time of arrival
                        </div>
                        <input
                          type="date"
                          name={fieldInputName(["ata"])}
                          defaultValue={vesselAta}
                          disabled={!canEdit}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                        />
                      </label>
                    </div>
                  </StepCard>
                </form>
              ) : null}
              {dischargeStep ? (
                <form action={updateAction} encType="multipart/form-data" className="space-y-3">
                  <input type="hidden" name="stepId" value={dischargeStep.id} />
                  {renderReturnTo()}
                  <StepCard
                    id="containers-discharge"
                    title="Containers discharge"
                    status={dischargeStep.status}
                    description="Confirm discharge dates and last port free day for each container."
                    footer={
                      <div className="flex items-center justify-between">
                        <SubmitButton
                          label="Save discharge"
                          disabled={!canEdit}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        />
                        <span className="text-xs text-slate-500">
                          {dischargedCount}/{totalContainers || 0} discharged
                        </span>
                      </div>
                    }
                  >
                    <div className="space-y-3">
                      {dischargeRows.map((row, index) => {
                        const toggle = dischargeToggles[index] ?? false;
                        const lastPortDay = row.last_port_free_day ?? "";
                        const lastPortRemaining = daysUntil(lastPortDay);
                        const stopCountdown = pullOutRows[index]?.pull_out_date?.trim();

                        return (
                          <div
                            key={`discharge-${row.container_number}-${index}`}
                            className="rounded-2xl border border-slate-200 bg-white p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-xs text-slate-500">
                                  Container
                                </div>
                                <div className="text-sm font-semibold text-slate-900">
                                  {row.container_number || `#${index + 1}`}
                                </div>
                              </div>
                              <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="hidden"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "container_discharged",
                                  ])}
                                  value=""
                                />
                                <input
                                  type="checkbox"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "container_discharged",
                                  ])}
                                  value="1"
                                  defaultChecked={toggle}
                                  onChange={(event) =>
                                    setDischargeToggles((prev) => ({
                                      ...prev,
                                      [index]: event.target.checked,
                                    }))
                                  }
                                  disabled={!canEdit}
                                  className="h-4 w-4 rounded border-slate-300"
                                />
                                Discharged
                              </label>
                            </div>

                            <input
                              type="hidden"
                              name={fieldInputName([
                                "containers",
                                String(index),
                                "container_number",
                              ])}
                              value={row.container_number}
                            />

                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <label className="block">
                                <div className="mb-1 text-xs font-medium text-slate-600">
                                  Discharged date
                                </div>
                                <input
                                  type="hidden"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "container_discharged_date",
                                  ])}
                                  value=""
                                />
                                <input
                                  type="date"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "container_discharged_date",
                                  ])}
                                  defaultValue={row.container_discharged_date ?? ""}
                                  disabled={!canEdit || !toggle}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                                />
                              </label>
                              <label className="block">
                                <div className="mb-1 text-xs font-medium text-slate-600">
                                  Last port free day
                                </div>
                                <input
                                  type="hidden"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "last_port_free_day",
                                  ])}
                                  value=""
                                />
                                <input
                                  type="date"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "last_port_free_day",
                                  ])}
                                  defaultValue={row.last_port_free_day ?? ""}
                                  disabled={!canEdit || !toggle}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                                />
                              </label>
                            </div>

                            <div className="mt-3 text-xs text-slate-500">
                              {stopCountdown
                                ? "Countdown stopped after pull-out."
                                : lastPortRemaining === null
                                  ? "Set last port free day to start countdown."
                                  : lastPortRemaining < 0
                                    ? `Overdue by ${Math.abs(lastPortRemaining)} days.`
                                    : `${lastPortRemaining} days remaining.`}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </StepCard>
                </form>
              ) : null}

              {pullOutStep ? (
                <form action={updateAction} encType="multipart/form-data" className="space-y-3">
                  <input type="hidden" name="stepId" value={pullOutStep.id} />
                  {renderReturnTo()}
                  <StepCard
                    id="container-pull-out"
                    title="Container pull-out from port"
                    status={pullOutStep.status}
                    description="Pull-out is available only for discharged containers after BOE is done."
                    footer={
                      <div className="flex items-center justify-between">
                        <SubmitButton
                          label="Save pull-out"
                          disabled={!canEdit}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        />
                        <span className="text-xs text-slate-500">
                          BOE status: {boeDone ? "Done" : "Pending"}
                        </span>
                      </div>
                    }
                  >
                    <div className="space-y-3">
                      {pullOutRows.map((row, index) => {
                        const discharged = dischargedFlags[index];
                        const eligible = boeDone && discharged;
                        const toggle = pullOutToggles[index] ?? false;

                        return (
                          <div
                            key={`pullout-${row.container_number}-${index}`}
                            className="rounded-2xl border border-slate-200 bg-white p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-xs text-slate-500">
                                  Container
                                </div>
                                <div className="text-sm font-semibold text-slate-900">
                                  {row.container_number || `#${index + 1}`}
                                </div>
                              </div>
                              <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="hidden"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "pulled_out",
                                  ])}
                                  value=""
                                />
                                <input
                                  type="checkbox"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "pulled_out",
                                  ])}
                                  value="1"
                                  defaultChecked={toggle}
                                  onChange={(event) =>
                                    setPullOutToggles((prev) => ({
                                      ...prev,
                                      [index]: event.target.checked,
                                    }))
                                  }
                                  disabled={!canEdit || !eligible}
                                  className="h-4 w-4 rounded border-slate-300"
                                />
                                Pulled out
                              </label>
                            </div>

                            <input
                              type="hidden"
                              name={fieldInputName([
                                "containers",
                                String(index),
                                "container_number",
                              ])}
                              value={row.container_number}
                            />

                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <label className="block">
                                <div className="mb-1 text-xs font-medium text-slate-600">
                                  Pull-out date
                                </div>
                                <input
                                  type="hidden"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "pull_out_date",
                                  ])}
                                  value=""
                                />
                                <input
                                  type="date"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "pull_out_date",
                                  ])}
                                  defaultValue={row.pull_out_date ?? ""}
                                  disabled={!canEdit || !eligible || !toggle}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                                />
                              </label>
                              <label className="block">
                                <div className="mb-1 text-xs font-medium text-slate-600">
                                  Destination
                                </div>
                                <input
                                  type="hidden"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "pull_out_destination",
                                  ])}
                                  value=""
                                />
                                <input
                                  type="text"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "pull_out_destination",
                                  ])}
                                  defaultValue={row.pull_out_destination ?? ""}
                                  disabled={!canEdit || !eligible || !toggle}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                                  placeholder="Warehouse or yard"
                                />
                              </label>
                            </div>
                            {!eligible ? (
                              <div className="mt-2 text-xs text-slate-500">
                                Waiting for discharge and BOE clearance.
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </StepCard>
                </form>
              ) : null}

              {deliveryStep ? (
                <form action={updateAction} encType="multipart/form-data" className="space-y-3">
                  <input type="hidden" name="stepId" value={deliveryStep.id} />
                  {renderReturnTo()}
                  <StepCard
                    id="container-delivery"
                    title="Container delivered or offloaded"
                    status={deliveryStep.status}
                    description="Mark delivered, offloaded, and empty return details."
                    footer={
                      <div className="flex items-center justify-between">
                        <SubmitButton
                          label="Save delivery"
                          disabled={!canEdit}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        />
                        <span className="text-xs text-slate-500">
                          {deliveredCount}/{totalContainers || 0} delivered or offloaded
                        </span>
                      </div>
                    }
                  >
                    <div className="space-y-3">
                      {deliveryRows.map((row, index) => {
                        const delivered = deliveryToggles[index] ?? false;
                        const returned = returnToggles[index] ?? false;

                        return (
                          <div
                            key={`delivery-${row.container_number}-${index}`}
                            className="rounded-2xl border border-slate-200 bg-white p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <div className="text-xs text-slate-500">
                                  Container
                                </div>
                                <div className="text-sm font-semibold text-slate-900">
                                  {row.container_number || `#${index + 1}`}
                                </div>
                              </div>
                              <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="hidden"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "delivered_offloaded",
                                  ])}
                                  value=""
                                />
                                <input
                                  type="checkbox"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "delivered_offloaded",
                                  ])}
                                  value="1"
                                  defaultChecked={delivered}
                                  onChange={(event) =>
                                    setDeliveryToggles((prev) => ({
                                      ...prev,
                                      [index]: event.target.checked,
                                    }))
                                  }
                                  disabled={!canEdit}
                                  className="h-4 w-4 rounded border-slate-300"
                                />
                                Delivered or offloaded
                              </label>
                            </div>

                            <input
                              type="hidden"
                              name={fieldInputName([
                                "containers",
                                String(index),
                                "container_number",
                              ])}
                              value={row.container_number}
                            />

                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <label className="block">
                                <div className="mb-1 text-xs font-medium text-slate-600">
                                  Offload / delivery date
                                </div>
                                <input
                                  type="hidden"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "delivered_offloaded_date",
                                  ])}
                                  value=""
                                />
                                <input
                                  type="date"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "delivered_offloaded_date",
                                  ])}
                                  defaultValue={row.delivered_offloaded_date ?? ""}
                                  disabled={!canEdit || !delivered}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                                />
                              </label>
                              <label className="block">
                                <div className="mb-1 text-xs font-medium text-slate-600">
                                  Offload location
                                </div>
                                <input
                                  type="hidden"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "offload_location",
                                  ])}
                                  value=""
                                />
                                <input
                                  type="text"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "offload_location",
                                  ])}
                                  defaultValue={row.offload_location ?? ""}
                                  disabled={!canEdit || !delivered}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                                  placeholder="Warehouse or yard"
                                />
                              </label>
                            </div>

                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="hidden"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "empty_returned",
                                  ])}
                                  value=""
                                />
                                <input
                                  type="checkbox"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "empty_returned",
                                  ])}
                                  value="1"
                                  defaultChecked={returned}
                                  onChange={(event) =>
                                    setReturnToggles((prev) => ({
                                      ...prev,
                                      [index]: event.target.checked,
                                    }))
                                  }
                                  disabled={!canEdit}
                                  className="h-4 w-4 rounded border-slate-300"
                                />
                                Empty container returned to port
                              </label>
                              <label className="block">
                                <div className="mb-1 text-xs font-medium text-slate-600">
                                  Empty return date
                                </div>
                                <input
                                  type="hidden"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "empty_returned_date",
                                  ])}
                                  value=""
                                />
                                <input
                                  type="date"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "empty_returned_date",
                                  ])}
                                  defaultValue={row.empty_returned_date ?? ""}
                                  disabled={!canEdit || !returned}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </StepCard>
                </form>
              ) : null}
              </section>
            ) : null}
            {showOperations ? (
              <section id="operations" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className={`${headingClassName} text-2xl font-semibold text-slate-900`}>
                  Operations
                </h2>
                <span className="text-sm text-slate-500">
                  Internal clearance progress
                </span>
              </div>

              {orderStep ? (
                <form action={updateAction} encType="multipart/form-data" className="space-y-3">
                  <input type="hidden" name="stepId" value={orderStep.id} />
                  {renderReturnTo()}
                  <StepCard
                    id="order-received"
                    title="Order received"
                    status={orderStep.status}
                    description="Confirm order receipt and attach the customer file if needed."
                    footer={
                      <div className="flex items-center justify-between">
                        <SubmitButton
                          label="Save order"
                          disabled={!canEdit}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        />
                      </div>
                    }
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="hidden"
                          name={fieldInputName(["order_received"])}
                          value=""
                        />
                        <input
                          type="checkbox"
                          name={fieldInputName(["order_received"])}
                          value="1"
                          defaultChecked={orderReceived}
                          onChange={(event) => setOrderReceived(event.target.checked)}
                          disabled={!canEdit}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Order received by Zaxon
                      </label>
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-slate-600">
                          Received date
                        </div>
                        <input
                          type="hidden"
                          name={fieldInputName(["order_received_date"])}
                          value=""
                        />
                        <input
                          type="date"
                          name={fieldInputName(["order_received_date"])}
                          defaultValue={valueString(orderStep.values, "order_received_date")}
                          disabled={!canEdit || !orderReceived}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                        />
                      </label>
                    </div>
                    <div className="mt-3">
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-slate-600">
                          Upload order file (optional)
                        </div>
                        <input
                          type="file"
                          name={fieldInputName(["order_received_file"])}
                          disabled={!canEdit || !orderReceived}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                        />
                        {renderFileMeta(orderStep.id, ["order_received_file"])}
                      </label>
                    </div>
                  </StepCard>
                </form>
              ) : null}
              {blStep ? (
                <form action={updateAction} encType="multipart/form-data" className="space-y-3">
                  <input type="hidden" name="stepId" value={blStep.id} />
                  {renderReturnTo()}
                  <StepCard
                    id="bill-of-lading"
                    title="Bill of lading"
                    status={blStep.status}
                    description="Choose Telex or Original and upload the required documents."
                    footer={
                      <div className="flex items-center justify-between">
                        <SubmitButton
                          label="Save B/L"
                          disabled={!canEdit}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        />
                        <span className="text-xs text-slate-500">
                          Done when Telex released, Original submitted, or Original surrendered.
                        </span>
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-slate-600">
                          Draft bill of lading (optional)
                        </div>
                        <input
                          type="file"
                          name={fieldInputName(["draft_bl_file"])}
                          disabled={!canEdit}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                        />
                        {renderFileMeta(blStep.id, ["draft_bl_file"])}
                      </label>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {["telex", "original"].map((option) => (
                          <label
                            key={option}
                            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
                              blType === option
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            <input
                              type="radio"
                              name="blTypeToggle"
                              value={option}
                              checked={blType === option}
                              onChange={() => setBlType(option)}
                              className="h-4 w-4"
                              disabled={!canEdit}
                            />
                            {option === "telex" ? "Telex" : "Original"}
                          </label>
                        ))}
                      </div>

                      {blType === "telex" ? (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          {[
                            {
                              id: "telex_copy_not_released",
                              label: "Telex copy (not released)",
                              fileId: "telex_copy_not_released_file",
                            },
                            {
                              id: "telex_copy_released",
                              label: "Telex copy (released)",
                              fileId: "telex_copy_released_file",
                            },
                          ].map((item) => {
                            const checked = telexChecks[item.id] ?? false;
                            return (
                              <div
                                key={item.id}
                                className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                              >
                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                  <input
                                    type="hidden"
                                    name={fieldInputName([
                                      "bl_type",
                                      "telex",
                                      item.id,
                                    ])}
                                    value=""
                                  />
                                  <input
                                    type="checkbox"
                                    name={fieldInputName([
                                      "bl_type",
                                      "telex",
                                      item.id,
                                    ])}
                                    value="1"
                                    checked={checked}
                                    onChange={(event) =>
                                      setTelexChecks((prev) => ({
                                        ...prev,
                                        [item.id]: event.target.checked,
                                      }))
                                    }
                                    disabled={!canEdit}
                                    className="h-4 w-4 rounded border-slate-300"
                                  />
                                  {item.label}
                                </label>
                                <div className="mt-2">
                                  <input
                                    type="file"
                                    name={fieldInputName([
                                      "bl_type",
                                      "telex",
                                      item.fileId,
                                    ])}
                                    disabled={!canEdit || !checked}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                                  />
                                  {renderFileMeta(blStep.id, [
                                    "bl_type",
                                    "telex",
                                    item.fileId,
                                  ])}
                                </div>
                              </div>
                            );
                          })}

                          {[
                            "bl_copy",
                            "original_received",
                            "original_submitted",
                            "original_surrendered",
                          ].map((field) => (
                            <input
                              key={`clear-${field}`}
                              type="hidden"
                              name={fieldInputName(["bl_type", "original", field])}
                              value=""
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          {["bl_copy", "original_received"].map((field) => (
                            <div
                              key={field}
                              className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                            >
                              <label className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="hidden"
                                  name={fieldInputName(["bl_type", "original", field])}
                                  value=""
                                />
                                <input
                                  type="checkbox"
                                  name={fieldInputName(["bl_type", "original", field])}
                                  value="1"
                                  checked={field === "bl_copy" ? blCopyChecked : originalReceived}
                                  onChange={(event) => {
                                    if (field === "bl_copy") {
                                      setBlCopyChecked(event.target.checked);
                                      return;
                                    }
                                    if (field === "original_received") {
                                      setOriginalReceived(event.target.checked);
                                      if (event.target.checked) {
                                        setOriginalSurrendered(false);
                                      }
                                    }
                                  }}
                                  disabled={
                                    !canEdit ||
                                    (field === "original_received" && originalSurrendered)
                                  }
                                  className="h-4 w-4 rounded border-slate-300"
                                />
                                {field === "bl_copy"
                                  ? "B/L copy"
                                  : "Original B/L received"}
                              </label>
                              <div className="mt-2">
                                <input
                                  type="file"
                                  name={fieldInputName([
                                    "bl_type",
                                    "original",
                                    `${field}_file`,
                                  ])}
                                  disabled={
                                    !canEdit ||
                                    !(field === "bl_copy" ? blCopyChecked : originalReceived)
                                  }
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                                />
                                {renderFileMeta(blStep.id, [
                                  "bl_type",
                                  "original",
                                  `${field}_file`,
                                ])}
                              </div>
                            </div>
                          ))}

                          <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="hidden"
                                name={fieldInputName([
                                  "bl_type",
                                  "original",
                                  "original_submitted",
                                ])}
                                value=""
                              />
                              <input
                                type="checkbox"
                                name={fieldInputName([
                                  "bl_type",
                                  "original",
                                  "original_submitted",
                                ])}
                                value="1"
                                defaultChecked={isTruthy(originalValues.original_submitted)}
                                disabled={!canEdit || originalSurrendered}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              Original B/L submitted to shipping line office
                            </label>
                            <div className="mt-2">
                              <input
                                type="hidden"
                                name={fieldInputName([
                                  "bl_type",
                                  "original",
                                  "original_submitted_date",
                                ])}
                                value=""
                              />
                              <input
                                type="date"
                                name={fieldInputName([
                                  "bl_type",
                                  "original",
                                  "original_submitted_date",
                                ])}
                                defaultValue={valueString(
                                  originalValues,
                                  "original_submitted_date",
                                )}
                                disabled={!canEdit || !isTruthy(originalValues.original_submitted)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                              />
                            </div>
                          </div>

                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="hidden"
                                name={fieldInputName([
                                  "bl_type",
                                  "original",
                                  "original_surrendered",
                                ])}
                                value=""
                              />
                              <input
                                type="checkbox"
                                name={fieldInputName([
                                  "bl_type",
                                  "original",
                                  "original_surrendered",
                                ])}
                                value="1"
                                defaultChecked={originalSurrendered}
                                onChange={(event) => {
                                  setOriginalSurrendered(event.target.checked);
                                  if (event.target.checked) {
                                    setOriginalReceived(false);
                                  }
                                }}
                                disabled={!canEdit || originalReceived}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              Original B/L surrendered
                            </label>
                            <div className="mt-2">
                              <input
                                type="file"
                                name={fieldInputName([
                                  "bl_type",
                                  "original",
                                  "original_surrendered_file",
                                ])}
                                disabled={!canEdit || !originalSurrendered}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                              />
                              {renderFileMeta(blStep.id, [
                                "bl_type",
                                "original",
                                "original_surrendered_file",
                              ])}
                            </div>
                          </div>

                          {["telex_copy_not_released", "telex_copy_released"].map(
                            (field) => (
                              <input
                                key={`clear-telex-${field}`}
                                type="hidden"
                                name={fieldInputName(["bl_type", "telex", field])}
                                value=""
                              />
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  </StepCard>
                </form>
              ) : null}
              {invoiceStep ? (
                <form action={updateAction} encType="multipart/form-data" className="space-y-3">
                  <input type="hidden" name="stepId" value={invoiceStep.id} />
                  {renderReturnTo()}
                  <StepCard
                    id="commercial-invoice"
                    title="Commercial invoice and documents"
                    status={invoiceStep.status}
                    description="Track copy invoices, original documents, and client approvals."
                    footer={
                      <div className="flex items-center justify-between">
                        <SubmitButton
                          label="Save documents"
                          disabled={!canEdit}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        />
                      </div>
                    }
                  >
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="hidden"
                            name={fieldInputName(["copy_invoice_received"])}
                            value=""
                          />
                          <input
                            type="checkbox"
                            name={fieldInputName(["copy_invoice_received"])}
                            value="1"
                            defaultChecked={copyInvoice}
                            onChange={(event) => setCopyInvoice(event.target.checked)}
                            disabled={!canEdit}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Copy invoice received
                        </label>
                        <div className="mt-2">
                          <input
                            type="file"
                            name={fieldInputName(["copy_invoice_file"])}
                            disabled={!canEdit || !copyInvoice}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                          />
                          {renderFileMeta(invoiceStep.id, ["copy_invoice_file"])}
                        </div>
                      </div>

                      {copyInvoice ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                          Please notify your exporter to courier the original invoice to
                          our office to avoid a fine of 1,000 AED upon passing the
                          Bill of Entry. {" "}
                          {messageDaysLeft !== null ? (
                            <span>
                              Fine will be paid within {messageDaysLeft} days.
                            </span>
                          ) : (
                            <span>Set BOE date to calculate remaining days.</span>
                          )}
                        </div>
                      ) : null}

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="hidden"
                            name={fieldInputName(["proceed_with_copy"])}
                            value=""
                          />
                          <input
                            type="checkbox"
                            name={fieldInputName(["proceed_with_copy"])}
                            value="1"
                            defaultChecked={isTruthy(invoiceValues.proceed_with_copy)}
                            disabled={!canEdit}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Proceed with copy documents
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="hidden"
                            name={fieldInputName(["original_invoice_received"])}
                            value=""
                          />
                          <input
                            type="checkbox"
                            name={fieldInputName(["original_invoice_received"])}
                            value="1"
                            defaultChecked={originalInvoice}
                            onChange={(event) =>
                              setOriginalInvoice(event.target.checked)
                            }
                            disabled={!canEdit}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                          Original invoice received
                        </label>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                          Original invoice upload
                        </div>
                        <div className="mt-2">
                          <input
                            type="file"
                            name={fieldInputName(["original_invoice_file"])}
                            disabled={!canEdit || !originalInvoice}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                          />
                          {renderFileMeta(invoiceStep.id, ["original_invoice_file"])}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                            Other documents
                          </div>
                          <button
                            type="button"
                            onClick={addOtherDoc}
                            disabled={!canEdit}
                            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Add document
                          </button>
                        </div>
                        <div className="mt-3 space-y-3">
                          {otherDocs.length ? (
                            otherDocs.map((doc, index) => (
                              <div
                                key={`other-doc-${index}`}
                                className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2"
                              >
                                <label className="block">
                                  <div className="mb-1 text-xs font-medium text-slate-600">
                                    Document name
                                  </div>
                                  <input
                                    type="text"
                                    name={fieldInputName([
                                      "other_documents",
                                      String(index),
                                      "document_name",
                                    ])}
                                    defaultValue={doc.document_name}
                                    disabled={!canEdit}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                                  />
                                </label>
                                <label className="block">
                                  <div className="mb-1 text-xs font-medium text-slate-600">
                                    Upload file
                                  </div>
                                  <input
                                    type="file"
                                    name={fieldInputName([
                                      "other_documents",
                                      String(index),
                                      "document_file",
                                    ])}
                                    disabled={!canEdit}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                                  />
                                  {renderFileMeta(invoiceStep.id, [
                                    "other_documents",
                                    String(index),
                                    "document_file",
                                  ])}
                                </label>
                              </div>
                            ))
                          ) : (
                            <div className="text-xs text-slate-500">
                              No additional documents added yet.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </StepCard>
                </form>
              ) : null}
              {deliveryOrderStep ? (
                <form action={updateAction} encType="multipart/form-data" className="space-y-3">
                  <input type="hidden" name="stepId" value={deliveryOrderStep.id} />
                  {renderReturnTo()}
                  <StepCard
                    id="delivery-order"
                    title="Delivery order"
                    status={deliveryOrderStep.status}
                    description="Delivery order is unlocked after B/L completion."
                    footer={
                      <div className="flex items-center justify-between">
                        <SubmitButton
                          label="Save delivery order"
                          disabled={!canEdit || !blDone}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        />
                        <span className="text-xs text-slate-500">
                          {blDone ? "B/L done" : "Waiting for B/L"}
                        </span>
                      </div>
                    }
                  >
                    {isDeliveryValidSoon ? (
                      <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                        Delivery order validity is close to expiry.
                      </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="hidden"
                          name={fieldInputName(["delivery_order_obtained"])}
                          value=""
                        />
                        <input
                          type="checkbox"
                          name={fieldInputName(["delivery_order_obtained"])}
                          value="1"
                          defaultChecked={deliveryObtained}
                          onChange={(event) => setDeliveryObtained(event.target.checked)}
                          disabled={!canEdit || !blDone}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Delivery order obtained
                      </label>
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-slate-600">
                          Delivery order date
                        </div>
                        <input
                          type="hidden"
                          name={fieldInputName(["delivery_order_date"])}
                          value=""
                        />
                        <input
                          type="date"
                          name={fieldInputName(["delivery_order_date"])}
                          defaultValue={valueString(deliveryValues, "delivery_order_date")}
                          disabled={!canEdit || !blDone || !deliveryObtained}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                        />
                      </label>
                    </div>
                    <div className="mt-3">
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-slate-600">
                          Delivery order validity
                        </div>
                        <input
                          type="hidden"
                          name={fieldInputName(["delivery_order_validity"])}
                          value=""
                        />
                        <input
                          type="date"
                          name={fieldInputName(["delivery_order_validity"])}
                          defaultValue={valueString(
                            deliveryValues,
                            "delivery_order_validity",
                          )}
                          disabled={!canEdit || !blDone || !deliveryObtained}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                        />
                      </label>
                      {allReturned ? (
                        <div className="mt-2 text-xs text-slate-500">
                          Validity tracking paused once all empty containers are
                          returned.
                        </div>
                      ) : null}
                    </div>
                  </StepCard>
                </form>
              ) : null}

              {boeStep ? (
                <form action={updateAction} encType="multipart/form-data" className="space-y-3">
                  <input type="hidden" name="stepId" value={boeStep.id} />
                  {renderReturnTo()}
                  <StepCard
                    id="bill-of-entry"
                    title="Bill of entry passed"
                    status={boeStep.status}
                    description="Requires delivery order and invoice clearance."
                    footer={
                      <div className="flex items-center justify-between">
                        <SubmitButton
                          label="Save BOE"
                          disabled={!canEdit || !deliveryOrderDone || !invoiceDone}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        />
                        <span className="text-xs text-slate-500">
                          {deliveryOrderDone && invoiceDone
                            ? "Ready to submit"
                            : "Waiting for delivery order + invoice"}
                        </span>
                      </div>
                    }
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-slate-600">
                          BOE date
                        </div>
                        <input
                          type="date"
                          name={fieldInputName(["boe_date"])}
                          defaultValue={boeDate}
                          disabled={!canEdit || !deliveryOrderDone || !invoiceDone}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                        />
                      </label>
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-slate-600">
                          BOE number
                        </div>
                        <input
                          type="text"
                          name={fieldInputName(["boe_number"])}
                          defaultValue={valueString(boeValues, "boe_number")}
                          disabled={!canEdit || !deliveryOrderDone || !invoiceDone}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                        />
                      </label>
                    </div>
                    <div className="mt-3">
                      <label className="block">
                        <div className="mb-1 text-xs font-medium text-slate-600">
                          BOE file upload
                        </div>
                        <input
                          type="file"
                          name={fieldInputName(["boe_file"])}
                          disabled={!canEdit || !deliveryOrderDone || !invoiceDone}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                        />
                        {renderFileMeta(boeStep.id, ["boe_file"])}
                      </label>
                    </div>
                  </StepCard>
                </form>
              ) : null}
              </section>
            ) : null}
            {showContainerOps ? (
              <section id="container-ops" className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className={`${headingClassName} text-2xl font-semibold text-slate-900`}>
                  Container operations
                </h2>
                <span className="text-sm text-slate-500">
                  Token bookings and return flow
                </span>
              </div>

              {tokenStep ? (
                <form action={updateAction} encType="multipart/form-data" className="space-y-3">
                  <input type="hidden" name="stepId" value={tokenStep.id} />
                  {renderReturnTo()}
                  <StepCard
                    id="token-booking"
                    title="Token booking"
                    status={tokenStep.status}
                    description="Token booking is unlocked after BOE."
                    footer={
                      <div className="flex items-center justify-between">
                        <SubmitButton
                          label="Save tokens"
                          disabled={!canEdit || !boeDone}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        />
                        <span className="text-xs text-slate-500">
                          {boeDone ? "BOE done" : "Waiting for BOE"}
                        </span>
                      </div>
                    }
                  >
                    <div className="space-y-3">
                      {tokenRows.map((row, index) => {
                        const eligible = boeDone && dischargedFlags[index];
                        return (
                          <div
                            key={`token-${row.container_number}-${index}`}
                            className="rounded-2xl border border-slate-200 bg-white p-4"
                          >
                            <div className="text-sm font-semibold text-slate-900">
                              {row.container_number || `#${index + 1}`}
                            </div>
                            <input
                              type="hidden"
                              name={fieldInputName([
                                "containers",
                                String(index),
                                "container_number",
                              ])}
                              value={row.container_number}
                            />
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <label className="block">
                                <div className="mb-1 text-xs font-medium text-slate-600">
                                  Token date
                                </div>
                                <input
                                  type="date"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "token_date",
                                  ])}
                                  defaultValue={row.token_date ?? ""}
                                  disabled={!canEdit || !eligible}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                                />
                              </label>
                              <label className="block">
                                <div className="mb-1 text-xs font-medium text-slate-600">
                                  Token file
                                </div>
                                <input
                                  type="file"
                                  name={fieldInputName([
                                    "containers",
                                    String(index),
                                    "token_file",
                                  ])}
                                  disabled={!canEdit || !eligible}
                                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                                />
                                {renderFileMeta(tokenStep.id, [
                                  "containers",
                                  String(index),
                                  "token_file",
                                ])}
                              </label>
                            </div>
                            {!eligible ? (
                              <div className="mt-2 text-xs text-slate-500">
                                Waiting for discharge and BOE clearance.
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </StepCard>
                </form>
              ) : null}

              {returnTokenStep ? (
                <form action={updateAction} encType="multipart/form-data" className="space-y-3">
                  <input type="hidden" name="stepId" value={returnTokenStep.id} />
                  {renderReturnTo()}
                  <StepCard
                    id="return-token"
                    title="Return token booking"
                    status={returnTokenStep.status}
                    description="Book return tokens for empty containers."
                    footer={
                      <div className="flex items-center justify-between">
                        <SubmitButton
                          label="Save return tokens"
                          disabled={!canEdit}
                          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        />
                      </div>
                    }
                  >
                    <div className="space-y-3">
                      {returnTokenRows.map((row, index) => (
                        <div
                          key={`return-${row.container_number}-${index}`}
                          className="rounded-2xl border border-slate-200 bg-white p-4"
                        >
                          <div className="text-sm font-semibold text-slate-900">
                            {row.container_number || `#${index + 1}`}
                          </div>
                          <input
                            type="hidden"
                            name={fieldInputName([
                              "containers",
                              String(index),
                              "container_number",
                            ])}
                            value={row.container_number}
                          />
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <label className="block">
                              <div className="mb-1 text-xs font-medium text-slate-600">
                                Return token date
                              </div>
                              <input
                                type="date"
                                name={fieldInputName([
                                  "containers",
                                  String(index),
                                  "return_token_date",
                                ])}
                                defaultValue={row.return_token_date ?? ""}
                                disabled={!canEdit}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                              />
                            </label>
                            <label className="block">
                              <div className="mb-1 text-xs font-medium text-slate-600">
                                Return token file
                              </div>
                              <input
                                type="file"
                                name={fieldInputName([
                                  "containers",
                                  String(index),
                                  "return_token_file",
                                ])}
                                disabled={!canEdit}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm disabled:bg-slate-100"
                              />
                              {renderFileMeta(returnTokenStep.id, [
                                "containers",
                                String(index),
                                "return_token_file",
                              ])}
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </StepCard>
                </form>
              ) : null}
              </section>
            ) : null}
          </main>
        </div>
      </div>

      {isFull && showPalette ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowPalette(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Command palette
            </div>
            <div className="mt-3 space-y-2">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    document
                      .getElementById(action.target)
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    setShowPalette(false);
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 transition hover:border-slate-300 hover:bg-white"
                >
                  <span>{action.label}</span>
                  <span className="text-xs text-slate-400">Enter</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isFull && showShortcuts ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowShortcuts(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Keyboard shortcuts
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>Command palette</span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                  Ctrl + K
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Toggle help</span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                  ?
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Close modal</span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                  Esc
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
