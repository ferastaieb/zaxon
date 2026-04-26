import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CustomerPortalShell } from "@/components/tracking/public/CustomerPortalShell";
import { FtlClientTrackView } from "@/components/tracking/public/FtlClientTrackView";
import { LegacyTrackView } from "@/components/tracking/public/LegacyTrackView";
import {
  addDocument,
  listDocumentRequests,
  markDocumentRequestFulfilled,
} from "@/lib/data/documents";
import { logActivity } from "@/lib/data/activities";
import { getShipment, listShipmentSteps } from "@/lib/data/shipments";
import {
  getTrackingCustomerContext,
  getTrackingCustomerPhoneLast4,
  getTrackingShipmentById,
  listCustomerDocumentRequests,
  listCustomerVisibleDocuments,
  listCustomerVisibleExceptions,
  listCustomerVisibleSteps,
  listTrackingPortalShipments,
  shipmentBelongsToTrackingCustomer,
} from "@/lib/data/tracking";
import { getWorkflowTemplate } from "@/lib/data/workflows";
import { FTL_EXPORT_TEMPLATE_NAME, FTL_EXPORT_STEP_NAMES } from "@/lib/ftlExport/constants";
import {
  buildFtlClientTrackingViewModel,
  type FtlClientTrackingStep,
  type FtlClientTrackingTab,
} from "@/lib/ftlExport/clientTrackingView";
import { refreshShipmentDerivedState } from "@/lib/services/shipmentDerived";
import { saveUpload } from "@/lib/storage";
import {
  clearTrackingSessionCookie,
  createTrackingSession,
  deleteTrackingSession,
  getTrackingSessionToken,
  getTrackingSessionCustomerPartyId,
  isTrackingSessionValid,
} from "@/lib/trackingAuth";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseShipmentId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function parseTab(value: string | undefined): FtlClientTrackingTab {
  if (value === "trucks" || value === "documents" || value === "tracking") return value;
  return "overview";
}

function fallbackIsFtlStepSet(stepNames: Set<string>) {
  return (
    stepNames.has(FTL_EXPORT_STEP_NAMES.exportPlanOverview) &&
    stepNames.has(FTL_EXPORT_STEP_NAMES.trucksDetails) &&
    stepNames.has(FTL_EXPORT_STEP_NAMES.loadingDetails) &&
    stepNames.has(FTL_EXPORT_STEP_NAMES.customsAgentsAllocation)
  );
}

