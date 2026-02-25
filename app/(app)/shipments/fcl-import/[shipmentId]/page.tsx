import Link from "next/link";
import { redirect } from "next/navigation";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import {
  FclImportWorkspace,
  type FclCustomsTab,
  type FclMainTab,
  type FclOrderTab,
  type FclTrackingTab,
} from "@/components/shipments/fcl-import/FclImportWorkspace";
import { WorkflowDocumentsHub } from "@/components/shipments/shared/WorkflowDocumentsHub";
import { requireUser } from "@/lib/auth";
import { listDocumentRequests, listDocuments } from "@/lib/data/documents";
import {
  deleteDocumentAction,
  requestDocumentAction,
  reviewDocumentAction,
  updateDocumentFlagsAction,
  uploadDocumentAction,
} from "../../[shipmentId]/actions";
import {
  getShipment,
  getTrackingTokenForShipment,
  listShipmentCustomers,
  listShipmentJobIds,
  listShipmentSteps,
  syncShipmentStepsFromTemplate,
} from "@/lib/data/shipments";
import { requireShipmentAccess } from "@/lib/permissions";
import { parseStepFieldValues } from "@/lib/stepFields";
import { FCL_IMPORT_STEP_NAMES } from "@/lib/fclImport/constants";
import {
  extractContainerNumbers,
  normalizeContainerNumbers,
} from "@/lib/fclImport/helpers";
import { ensureFclImportTemplate } from "@/lib/fclImport/template";
import type { DocumentRow } from "@/lib/data/documents";
import { requestFclDocumentAction, updateFclStepAction } from "./actions";
import { listShipmentDocumentTypeOptions } from "@/lib/shipments/documentTypeOptions";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

