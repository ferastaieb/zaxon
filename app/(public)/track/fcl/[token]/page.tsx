import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import { Badge } from "@/components/ui/Badge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  addDocument,
  listDocuments,
  listDocumentRequests,
  markDocumentRequestFulfilled,
} from "@/lib/data/documents";
import { logActivity } from "@/lib/data/activities";
import {
  getShipmentIdForTrackingToken,
  getTrackingShipment,
  listCustomerDocumentRequests,
} from "@/lib/data/tracking";
import { listShipmentSteps } from "@/lib/data/shipments";
import { overallStatusLabel, stepStatusLabel, type StepStatus } from "@/lib/domain";
import { encodeFieldPath, parseStepFieldValues, stepFieldDocType } from "@/lib/stepFields";
import { FCL_IMPORT_STEP_NAMES } from "@/lib/fclImport/constants";
import {
  extractContainerNumbers,
  isTruthy,
  normalizeContainerNumbers,
  normalizeContainerRows,
} from "@/lib/fclImport/helpers";
import { refreshShipmentDerivedState } from "@/lib/services/shipmentDerived";
import { saveUpload } from "@/lib/storage";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

type TrackPageProps = {
  params: Promise<{ token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function statusTone(status: StepStatus) {
  if (status === "DONE") return "green";
  if (status === "IN_PROGRESS") return "blue";
  if (status === "BLOCKED") return "red";
  return "zinc";
}

function summaryStyle(status: "DONE" | "IN_PROGRESS" | "PENDING") {
  if (status === "DONE") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }
  if (status === "IN_PROGRESS") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function daysUntil(dateRaw: string | undefined) {
  if (!dateRaw) return null;
  const date = new Date(dateRaw);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default async function FclTrackingPage({
  params,
  searchParams,
}: TrackPageProps) {
  const { token } = await params;
  const shipment = await getTrackingShipment(token);
  if (!shipment) notFound();
  const resolved = searchParams
    ? await Promise.resolve(searchParams)
    : ({} as SearchParams);
  const uploaded = readParam(resolved, "uploaded") === "1";
  const view = readParam(resolved, "view") ?? "tracking";

  const steps = await listShipmentSteps(shipment.id);
  const stepByName = new Map(steps.map((step) => [step.name, step]));
  const docs = await listDocuments(shipment.id);
  const customerUploads = docs
    .filter((doc) => doc.source === "CUSTOMER" && doc.share_with_customer)
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    .slice(0, 50);
  const docByType = new Map(
    docs
      .filter((doc) => doc.share_with_customer)
      .map((doc) => [String(doc.document_type), doc]),
  );

  const creationStep = stepByName.get(FCL_IMPORT_STEP_NAMES.shipmentCreation);
  let containerNumbers = extractContainerNumbers(
    parseStepFieldValues(creationStep?.field_values_json),
  );
  containerNumbers = normalizeContainerNumbers(containerNumbers);

  const vesselStep = stepByName.get(FCL_IMPORT_STEP_NAMES.vesselTracking);
  const dischargeStep = stepByName.get(FCL_IMPORT_STEP_NAMES.containersDischarge);
  const pullOutStep = stepByName.get(FCL_IMPORT_STEP_NAMES.containerPullOut);
  const deliveryStep = stepByName.get(FCL_IMPORT_STEP_NAMES.containerDelivery);
  const invoiceStep = stepByName.get(FCL_IMPORT_STEP_NAMES.commercialInvoice);
  const deliveryOrderStep = stepByName.get(FCL_IMPORT_STEP_NAMES.deliveryOrder);
  const boeStep = stepByName.get(FCL_IMPORT_STEP_NAMES.billOfEntry);
  const blStep = stepByName.get(FCL_IMPORT_STEP_NAMES.billOfLading);

  const vesselValues = parseStepFieldValues(vesselStep?.field_values_json);
  const blValues = parseStepFieldValues(blStep?.field_values_json);
  const dischargeRows = normalizeContainerRows(
    containerNumbers,
    parseStepFieldValues(dischargeStep?.field_values_json),
  );
  const pullOutRows = normalizeContainerRows(
    containerNumbers,
    parseStepFieldValues(pullOutStep?.field_values_json),
  );
  const deliveryRows = normalizeContainerRows(
    containerNumbers,
    parseStepFieldValues(deliveryStep?.field_values_json),
  );

  const vesselEta = typeof vesselValues.eta === "string" ? vesselValues.eta : "";
  const vesselAta = typeof vesselValues.ata === "string" ? vesselValues.ata : "";
  const vesselLabel = vesselAta
    ? "Vessel arrived"
    : vesselEta
      ? "Vessel sailing"
      : "ETA pending";
  const blNumber =
    typeof blValues.bl_number === "string" ? blValues.bl_number : "";
  const blChoice =
    typeof blValues.bl_type === "object" && blValues.bl_type
      ? (blValues.bl_type as Record<string, unknown>)
      : {};
  const blTelex =
    typeof blChoice.telex === "object" && blChoice.telex
      ? (blChoice.telex as Record<string, unknown>)
      : {};
  const blOriginal =
    typeof blChoice.original === "object" && blChoice.original
      ? (blChoice.original as Record<string, unknown>)
      : {};
  const blTypeLabel = Object.keys(blTelex).length
    ? "Telex"
    : Object.keys(blOriginal).length
      ? "Original"
      : "Not set";
  const telexReleased = isTruthy(blTelex.telex_copy_released);
  const originalReceived = isTruthy(blOriginal.original_received);
  const originalSubmitted = isTruthy(blOriginal.original_submitted);
  const originalSurrendered = isTruthy(blOriginal.original_surrendered);
  const blDone = telexReleased || originalSubmitted || originalSurrendered;

  const invoiceValues = parseStepFieldValues(invoiceStep?.field_values_json);
  const boeValues = parseStepFieldValues(boeStep?.field_values_json);
  const boeDate = typeof boeValues.boe_date === "string" ? boeValues.boe_date : "";
  const invoiceOptionRaw =
    typeof invoiceValues.invoice_option === "string"
      ? invoiceValues.invoice_option
      : "";
  const invoiceOption =
    invoiceOptionRaw ||
    (isTruthy(invoiceValues.proceed_with_copy) ? "COPY_FINE" : "") ||
    (isTruthy(invoiceValues.original_invoice_received) ? "ORIGINAL" : "");
  const messageDaysLeft = (() => {
    if (!boeDate) return null;
    const boe = new Date(boeDate);
    if (Number.isNaN(boe.getTime())) return null;
    const deadline = new Date(boe.getTime() + 20 * 24 * 60 * 60 * 1000);
    return daysUntil(deadline.toISOString());
  })();

  const requests = await listCustomerDocumentRequests(shipment.id);
  const sharedDocs = docs.filter((doc) => doc.share_with_customer);
  const openRequestTypes = new Set(
    requests.filter((r) => r.status === "OPEN").map((r) => String(r.document_type)),
  );
  const countDocsBySuffix = (stepId: number | undefined, suffix: string) => {
    if (!stepId) return 0;
    const match = `${stepId}:`;
    return sharedDocs.filter(
      (doc) =>
        String(doc.document_type).includes(match) &&
        String(doc.document_type).includes(suffix),
    ).length;
  };


  const findDoc = (types: string[]) =>
    sharedDocs.find((doc) => types.includes(String(doc.document_type))) ?? null;

  const countContainerDocs = (
    stepId: number | undefined,
    index: number,
    suffix: string,
  ) => {
    if (!stepId) return 0;
    const prefix = `${stepId}:containers.${index}.`;
    return sharedDocs.filter(
      (doc) =>
        String(doc.document_type).includes(prefix) &&
        String(doc.document_type).includes(suffix),
    ).length;
  };


  const blDocTypes = blStep
    ? [
        stepFieldDocType(blStep.id, encodeFieldPath(["draft_bl_file"])),
        stepFieldDocType(blStep.id, encodeFieldPath(["bl_copy_file"])),
        stepFieldDocType(blStep.id, encodeFieldPath(["original_received_file"])),
        stepFieldDocType(blStep.id, encodeFieldPath(["original_surrendered_file"])),
        stepFieldDocType(blStep.id, encodeFieldPath(["telex_copy_not_released_file"])),
        stepFieldDocType(blStep.id, encodeFieldPath(["telex_copy_released_file"])),
      ]
    : [];
  const invoiceDocTypes = invoiceStep
    ? [
        stepFieldDocType(invoiceStep.id, encodeFieldPath(["copy_invoice_file"])),
        stepFieldDocType(invoiceStep.id, encodeFieldPath(["original_invoice_file"])),
      ]
    : [];
  const boeDocType = boeStep
    ? stepFieldDocType(boeStep.id, encodeFieldPath(["boe_file"]))
    : "";
  const deliveryOrderDocType = deliveryOrderStep
    ? stepFieldDocType(deliveryOrderStep.id, encodeFieldPath(["delivery_order_file"]))
    : "";
  const pullOutTokenCount = countDocsBySuffix(
    pullOutStep?.id,
    "pull_out_token_file",
  );
  const returnTokenCount = countDocsBySuffix(
    deliveryStep?.id,
    "empty_returned_token_file",
  );
  const otherDocCount = countDocsBySuffix(
    invoiceStep?.id,
    "document_file",
  );

  const orderStep = stepByName.get(FCL_IMPORT_STEP_NAMES.orderReceived);
  const orderValues = parseStepFieldValues(orderStep?.field_values_json);
  const orderReceivedDate =
    typeof orderValues.order_received_date === "string"
      ? orderValues.order_received_date
      : "";
  const orderRemarks =
    typeof orderValues.order_received_remarks === "string"
      ? orderValues.order_received_remarks
      : "";
  const deliveryOrderValues = parseStepFieldValues(
    deliveryOrderStep?.field_values_json,
  );
  const deliveryOrderDate =
    typeof deliveryOrderValues.delivery_order_date === "string"
      ? deliveryOrderValues.delivery_order_date
      : "";

  const totalContainers = containerNumbers.length;
  const dischargedCount = dischargeRows.filter(
    (row) =>
      isTruthy(row.container_discharged) || !!row.container_discharged_date?.trim(),
  ).length;
  const pulledOutCount = pullOutRows.filter(
    (row) =>
      !!row.pull_out_token_date?.trim() ||
      !!row.pull_out_date?.trim(),
  ).length;
  const deliveredCount = deliveryRows.filter(
    (row) =>
      isTruthy(row.delivered_offloaded) || !!row.delivered_offloaded_date?.trim(),
  ).length;

  const vesselState: "DONE" | "IN_PROGRESS" | "PENDING" = vesselAta ? "DONE" : vesselEta ? "IN_PROGRESS" : "PENDING";
  const dischargeState: "DONE" | "IN_PROGRESS" | "PENDING" =
    totalContainers === 0
      ? "PENDING"
      : dischargedCount === 0
        ? "PENDING"
        : dischargedCount < totalContainers
          ? "IN_PROGRESS"
          : "DONE";
  const pullOutState: "DONE" | "IN_PROGRESS" | "PENDING" =
    boeStep?.status !== "DONE"
      ? "PENDING"
      : totalContainers === 0
        ? "PENDING"
        : pulledOutCount === 0
          ? "PENDING"
          : pulledOutCount < totalContainers
            ? "IN_PROGRESS"
            : "DONE";
  const deliveryState: "DONE" | "IN_PROGRESS" | "PENDING" =
    totalContainers === 0
      ? "PENDING"
      : deliveredCount === 0
        ? "PENDING"
        : deliveredCount < totalContainers
          ? "IN_PROGRESS"
          : "DONE";

  async function uploadRequestedDocAction(
    tokenValue: string,
    requestId: number,
    formData: FormData,
  ) {
    "use server";
    const shipmentId = await getShipmentIdForTrackingToken(tokenValue);
    if (!shipmentId) redirect(`/track/fcl/${tokenValue}?error=invalid`);

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      redirect(`/track/fcl/${tokenValue}?error=file`);
    }

    const req = (await listDocumentRequests(shipmentId)).find(
      (request) => request.id === requestId,
    );
    if (!req || req.status !== "OPEN") {
      redirect(`/track/fcl/${tokenValue}?error=request`);
    }

    const upload = await saveUpload({
      shipmentId,
      file,
      filePrefix: `CUSTOMER-${req.document_type}`,
    });

    const docId = await addDocument({
      shipmentId,
      documentType: req.document_type,
      fileName: upload.fileName,
      storagePath: upload.storagePath,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      isRequired: true,
      isReceived: false,
      reviewStatus: "PENDING",
      shareWithCustomer: true,
      source: "CUSTOMER",
      documentRequestId: req.id,
      uploadedByUserId: null,
    });

    await markDocumentRequestFulfilled(req.id);

    await logActivity({
      shipmentId,
      type: "CUSTOMER_DOCUMENT_UPLOADED",
      message: `Customer uploaded: ${req.document_type}`,
      actorUserId: null,
      data: { docId, requestId: req.id },
    });

    await refreshShipmentDerivedState({
      shipmentId,
      actorUserId: null,
      updateLastUpdate: true,
    });

    redirect(`/track/fcl/${tokenValue}?uploaded=1`);
  }

  return (
    <div className={`${bodyFont.className} min-h-screen bg-slate-50`}>
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Shipment tracking
          </div>
          <h1
            className={`${headingFont.className} mt-2 text-3xl font-semibold text-slate-900`}
          >
            {shipment.shipment_code}
          </h1>
          <div className="mt-2 text-sm text-slate-600">
            {shipment.origin} to {shipment.destination}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge tone="zinc">{overallStatusLabel(shipment.overall_status)}</Badge>
            <span className="text-xs text-slate-400">
              Updated {new Date(shipment.last_update_at).toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">
              B/L: {blNumber || "N/A"}
            </span>
          </div>
        </header>

        {uploaded ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Document uploaded successfully. Thank you!
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/track/fcl/${token}?view=tracking`}
            className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${view === "tracking"
              ? "bg-slate-900 text-white"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
          >
            Shipment tracking
          </Link>
          <Link
            href={`/track/fcl/${token}?view=customs`}
            className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition ${view === "customs"
              ? "bg-slate-900 text-white"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
          >
            Customs clearance
          </Link>
        </div>

        {view === "customs" ? (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className={`${headingFont.className} text-2xl font-semibold text-slate-900`}>
                Customs clearance tracking
              </h2>
              <span className="text-sm text-slate-500">Internal process view</span>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Order received
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">
                    Order received by Zaxon
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {orderReceivedDate ? `Received on ${formatDate(orderReceivedDate)}` : "Waiting for order"}
                  </div>
                </div>
                {orderStep ? (
                  <Badge tone={statusTone(orderStep.status)}>{stepStatusLabel(orderStep.status)}</Badge>
                ) : null}
              </div>
              {orderRemarks ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {orderRemarks}
                </div>
              ) : null}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Bill of lading
                  </div>
                  <div className="mt-2 text-lg font-semibold text-slate-900">
                    B/L status
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {blNumber ? `B/L number: ${blNumber}` : "B/L number not provided"}
                  </div>
                </div>
                {blStep ? (
                  <Badge tone={blDone ? "green" : "blue"}>{blDone ? "Done" : "In progress"}</Badge>
                ) : null}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  B/L type: {blTypeLabel}
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Status: {blDone ? "Completed" : originalReceived ? "B/L received" : "Pending"}
                </div>
              </div>
              {!blDone ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {blTypeLabel === "Telex"
                    ? telexReleased
                      ? "Telex B/L released."
                      : "Please share the released copy of your B/L."
                    : blTypeLabel === "Original"
                      ? originalReceived
                        ? "Original B/L received by Zaxon."
                        : "Please courier the original B/L to our office."
                      : "B/L type not selected yet."}
                </div>
              ) : null}
            </div>

            {deliveryOrderStep ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Delivery order
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      Delivery order status
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {deliveryOrderDate
                        ? `Received on ${formatDate(deliveryOrderDate)}`
                        : "Pending delivery order"}
                    </div>
                  </div>
                  <Badge tone={statusTone(deliveryOrderStep.status)}>{stepStatusLabel(deliveryOrderStep.status)}</Badge>
                </div>
              </div>
            ) : null}

            {boeStep ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Bill of entry
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      BOE status
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {boeDate ? `BOE date: ${formatDate(boeDate)}` : "BOE not submitted yet"}
                    </div>
                  </div>
                  <Badge tone={statusTone(boeStep.status)}>{stepStatusLabel(boeStep.status)}</Badge>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {view === "customs" && invoiceStep ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Commercial invoice
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  BOE invoice option
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  This selection guides how we proceed with BOE.
                </div>
              </div>
              <Badge tone={statusTone(invoiceStep.status)}>
                {stepStatusLabel(invoiceStep.status)}
              </Badge>
            </div>

            {invoiceOption === "COPY_20_DAYS" ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                Please courier your original invoice to our office to avoid a
                fine of 1,000 AED upon passing the Bill of Entry.{" "}
                {messageDaysLeft !== null ? (
                  <span>Fine will be paid within {messageDaysLeft} days.</span>
                ) : (
                  <span>Set BOE date to calculate remaining days.</span>
                )}
              </div>
            ) : invoiceOption === "COPY_FINE" ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Proceeding with copy invoice and 1,000 AED fine.
              </div>
            ) : invoiceOption === "ORIGINAL" ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Proceeding with original invoice.
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                No invoice option selected yet.
              </div>
            )}
          </section>
        ) : null}

        {view === "tracking" ? (
          <>
        <section className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  General shipment info
                </div>
                <div className="mt-2 text-lg font-semibold text-slate-900">
                  Current shipment status
                </div>
              </div>
              <Badge tone="zinc">{overallStatusLabel(shipment.overall_status)}</Badge>
            </div>
            <div className="mt-4 grid gap-2">
              {[
                {
                  id: "vessel-tracking",
                  title: "Vessel tracking",
                  status: vesselState,
                  label: vesselAta ? "Vessel Arrived" : vesselEta ? "Vessel Sailing" : "ETA Pending",
                },
                {
                  id: "container-discharge",
                  title: "Container discharge to port",
                  status: dischargeState,
                  label:
                    dischargedCount === 0
                      ? "Container on vessel"
                      : dischargedCount < totalContainers
                        ? "Container discharged to port"
                        : "All containers discharged",
                },
                {
                  id: "container-pullout",
                  title: "Container pulled out",
                  status: pullOutState,
                  label:
                    boeStep?.status !== "DONE"
                      ? "BOE pending"
                      : pulledOutCount === 0
                        ? "Ready for collection"
                        : pulledOutCount < totalContainers
                          ? "Pulled out (partial)"
                          : "Pulled out",
                },
                {
                  id: "container-delivery",
                  title: "Container delivered / offloaded",
                  status: deliveryState,
                  label:
                    deliveredCount === 0
                      ? "Offloading pending"
                      : deliveredCount < totalContainers
                        ? "Offloading in progress"
                        : "Container was offloaded",
                },
              ].map((item) => (
                <a
                  key={item.title}
                  href={`#${item.id}`}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm transition hover:-translate-y-0.5 hover:shadow-md ${summaryStyle(item.status)}`}
                >
                  <div>
                    <div className="font-medium text-slate-900">{item.title}</div>
                    <div className="text-xs text-slate-600">{item.label}</div>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[0.2em]">
                    {item.status === "DONE"
                      ? "Done"
                      : item.status === "IN_PROGRESS"
                        ? "In progress"
                        : "Pending"}
                  </span>
                </a>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <h2 className={`${headingFont.className} text-2xl font-semibold text-slate-900`}>
              Shipment tracking
            </h2>
            <span className="text-sm text-slate-500">Tap to expand details</span>
          </div>

          <div className="grid gap-4">
            {vesselStep ? (
              <div id="vessel-tracking" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      Vessel tracking
                    </div>
                    <div className="mt-1 text-sm text-slate-600">{vesselLabel}</div>
                  </div>
                  <Badge tone={statusTone(vesselStep.status)}>
                    {stepStatusLabel(vesselStep.status)}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    ETA: {formatDate(vesselEta)}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    ATA: {formatDate(vesselAta)}
                  </div>
                </div>
              </div>
            ) : null}

            {dischargeStep ? (
              <div id="container-discharge" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      Containers discharge
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {dischargedCount === 0
                        ? "Container on vessel"
                        : dischargedCount < totalContainers
                          ? "Container discharged to port"
                          : "All containers discharged"}
                    </div>
                  </div>
                  <Badge tone={statusTone(dischargeStep.status)}>
                    {stepStatusLabel(dischargeStep.status)}
                  </Badge>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-sm text-slate-700">
                    <thead className="bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Container</th>
                        <th className="px-3 py-2">Discharge date</th>
                        <th className="px-3 py-2">Last port free day</th>
                        <th className="px-3 py-2">Total free days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dischargeRows.map((row, index) => (
                        <tr key={`discharge-row-${index}`} className="border-t border-slate-200">
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {row.container_number || `#${index + 1}`}
                          </td>
                          <td className="px-3 py-2">
                            {formatDate(row.container_discharged_date)}
                          </td>
                          <td className="px-3 py-2">
                            {formatDate(row.last_port_free_day)}
                          </td>
                          <td className="px-3 py-2">
                            {(() => {
                              if (!row.container_discharged_date || !row.last_port_free_day) return "N/A";
                              const start = new Date(row.container_discharged_date);
                              const end = new Date(row.last_port_free_day);
                              if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "N/A";
                              const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                              return diff >= 0 ? diff : 0;
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {pullOutStep ? (
              <div id="container-pullout" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      Container pull-out from port
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {boeStep?.status !== "DONE"
                        ? "BOE pending"
                        : pulledOutCount === 0
                          ? "Ready for collection"
                          : pulledOutCount < totalContainers
                            ? "Pull-out in progress"
                            : "Pulled out"}
                    </div>
                  </div>
                  <Badge tone={statusTone(pullOutStep.status)}>
                    {stepStatusLabel(pullOutStep.status)}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3">
                  {pullOutRows.map((row, index) => (
                    <div
                      key={`pullout-row-${index}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
                    >
                      <div className="font-medium text-slate-900">
                        {row.container_number || `#${index + 1}`}
                      </div>
                      <div className="mt-1">
                        Token date: {formatDate(row.pull_out_token_date ?? row.pull_out_date)}
                      </div>
                      <div>Token slot: {row.pull_out_token_slot || "N/A"}</div>
                      <div>Destination: {row.pull_out_destination || "N/A"}</div>
                      <div className="mt-1">
                        Token file:{" "}
                        {pullOutStep ? (
                          (() => {
                            const docType = stepFieldDocType(
                              pullOutStep.id,
                              encodeFieldPath([
                                "containers",
                                String(index),
                                "pull_out_token_file",
                              ]),
                            );
                            const doc = docByType.get(docType);
                            return doc ? (
                              <a
                                href={`/api/track/${token}/documents/${doc.id}`}
                                className="font-medium text-slate-700 hover:underline"
                              >
                                Download
                              </a>
                            ) : (
                              "N/A"
                            );
                          })()
                        ) : (
                          "N/A"
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {deliveryStep ? (
              <div id="container-delivery" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      Container delivered or offloaded
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {deliveredCount === 0
                        ? "Offloading pending"
                        : deliveredCount < totalContainers
                          ? "Offloading in progress"
                          : "Container was offloaded"}
                    </div>
                  </div>
                  <Badge tone={statusTone(deliveryStep.status)}>
                    {stepStatusLabel(deliveryStep.status)}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3">
                  {deliveryRows.map((row, index) => (
                    <div
                      key={`delivery-row-${index}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
                    >
                      {(() => {
                        const stockEnabled = isTruthy(
                          pullOutRows[index]?.stock_tracking_enabled,
                        );
                        const damage = isTruthy(row.cargo_damage);
                        const offloadPicturesCount = countContainerDocs(
                          deliveryStep.id,
                          index,
                          "offload_pictures",
                        );
                        const damagePicturesCount = countContainerDocs(
                          deliveryStep.id,
                          index,
                          "cargo_damage_pictures",
                        );
                        return (
                          <>
                      <div className="font-medium text-slate-900">
                        {row.container_number || `#${index + 1}`}
                      </div>
                      <div className="mt-1">
                        Offload or delivery date: {formatDate(row.delivered_offloaded_date)}
                      </div>
                      <div>Empty return date: {formatDate(row.empty_returned_date)}</div>
                      <div>Empty return slot: {row.empty_returned_token_slot || "N/A"}</div>
                      <div className="mt-1">
                        Empty return token:{" "}
                        {deliveryStep ? (
                          (() => {
                            const docType = stepFieldDocType(
                              deliveryStep.id,
                              encodeFieldPath([
                                "containers",
                                String(index),
                                "empty_returned_token_file",
                              ]),
                            );
                            const doc = docByType.get(docType);
                            return doc ? (
                              <a
                                href={`/api/track/${token}/documents/${doc.id}`}
                                className="font-medium text-slate-700 hover:underline"
                              >
                                Download
                              </a>
                            ) : (
                              "N/A"
                            );
                          })()
                        ) : (
                          "N/A"
                        )}
                      </div>
                      {stockEnabled ? (
                        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                          <div className="font-semibold uppercase tracking-[0.2em]">
                            Stock tracking
                          </div>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            <div>
                              Total weight: {row.total_weight_kg || "N/A"} kg
                            </div>
                            <div>
                              Packages: {row.total_packages || "N/A"}{" "}
                              {row.package_type || ""}
                            </div>
                            <div className="md:col-span-2">
                              Cargo description: {row.cargo_description || "N/A"}
                            </div>
                          </div>
                          <div className="mt-2">
                            Offload pictures:{" "}
                            {offloadPicturesCount
                              ? `${offloadPicturesCount} uploaded`
                              : "None"}
                          </div>
                          {damage ? (
                            <div className="mt-2">
                              Damage reported. Pictures:{" "}
                              {damagePicturesCount
                                ? `${damagePicturesCount} uploaded`
                                : "None"}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                        </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Documents
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                Shipment documents
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {[
              {
                label: "Bill of lading",
                doc: findDoc(blDocTypes),
                requested: blDocTypes.some((t) => openRequestTypes.has(t)),
              },
              {
                label: "Commercial invoice",
                doc: findDoc(invoiceDocTypes),
                requested: invoiceDocTypes.some((t) => openRequestTypes.has(t)),
              },
              {
                label: "Other documents",
                doc: otherDocCount ? null : null,
                requested: false,
                count: otherDocCount,
              },
              {
                label: "Delivery order",
                doc: deliveryOrderDocType ? findDoc([deliveryOrderDocType]) : null,
                requested: deliveryOrderDocType ? openRequestTypes.has(deliveryOrderDocType) : false,
              },
              {
                label: "Bill of entry",
                doc: boeDocType ? findDoc([boeDocType]) : null,
                requested: boeDocType ? openRequestTypes.has(boeDocType) : false,
              },
              {
                label: "Pull out token",
                doc: null,
                requested: false,
                count: pullOutTokenCount,
              },
              {
                label: "Return token",
                doc: null,
                requested: false,
                count: returnTokenCount,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
              >
                <div>
                  <div className="font-medium text-slate-900">{item.label}</div>
                  <div className="text-xs text-slate-500">
                    {item.doc
                      ? item.doc.file_name
                      : item.count
                        ? `${item.count} file${item.count === 1 ? "" : "s"}`
                        : "Not uploaded"}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {item.requested ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
                      Requested
                    </span>
                  ) : null}
                  {item.doc ? (
                    <a
                      href={`/api/track/${token}/documents/${item.doc.id}`}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                    >
                      Download
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Requested documents
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                Upload requested files
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {requests
              .filter((r) => r.status === "OPEN")
              .map((r) => (
                <div key={r.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-medium text-slate-900">
                    {r.document_type}
                  </div>
                  {r.message ? (
                    <div className="mt-1 text-sm text-slate-600">{r.message}</div>
                  ) : null}
                  <form
                    action={uploadRequestedDocAction.bind(null, token, r.id)}
                    className="mt-3 flex flex-wrap items-center gap-2"
                  >
                    <input
                      name="file"
                      type="file"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
                      required
                    />
                    <SubmitButton
                      pendingLabel="Uploading..."
                      className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                    >
                      Upload
                    </SubmitButton>
                  </form>
                </div>
              ))}

            {requests.filter((r) => r.status === "OPEN").length === 0 ? (
              <div className="text-sm text-slate-500">
                No documents requested right now.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                Your uploads
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                Documents you uploaded
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {customerUploads.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm text-slate-700"
              >
                <div>
                  <div className="font-medium text-slate-900">{doc.document_type}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {doc.file_name} ·{" "}
                    {new Date(doc.uploaded_at).toLocaleString()}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {doc.is_received ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
                        Verified by Zaxon
                      </span>
                    ) : doc.review_status === "REJECTED" ? (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-800">
                        Rejected - please reupload
                      </span>
                    ) : (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
                        Awaiting verification
                      </span>
                    )}
                  </div>
                  {doc.review_status === "REJECTED" && doc.review_note ? (
                    <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      {doc.review_note}
                    </div>
                  ) : null}
                </div>
                <a
                  href={`/api/track/${token}/documents/${doc.id}`}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Download
                </a>
              </div>
            ))}
            {customerUploads.length === 0 ? (
              <div className="text-sm text-slate-500">
                No documents uploaded yet.
              </div>
            ) : null}
          </div>
        </section>
          </>
        ) : null}

      </div>
    </div>
  );
}
type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}