function buildTrackHref(input: {
  token: string;
  shipmentId?: number | null;
  uploaded?: boolean;
  error?: string | null;
}) {
  const params = new URLSearchParams();
  if (input.shipmentId) {
    params.set("shipment", String(input.shipmentId));
  }
  if (input.uploaded) {
    params.set("uploaded", "1");
  }
  if (input.error) {
    params.set("error", input.error);
  }
  const query = params.toString();
  return query ? `/track/${input.token}?${query}` : `/track/${input.token}`;
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
  const customerContext = await getTrackingCustomerContext(token);
  if (!customerContext) notFound();

  const isAuthed = await isTrackingSessionValid(token);
  const customerLast4 =
    customerContext.customer_phone_last4 ?? (await getTrackingCustomerPhoneLast4(token));

  async function authenticateAction(tokenValue: string, formData: FormData) {
    "use server";
    const context = await getTrackingCustomerContext(tokenValue);
    const expected = context?.customer_phone_last4 ?? null;
    if (!context || !expected) {
      redirect(buildTrackHref({ token: tokenValue, error: "no_phone" }));
    }

    const pin = String(formData.get("pin") ?? "")
      .trim()
      .replace(/\D+/g, "");
    if (pin.length !== 4 || pin !== expected) {
      redirect(buildTrackHref({ token: tokenValue, error: "pin" }));
    }

    await createTrackingSession({
      trackingToken: tokenValue,
      customerPartyId: context.customer_party_id,
    });
    redirect(buildTrackHref({ token: tokenValue, shipmentId: context.seed_shipment_id }));
  }

  async function logoutTrackingAction(tokenValue: string) {
    "use server";
    const sessionToken = await getTrackingSessionToken();
    if (sessionToken) await deleteTrackingSession(sessionToken);
    await clearTrackingSessionCookie();
    redirect(buildTrackHref({ token: tokenValue }));
  }

  if (!isAuthed) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="text-xs font-medium text-zinc-500">Tracking access</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
            Verify to view shipments
          </h1>
          <div className="mt-2 text-sm text-zinc-600">
            Enter the last 4 digits of your phone number to access this customer portal.
          </div>

          {error ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              {error === "no_phone"
                ? "Tracking verification is not available because the customer phone number is missing. Please contact your logistics team."
                : "Incorrect code. Please try again."}
            </div>
          ) : null}

          <form action={authenticateAction.bind(null, token)} className="mt-6 space-y-3">
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Last 4 digits</div>
              <input
                name="pin"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{4}"
                maxLength={4}
                minLength={4}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                placeholder={customerLast4 ? "****" : "1234"}
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
            Powered by Logistic -{" "}
            <Link href="/" className="hover:underline">
              Staff login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const portalShipments = await listTrackingPortalShipments(customerContext.customer_party_id);
  if (!portalShipments.length) notFound();

  const requestedShipmentId = parseShipmentId(readParam(resolved, "shipment"));
  const requestedSummary = requestedShipmentId
    ? portalShipments.find((shipment) => shipment.id === requestedShipmentId) ?? null
    : null;
  const seedSummary =
    portalShipments.find((shipment) => shipment.id === customerContext.seed_shipment_id) ?? null;
  const firstVisibleSummary =
    portalShipments.find((shipment) => shipment.has_portal_content) ?? null;
  const selectedSummary =
    requestedSummary ?? seedSummary ?? firstVisibleSummary ?? portalShipments[0] ?? null;
  if (!selectedSummary) notFound();

  if (
    requestedShipmentId &&
    (!requestedSummary ||
      (!requestedSummary.has_portal_content &&
        requestedSummary.id !== customerContext.seed_shipment_id))
  ) {
    redirect(
      buildTrackHref({
        token,
        shipmentId: (firstVisibleSummary ?? seedSummary ?? selectedSummary).id,
      }),
    );
  }

  const selectedShipment = await getTrackingShipmentById(selectedSummary.id);
  if (!selectedShipment) notFound();

  const [fullShipment, allSteps, docs, requests, exceptions] = await Promise.all([
    getShipment(selectedSummary.id),
    listShipmentSteps(selectedSummary.id),
    listCustomerVisibleDocuments(selectedSummary.id),
    listCustomerDocumentRequests(selectedSummary.id),
    listCustomerVisibleExceptions(selectedSummary.id),
  ]);

  const workflowTemplate = fullShipment?.workflow_template_id
    ? await getWorkflowTemplate(fullShipment.workflow_template_id)
    : null;
  const stepNames = new Set(allSteps.map((step) => step.name));
  const isFtl =
    (workflowTemplate?.name?.toLowerCase() ?? "") === FTL_EXPORT_TEMPLATE_NAME.toLowerCase() ||
    fallbackIsFtlStepSet(stepNames);

  async function uploadRequestedDocAction(
    tokenValue: string,
    shipmentId: number,
    requestId: number,
    formData: FormData,
  ) {
    "use server";
    const authed = await isTrackingSessionValid(tokenValue);
    if (!authed) {
      redirect(buildTrackHref({ token: tokenValue, shipmentId, error: "auth" }));
    }

    const customerPartyId = await getTrackingSessionCustomerPartyId(tokenValue);
    if (!customerPartyId) {
      redirect(buildTrackHref({ token: tokenValue, shipmentId, error: "auth" }));
    }

    const canAccessShipment = await shipmentBelongsToTrackingCustomer(
      customerPartyId,
      shipmentId,
    );
    if (!canAccessShipment) {
      redirect(buildTrackHref({ token: tokenValue, shipmentId, error: "invalid" }));
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      redirect(buildTrackHref({ token: tokenValue, shipmentId, error: "file" }));
    }

    const req = (await listDocumentRequests(shipmentId)).find(
      (request) => request.id === requestId,
    );
    if (!req || req.status !== "OPEN") {
      redirect(buildTrackHref({ token: tokenValue, shipmentId, error: "request" }));
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

    redirect(buildTrackHref({ token: tokenValue, shipmentId, uploaded: true }));
  }

  const detail = isFtl ? (
    <FtlClientTrackView
      token={token}
      shipmentId={selectedSummary.id}
      uploaded={uploaded}
      activeTab={parseTab(readParam(resolved, "tab"))}
      viewModel={buildFtlClientTrackingViewModel({
        shipment: {
          id: selectedShipment.id,
          shipment_code: selectedShipment.shipment_code,
          origin: selectedShipment.origin,
          destination: selectedShipment.destination,
          overall_status: selectedShipment.overall_status,
          cargo_description: fullShipment?.cargo_description ?? null,
          last_update_at: selectedShipment.last_update_at,
          created_at: fullShipment?.created_at ?? selectedShipment.last_update_at,
        },
        customer_address: customerContext.customer_address,
        steps: allSteps.map((step) => ({
          id: step.id,
          name: step.name,
          status: step.status,
          field_values_json: step.field_values_json,
        })) as FtlClientTrackingStep[],
        docs,
        requests,
        exceptions,
      })}
      exceptions={exceptions.filter((row) => row.status === "OPEN")}
      requests={requests}
      uploadRequestedDocAction={uploadRequestedDocAction.bind(null, token, selectedSummary.id)}
    />
  ) : (
    <LegacyTrackView
      token={token}
      shipment={selectedShipment}
      uploaded={uploaded}
      steps={await listCustomerVisibleSteps(selectedSummary.id)}
      docs={docs}
      requests={requests}
      exceptions={exceptions.filter((row) => row.status === "OPEN")}
      uploadRequestedDocAction={uploadRequestedDocAction.bind(null, token, selectedSummary.id)}
    />
  );

  return (
    <CustomerPortalShell
      token={token}
      customerName={customerContext.customer_name}
      customerPhone={customerContext.customer_phone}
      currentShipmentId={selectedSummary.id}
      shipments={portalShipments}
      logoutTrackingAction={logoutTrackingAction.bind(null, token)}
    >
      {detail}
    </CustomerPortalShell>
  );
}
