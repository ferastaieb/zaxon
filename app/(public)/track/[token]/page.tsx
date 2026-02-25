import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
  getShipmentIdForTrackingToken,
  getTrackingCustomerPhoneLast4,
  getTrackingShipment,
  listCustomerVisibleExceptions,
  listCustomerDocumentRequests,
  listCustomerVisibleDocuments,
  listCustomerVisibleSteps,
  listTrackingConnectedShipments,
} from "@/lib/data/tracking";
import { getWorkflowTemplate } from "@/lib/data/workflows";
import { FCL_IMPORT_TEMPLATE_NAME } from "@/lib/fclImport/constants";
import { FTL_EXPORT_TEMPLATE_NAME, FTL_EXPORT_STEP_NAMES } from "@/lib/ftlExport/constants";
import {
  buildFtlClientTrackingViewModel,
  type FtlClientTrackingSubTab,
  type FtlClientTrackingTab,
  type FtlClientTrackingStep,
} from "@/lib/ftlExport/clientTrackingView";
import { refreshShipmentDerivedState } from "@/lib/services/shipmentDerived";
import { saveUpload } from "@/lib/storage";
import {
  clearTrackingSessionCookie,
  createTrackingSession,
  deleteTrackingSession,
  getTrackingSessionToken,
  isTrackingSessionValid,
} from "@/lib/trackingAuth";
import type { TrackingRegion } from "@/components/shipments/ftl-export/forms/trackingTimelineConfig";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseTab(value: string | undefined): FtlClientTrackingTab {
  if (value === "tracking" || value === "documents" || value === "cargo") return value;
  return "overview";
}

function parseTrackingTab(value: string | undefined): FtlClientTrackingSubTab {
  if (value === "loading" || value === "international") return value;
  return "overview";
}

function parseRegion(value: string | undefined): TrackingRegion | null {
  if (!value) return null;
  if (
    value === "uae" ||
    value === "ksa" ||
    value === "jordan" ||
    value === "syria" ||
    value === "mushtarakah" ||
    value === "lebanon"
  ) {
    return value;
  }
  return null;
}

function parseTruck(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.trunc(parsed);
}

