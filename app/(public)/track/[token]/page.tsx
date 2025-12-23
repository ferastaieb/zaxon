import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { addDocument, markDocumentRequestFulfilled } from "@/lib/data/documents";
import { logActivity } from "@/lib/data/activities";
import {
  getShipmentIdForTrackingToken,
  getTrackingCustomerPhoneLast4,
  getTrackingShipment,
  listCustomerVisibleExceptions,
  listCustomerDocumentRequests,
  listCustomerVisibleDocuments,
  listCustomerVisibleSteps,
} from "@/lib/data/tracking";
import { getDb, inTransaction } from "@/lib/db";
import { overallStatusLabel, stepStatusLabel, type StepStatus } from "@/lib/domain";
import { queryOne } from "@/lib/sql";
import { refreshShipmentDerivedState } from "@/lib/services/shipmentDerived";
import { saveUpload } from "@/lib/storage";
import {
  clearTrackingSessionCookie,
  createTrackingSession,
  deleteTrackingSession,
  getTrackingSessionToken,
  isTrackingSessionValid,
} from "@/lib/trackingAuth";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function stepTone(status: StepStatus) {
  if (status === "DONE") return "green";
  if (status === "IN_PROGRESS") return "blue";
  if (status === "BLOCKED") return "red";
  return "zinc";
}

function exceptionTone(risk: string) {
  if (risk === "BLOCKED") return "red";
  if (risk === "AT_RISK") return "yellow";
  return "zinc";
}

