import Link from "next/link";
import { redirect } from "next/navigation";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import { ImportTransferOwnershipWorkspace, type ImportTransferTab } from "@/components/shipments/import-transfer-ownership/ImportTransferOwnershipWorkspace";
import { WorkflowDocumentsHub } from "@/components/shipments/shared/WorkflowDocumentsHub";
import { requireUser } from "@/lib/auth";
import {
  listDocumentRequests,
  listDocuments,
  type DocumentRow,
} from "@/lib/data/documents";
import {
  getShipment,
  listShipmentSteps,
  syncShipmentStepsFromTemplate,
} from "@/lib/data/shipments";
import { listFtlImportCandidates } from "@/lib/ftlExport/importCandidates";
import {
  IMPORT_TRANSFER_OWNERSHIP_OPERATIONS_STEPS,
} from "@/lib/importTransferOwnership/constants";
import { ensureImportTransferOwnershipTemplate } from "@/lib/importTransferOwnership/template";
import { requireShipmentAccess } from "@/lib/permissions";
import { parseStepFieldSchema, parseStepFieldValues } from "@/lib/stepFields";
import {
  deleteDocumentAction,
  requestDocumentAction,
  reviewDocumentAction,
  updateDocumentFlagsAction,
  uploadDocumentAction,
} from "../../[shipmentId]/actions";
import { updateImportTransferStepAction } from "./actions";
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

const MAIN_TABS: readonly ImportTransferTab[] = [
  "overview",
  "parties-cargo",
  "documents-boe",
  "collection-outcome",
  "stock-view",
];

function asMainTab(value: string | undefined): ImportTransferTab | undefined {
  if (!value) return undefined;
  return MAIN_TABS.includes(value as ImportTransferTab)
    ? (value as ImportTransferTab)
    : undefined;
}

function buildLatestDocMap(docs: DocumentRow[]) {
  const latest: Record<
    string,
    {
      id: number;
      file_name: string;
      uploaded_at: string;
      count?: number;
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
        count: 1,
        source: doc.source,
        is_received: doc.is_received === 1,
        review_status: doc.review_status,
        review_note: doc.review_note,
      };
    } else {
      latest[key].count = (latest[key].count ?? 1) + 1;
    }
  }
  return latest;
}

function errorMessage(error: string | null) {
  if (!error) return null;
  if (error === "invalid") {
    return "Invalid request data.";
  }
  return null;
}

export default async function ImportTransferOwnershipShipmentPage({
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

  const templateId = await ensureImportTransferOwnershipTemplate({
    createdByUserId: user.id,
  });
  let steps = await listShipmentSteps(id);

  if (shipment.workflow_template_id === templateId) {
    const hasTemplateSteps = IMPORT_TRANSFER_OWNERSHIP_OPERATIONS_STEPS.every((name) =>
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

  const [docs, docRequests, importCandidates] = await Promise.all([
    listDocuments(id),
    listDocumentRequests(id),
    listFtlImportCandidates({
      userId: user.id,
      role: user.role,
      currentShipmentId: 0,
    }),
  ]);

  const stepData = steps.map((step) => ({
    id: step.id,
    name: step.name,
    status: step.status,
    notes: step.notes ?? null,
    values: parseStepFieldValues(step.field_values_json),
    schema: parseStepFieldSchema(step.field_schema_json),
  }));

  const hasTemplateSteps = IMPORT_TRANSFER_OWNERSHIP_OPERATIONS_STEPS.every((name) =>
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
          This shipment is not using the Import Transfer of Ownership workflow template.
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

  const candidate = importCandidates.find((entry) => entry.shipmentId === id);
  const importedQuantity = candidate?.importedQuantity ?? 0;
  const importedWeight = candidate?.importedWeight ?? 0;
  const exportedQuantity = candidate?.alreadyAllocatedQuantity ?? 0;
  const exportedWeight = candidate?.alreadyAllocatedWeight ?? 0;

  const resolved = searchParams ? await Promise.resolve(searchParams) : {};
  const error = typeof resolved.error === "string" ? resolved.error : null;
  const initialTab = asMainTab(typeof resolved.tab === "string" ? resolved.tab : undefined);
  const docsReturnTo = `/shipments/import-transfer-ownership/${shipment.id}?tab=${
    initialTab ?? "overview"
  }`;

  return (
    <div className={`${bodyFont.className} min-h-screen space-y-4`}>
      {errorMessage(error) ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(error)}
        </div>
      ) : null}
      <ImportTransferOwnershipWorkspace
        headingClassName={headingFont.className}
        shipment={shipment}
        steps={stepData}
        latestDocsByType={buildLatestDocMap(docs)}
        canEdit={["ADMIN", "OPERATIONS", "CLEARANCE", "SALES"].includes(user.role)}
        isAdmin={user.role === "ADMIN"}
        updateAction={updateImportTransferStepAction.bind(null, shipment.id)}
        initialTab={initialTab}
        stockSummary={{
          importedQuantity,
          importedWeight,
          exportedQuantity,
          exportedWeight,
          remainingQuantity: importedQuantity - exportedQuantity,
          remainingWeight: importedWeight - exportedWeight,
          stockType: candidate?.nonPhysicalStock ? "OWNERSHIP_STOCK" : "WAREHOUSE_STOCK",
          allocationHistory: candidate?.allocationHistory ?? [],
        }}
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