type ShipmentPageProps = {
  params: Promise<{ shipmentId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function buildLatestDocMap(docs: DocumentRow[]) {
  const latest: Record<
    string,
    {
      id: number;
      file_name: string;
      uploaded_at: string;
      source: "STAFF" | "CUSTOMER";
      is_received: boolean;
      review_status?: "PENDING" | "VERIFIED" | "REJECTED";
      review_note?: string | null;
    }
  > = {};
  for (const doc of docs) {
    const key = String(doc.document_type);
    if (!latest[key]) {
      latest[key] = {
        id: doc.id,
        file_name: doc.file_name,
        uploaded_at: doc.uploaded_at,
        source: doc.source,
        is_received: doc.is_received === 1,
        review_status: doc.review_status,
        review_note: doc.review_note,
      };
    }
  }
  return latest;
}

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function asMainTab(value: string | undefined): FclMainTab | undefined {
  if (!value) return undefined;
  if (value === "order-overview" || value === "tracking" || value === "customs-clearance") {
    return value;
  }
  return undefined;
}

function asOrderTab(value: string | undefined): FclOrderTab | undefined {
  if (!value) return undefined;
  if (value === "order-received" || value === "container-list") {
    return value;
  }
  return undefined;
}

function asTrackingTab(value: string | undefined): FclTrackingTab | undefined {
  if (!value) return undefined;
  if (value === "vessel" || value === "container") {
    return value;
  }
  return undefined;
}

function asCustomsTab(value: string | undefined): FclCustomsTab | undefined {
  if (!value) return undefined;
  if (
    value === "bl" ||
    value === "delivery-order" ||
    value === "commercial-invoice" ||
    value === "bill-of-entry"
  ) {
    return value;
  }
  return undefined;
}

function errorMessage(error: string | undefined) {
  if (!error) return null;
  if (error === "tracking_sequence") {
    return "Tracking is sequential. Complete the previous checkpoint for each container first.";
  }
  if (error === "invalid") {
    return "Invalid request data.";
  }
  return "Could not save changes.";
}

export default async function FclImportShipmentPage({
  params,
  searchParams,
}: ShipmentPageProps) {
  const user = await requireUser();
  const { shipmentId } = await params;
  const id = Number(shipmentId);
  if (!id) redirect("/shipments");

  await requireShipmentAccess(user, id);

  const shipment = await getShipment(id);
  if (!shipment) redirect("/shipments");

  const [customers, jobIds, docs, docRequests, trackingToken] = await Promise.all([
    listShipmentCustomers(id),
    listShipmentJobIds(id),
    listDocuments(id),
    listDocumentRequests(id),
    getTrackingTokenForShipment(id),
  ]);
  const openDocRequestTypes = docRequests
    .filter((request) => request.status === "OPEN")
    .map((request) => String(request.document_type));

  const templateId = await ensureFclImportTemplate({ createdByUserId: user.id });
  let steps = await listShipmentSteps(id);
  const requiredSteps = [
    FCL_IMPORT_STEP_NAMES.vesselTracking,
    FCL_IMPORT_STEP_NAMES.containersDischarge,
    FCL_IMPORT_STEP_NAMES.containerPullOut,
    FCL_IMPORT_STEP_NAMES.containerDelivery,
    FCL_IMPORT_STEP_NAMES.orderReceived,
  ];

  if (shipment.workflow_template_id === templateId) {
    const hasTemplateSteps = requiredSteps.every((name) =>
      steps.some((step) => step.name === name),
    );
    if (!hasTemplateSteps) {
      const synced = await syncShipmentStepsFromTemplate({
        shipmentId: id,
        templateId,
        createdByUserId: shipment.created_by_user_id ?? user.id,
      });
      if (synced.added > 0) {
        steps = await listShipmentSteps(id);
      }
    }
  }

  const stepData = steps.map((step) => ({
    id: step.id,
    name: step.name,
    status: step.status,
    notes: step.notes ?? null,
    values: parseStepFieldValues(step.field_values_json),
  }));

  const creationStep = stepData.find(
    (step) => step.name === FCL_IMPORT_STEP_NAMES.shipmentCreation,
  );
  let containerNumbers = extractContainerNumbers(creationStep?.values ?? {});
  if (!containerNumbers.length) {
    containerNumbers = normalizeContainerNumbers([shipment.container_number ?? ""]);
  }

  const hasTemplateSteps = requiredSteps.every((name) =>
    stepData.some((step) => step.name === name),
  );
  const workflowDocumentTypeOptions = listShipmentDocumentTypeOptions(steps);

  if (!hasTemplateSteps) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="text-sm text-slate-500">
          <Link href="/shipments" className="hover:underline">
            Shipments
          </Link>{" "}
          <span className="text-slate-400">/</span> {shipment.shipment_code}
        </div>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          This shipment was not created with the FCL Import Clearance workflow.
          <div className="mt-4">
            <Link
              href={`/shipments/${shipment.id}`}
              className="rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-amber-900 shadow-sm"
            >
              Open classic shipment view
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const resolved = searchParams ? await Promise.resolve(searchParams) : {};
  const initialTab = asMainTab(readParam(resolved, "tab"));
  const initialOrderTab = asOrderTab(readParam(resolved, "orderTab"));
  const initialTrackingTab = asTrackingTab(readParam(resolved, "trackingTab"));
  const initialCustomsTab = asCustomsTab(readParam(resolved, "customsTab"));
  const error = readParam(resolved, "error");
  const activeMainTab = initialTab ?? "order-overview";
  const docsParams = new URLSearchParams();
  docsParams.set("tab", activeMainTab);
  if (activeMainTab === "order-overview") {
    docsParams.set("orderTab", initialOrderTab ?? "order-received");
  } else if (activeMainTab === "tracking") {
    docsParams.set("trackingTab", initialTrackingTab ?? "vessel");
  } else {
    docsParams.set("customsTab", initialCustomsTab ?? "bl");
  }
  const docsReturnTo = `/shipments/fcl-import/${shipment.id}?${docsParams.toString()}`;

  return (
    <div className={`${bodyFont.className} min-h-screen space-y-4`}>
      {errorMessage(error) ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(error)}
        </div>
      ) : null}
      <FclImportWorkspace
        headingClassName={headingFont.className}
        shipment={shipment}
        customers={customers}
        steps={stepData}
        jobIds={jobIds}
        containerNumbers={containerNumbers}
        latestDocsByType={buildLatestDocMap(docs)}
        openDocRequestTypes={openDocRequestTypes}
        trackingToken={trackingToken}
        canEdit={["ADMIN", "OPERATIONS", "CLEARANCE", "SALES"].includes(user.role)}
        canAdminEdit={user.role === "ADMIN"}
        updateAction={updateFclStepAction.bind(null, shipment.id)}
        requestDocumentAction={requestFclDocumentAction.bind(null, shipment.id)}
        initialTab={initialTab}
        initialOrderTab={initialOrderTab}
        initialTrackingTab={initialTrackingTab}
        initialCustomsTab={initialCustomsTab}
      />
      <WorkflowDocumentsHub
        shipmentId={shipment.id}
        docs={docs.map((doc) => ({
          id: doc.id,
          document_type: String(doc.document_type),
          file_name: doc.file_name,
          uploaded_at: doc.uploaded_at,
          source: doc.source,
          is_required: doc.is_required,
          is_received: doc.is_received,
          share_with_customer: doc.share_with_customer,
          review_status: doc.review_status,
        }))}
        docRequests={docRequests.map((request) => ({
          id: request.id,
          document_type: String(request.document_type),
          status: request.status,
        }))}
        documentTypeOptions={workflowDocumentTypeOptions}
        canEdit={["ADMIN", "OPERATIONS", "CLEARANCE", "SALES"].includes(user.role)}
        returnTo={docsReturnTo}
        uploadDocumentAction={uploadDocumentAction.bind(null, shipment.id)}
        requestDocumentAction={requestDocumentAction.bind(null, shipment.id)}
        reviewDocumentAction={reviewDocumentAction.bind(null, shipment.id)}
        updateDocumentFlagsAction={updateDocumentFlagsAction.bind(null, shipment.id)}
        deleteDocumentAction={deleteDocumentAction.bind(null, shipment.id)}
      />
    </div>
  );
}