export default async function TrackShipmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolved = searchParams
    ? await Promise.resolve(searchParams)
    : ({} as SearchParams);
  const uploaded = readParam(resolved, "uploaded") === "1";
  const error = readParam(resolved, "error");

  const { token } = await params;
  const shipment = getTrackingShipment(token);
  if (!shipment) notFound();

  const isAuthed = await isTrackingSessionValid(token);
  const customerLast4 = getTrackingCustomerPhoneLast4(token);

  async function authenticateAction(token: string, formData: FormData) {
    "use server";
    const expected = getTrackingCustomerPhoneLast4(token);
    if (!expected) redirect(`/track/${token}?error=no_phone`);

    const pin = String(formData.get("pin") ?? "")
      .trim()
      .replace(/\\D+/g, "");
    if (pin.length !== 4) redirect(`/track/${token}?error=pin`);

    if (pin !== expected) redirect(`/track/${token}?error=pin`);

    await createTrackingSession(token);
    redirect(`/track/${token}`);
  }

  async function logoutTrackingAction(token: string) {
    "use server";
    const sessionToken = await getTrackingSessionToken();
    if (sessionToken) deleteTrackingSession(sessionToken);
    await clearTrackingSessionCookie();
    redirect(`/track/${token}`);
  }

  if (!isAuthed) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="text-xs font-medium text-zinc-500">
            Tracking access
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
            Verify to view shipment
          </h1>
          <div className="mt-2 text-sm text-zinc-600">
            Enter the last 4 digits of your phone number to access this tracking
            link.
          </div>

          {error ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              {error === "no_phone"
                ? "Tracking verification is not available because the customer phone number is missing. Please contact your logistics team."
                : "Incorrect code. Please try again."}
            </div>
          ) : null}

          <form
            action={authenticateAction.bind(null, token)}
            className="mt-6 space-y-3"
          >
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">
                Last 4 digits
              </div>
              <input
                name="pin"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{4}"
                maxLength={4}
                minLength={4}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                placeholder={customerLast4 ? "••••" : "1234"}
                required
              />
            </label>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Continue
            </button>
          </form>

          <div className="mt-6 text-xs text-zinc-500">
            Powered by Logistic •{" "}
            <Link href="/" className="hover:underline">
              Staff login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const steps = listCustomerVisibleSteps(shipment.id);
  const timelineSteps = steps.filter((s) => !s.is_external);
  const trackingSteps = steps.filter((s) => s.is_external);
  const docs = listCustomerVisibleDocuments(shipment.id);
  const requests = listCustomerDocumentRequests(shipment.id);
  const exceptions = listCustomerVisibleExceptions(shipment.id).filter(
    (e) => e.status === "OPEN",
  );

  async function uploadRequestedDocAction(
    token: string,
    requestId: number,
    formData: FormData,
  ) {
    "use server";
    const authed = await isTrackingSessionValid(token);
    if (!authed) redirect(`/track/${token}?error=auth`);

    const shipmentId = getShipmentIdForTrackingToken(token);
    if (!shipmentId) redirect(`/track/${token}?error=invalid`);

    const file = formData.get("file");
    if (!file || !(file instanceof File)) redirect(`/track/${token}?error=file`);

    const db = getDb();
    const req = queryOne<{ id: number; document_type: string; status: string }>(
      `
        SELECT id, document_type, status
        FROM document_requests
        WHERE id = ? AND shipment_id = ?
        LIMIT 1
      `,
      [requestId, shipmentId],
      db,
    );
    if (!req || req.status !== "OPEN") redirect(`/track/${token}?error=request`);

    const upload = await saveUpload({
      shipmentId,
      file,
      filePrefix: `CUSTOMER-${req.document_type}`,
    });

    inTransaction(db, () => {
      const docId = addDocument({
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

      markDocumentRequestFulfilled(req.id);

      logActivity({
        shipmentId,
        type: "CUSTOMER_DOCUMENT_UPLOADED",
        message: `Customer uploaded: ${req.document_type}`,
        actorUserId: null,
        data: { docId, requestId: req.id },
      });
    });

    refreshShipmentDerivedState({
      shipmentId,
      actorUserId: null,
      updateLastUpdate: true,
    });

    redirect(`/track/${token}?uploaded=1`);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-zinc-500">
              Tracking shipment
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
              {shipment.shipment_code}
            </h1>
            <div className="mt-2 text-sm text-zinc-600">
              {shipment.origin} → {shipment.destination}
            </div>
          </div>
          <Badge tone="zinc">{overallStatusLabel(shipment.overall_status)}</Badge>
        </div>

        {uploaded ? (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Document uploaded successfully. Thank you!
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 p-4">
            <div className="text-xs font-medium text-zinc-500">Last update</div>
            <div className="mt-1 text-sm text-zinc-900">
              {new Date(shipment.last_update_at).toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 p-4">
            <div className="text-xs font-medium text-zinc-500">ETA / ETD</div>
            <div className="mt-1 text-sm text-zinc-900">
              <span className="text-zinc-500">
                {shipment.etd ? new Date(shipment.etd).toLocaleDateString() : "—"}
              </span>{" "}
              /{" "}
              <span className="text-zinc-500">
                {shipment.eta ? new Date(shipment.eta).toLocaleDateString() : "—"}
              </span>
            </div>
          </div>
        </div>

        {exceptions.length ? (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-zinc-900">Updates</h2>
            <div className="mt-3 space-y-2">
              {exceptions.map((e) => (
                <div
                  key={e.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="text-sm font-medium text-zinc-900">
                      {e.exception_name}
                    </div>
                    <Badge tone={exceptionTone(e.default_risk)}>
                      {e.default_risk === "BLOCKED" ? "Blocked" : "At risk"}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                  <div className="mt-2 text-sm text-zinc-700">
                    {e.customer_message ??
                      "An issue occurred and our team is working on it. We will update you soon."}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-900">Timeline</h2>
          <div className="mt-3 space-y-2">
            {timelineSteps.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4"
              >
                <div className="text-sm font-medium text-zinc-900">
                  {s.sort_order}. {s.name}
                </div>
                <Badge tone={stepTone(s.status)}>{stepStatusLabel(s.status)}</Badge>
              </div>
            ))}
            {timelineSteps.length === 0 ? (
              <div className="text-sm text-zinc-500">No timeline available.</div>
            ) : null}
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-900">Tracking</h2>
          <div className="mt-3 space-y-2">
            {trackingSteps.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4"
              >
                <div className="text-sm font-medium text-zinc-900">
                  {s.sort_order}. {s.name}
                </div>
                <Badge tone={stepTone(s.status)}>{stepStatusLabel(s.status)}</Badge>
              </div>
            ))}
            {trackingSteps.length === 0 ? (
              <div className="text-sm text-zinc-500">No tracking steps yet.</div>
            ) : null}
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-900">Documents</h2>
          <div className="mt-3 space-y-2">
            {docs.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-900">
                    {d.document_type}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{d.file_name}</div>
                </div>
                <a
                  href={`/api/track/${token}/documents/${d.id}`}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Download
                </a>
              </div>
            ))}
            {docs.length === 0 ? (
              <div className="text-sm text-zinc-500">No documents shared yet.</div>
            ) : null}
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-900">
            Requested documents
          </h2>
          <div className="mt-3 space-y-3">
            {requests
              .filter((r) => r.status === "OPEN")
              .map((r) => (
                <div key={r.id} className="rounded-xl border border-zinc-200 p-4">
                  <div className="text-sm font-medium text-zinc-900">
                    {r.document_type}
                  </div>
                  {r.message ? (
                    <div className="mt-1 text-sm text-zinc-600">{r.message}</div>
                  ) : null}

                  <form
                    action={uploadRequestedDocAction.bind(null, token, r.id)}
                    className="mt-3 flex flex-wrap items-center gap-2"
                  >
                    <input
                      name="file"
                      type="file"
                      className="w-full max-w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      required
                    />
                    <button
                      type="submit"
                      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                    >
                      Upload
                    </button>
                  </form>
                </div>
              ))}

            {requests.filter((r) => r.status === "OPEN").length === 0 ? (
              <div className="text-sm text-zinc-500">
                No documents requested right now.
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-8 text-xs text-zinc-500">
          If you have questions, reply to your logistics contact.
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3 text-center text-xs text-zinc-500">
        <form action={logoutTrackingAction.bind(null, token)}>
          <button type="submit" className="hover:underline">
            Not you? Re-verify
          </button>
        </form>
        <div>
          Powered by Logistic •{" "}
          <Link href="/" className="hover:underline">
            Staff login
          </Link>
        </div>
      </div>
    </div>
  );
}