function fallbackIsFtlStepSet(stepNames: Set<string>) {
  return (
    stepNames.has(FTL_EXPORT_STEP_NAMES.exportPlanOverview) &&
    stepNames.has(FTL_EXPORT_STEP_NAMES.trucksDetails) &&
    stepNames.has(FTL_EXPORT_STEP_NAMES.loadingDetails) &&
    stepNames.has(FTL_EXPORT_STEP_NAMES.customsAgentsAllocation)
  );
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
  const shipment = await getTrackingShipment(token);
  if (!shipment) notFound();

  const fullShipment = await getShipment(shipment.id);
  const workflowTemplate = fullShipment?.workflow_template_id
    ? await getWorkflowTemplate(fullShipment.workflow_template_id)
    : null;

  if (
    workflowTemplate?.name &&
    workflowTemplate.name.toLowerCase() === FCL_IMPORT_TEMPLATE_NAME.toLowerCase()
  ) {
    redirect(`/track/fcl/${token}`);
  }

  const isAuthed = await isTrackingSessionValid(token);
  const customerLast4 = await getTrackingCustomerPhoneLast4(token);

  async function authenticateAction(tokenValue: string, formData: FormData) {
    "use server";
    const expected = await getTrackingCustomerPhoneLast4(tokenValue);
    if (!expected) redirect(`/track/${tokenValue}?error=no_phone`);

    const pin = String(formData.get("pin") ?? "")
      .trim()
      .replace(/\D+/g, "");
    if (pin.length !== 4) redirect(`/track/${tokenValue}?error=pin`);
    if (pin !== expected) redirect(`/track/${tokenValue}?error=pin`);

    await createTrackingSession(tokenValue);
    redirect(`/track/${tokenValue}`);
  }

  async function logoutTrackingAction(tokenValue: string) {
    "use server";
    const sessionToken = await getTrackingSessionToken();
    if (sessionToken) await deleteTrackingSession(sessionToken);
    await clearTrackingSessionCookie();
    redirect(`/track/${tokenValue}`);
  }

  if (!isAuthed) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="text-xs font-medium text-zinc-500">Tracking access</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
            Verify to view shipment
          </h1>
          <div className="mt-2 text-sm text-zinc-600">
            Enter the last 4 digits of your phone number to access this tracking link.
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

  const [docs, requests, exceptions, connectedShipments, allSteps] = await Promise.all([
    listCustomerVisibleDocuments(shipment.id),
    listCustomerDocumentRequests(shipment.id),
    listCustomerVisibleExceptions(shipment.id),
    listTrackingConnectedShipments(shipment.id),
    listShipmentSteps(shipment.id),
  ]);

  const visibleConnected = connectedShipments.filter((row) => row.tracking_token);
  const openExceptions = exceptions.filter((row) => row.status === "OPEN");

  async function uploadRequestedDocAction(tokenValue: string, requestId: number, formData: FormData) {
    "use server";
    const authed = await isTrackingSessionValid(tokenValue);
    if (!authed) redirect(`/track/${tokenValue}?error=auth`);

    const shipmentId = await getShipmentIdForTrackingToken(tokenValue);
    if (!shipmentId) redirect(`/track/${tokenValue}?error=invalid`);

    const file = formData.get("file");
    if (!file || !(file instanceof File)) redirect(`/track/${tokenValue}?error=file`);

    const req = (await listDocumentRequests(shipmentId)).find((request) => request.id === requestId);
    if (!req || req.status !== "OPEN") redirect(`/track/${tokenValue}?error=request`);

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

    await refreshShipmentDerivedState({ shipmentId, actorUserId: null, updateLastUpdate: true });

    redirect(`/track/${tokenValue}?uploaded=1`);
  }

  const stepNames = new Set(allSteps.map((step) => step.name));
  const isFtl =
    (workflowTemplate?.name?.toLowerCase() ?? "") === FTL_EXPORT_TEMPLATE_NAME.toLowerCase() ||
    fallbackIsFtlStepSet(stepNames);

  if (isFtl) {
    const viewModel = buildFtlClientTrackingViewModel({
      shipment: {
        id: shipment.id,
        shipment_code: shipment.shipment_code,
        origin: shipment.origin,
        destination: shipment.destination,
        overall_status: shipment.overall_status,
        cargo_description: fullShipment?.cargo_description ?? null,
        last_update_at: shipment.last_update_at,
        created_at: fullShipment?.created_at ?? shipment.last_update_at,
      },
      steps: allSteps.map((step) => ({
        id: step.id,
        name: step.name,
        status: step.status,
        field_values_json: step.field_values_json,
      })) as FtlClientTrackingStep[],
      docs,
      connectedShipments: visibleConnected,
      exceptions: openExceptions,
      requests,
    });

    return (
      <FtlClientTrackView
        token={token}
        shipmentCode={shipment.shipment_code}
        uploaded={uploaded}
        activeTab={parseTab(readParam(resolved, "tab"))}
        activeTrackingTab={parseTrackingTab(readParam(resolved, "trackingTab"))}
        activeRegion={parseRegion(readParam(resolved, "region"))}
        activeTruck={parseTruck(readParam(resolved, "truck"))}
        viewModel={viewModel}
        connectedShipments={visibleConnected}
        exceptions={openExceptions}
        requests={requests}
        uploadRequestedDocAction={uploadRequestedDocAction.bind(null, token)}
        logoutTrackingAction={logoutTrackingAction.bind(null, token)}
      />
    );
  }

  const steps = await listCustomerVisibleSteps(shipment.id);

  return (
    <LegacyTrackView
      token={token}
      shipment={shipment}
      uploaded={uploaded}
      steps={steps}
      docs={docs}
      requests={requests}
      exceptions={openExceptions}
      connectedShipments={visibleConnected}
      uploadRequestedDocAction={uploadRequestedDocAction.bind(null, token)}
      logoutTrackingAction={logoutTrackingAction.bind(null, token)}
    />
  );
}
