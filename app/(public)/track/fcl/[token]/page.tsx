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
import { parseStepFieldValues } from "@/lib/stepFields";
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

  const steps = await listShipmentSteps(shipment.id);
  const stepByName = new Map(steps.map((step) => [step.name, step]));
  const docs = await listDocuments(shipment.id);
  const customerUploads = docs
    .filter((doc) => doc.source === "CUSTOMER" && doc.share_with_customer)
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    .slice(0, 50);

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
  const boeStep = stepByName.get(FCL_IMPORT_STEP_NAMES.billOfEntry);

  const vesselValues = parseStepFieldValues(vesselStep?.field_values_json);
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
      isReceived: true,
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
          </div>
        </header>

        {uploaded ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Document uploaded successfully. Thank you!
          </div>
        ) : null}

        {invoiceStep ? (
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

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className={`${headingFont.className} text-2xl font-semibold text-slate-900`}>
              Tracking milestones
            </h2>
            <span className="text-sm text-slate-500">Client view</span>
          </div>

          <div className="grid gap-4">
            {vesselStep ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Step 1
                    </div>
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
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Step 2
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      Containers discharge
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Summary of discharged containers and port free days.
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {pullOutStep ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Step 3
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      Container pull-out from port
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Pull-out updates appear once BOE is confirmed.
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
                        Pull-out date: {formatDate(row.pull_out_date)}
                      </div>
                      <div>Destination: {row.pull_out_destination || "N/A"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {deliveryStep ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Step 4
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      Container delivered or offloaded
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Track delivery, offload, and empty returns.
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
                      <div className="font-medium text-slate-900">
                        {row.container_number || `#${index + 1}`}
                      </div>
                      <div className="mt-1">
                        Offload or delivery date: {formatDate(row.delivered_offloaded_date)}
                      </div>
                      <div>Empty return date: {formatDate(row.empty_returned_date)}</div>
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
