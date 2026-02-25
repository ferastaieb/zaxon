import Link from "next/link";
import { redirect } from "next/navigation";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import {
  LtlMasterWorkspace,
  type LtlMasterSubshipmentView,
} from "@/components/shipments/ltl-master/LtlMasterWorkspace";
import { WorkflowDocumentsHub } from "@/components/shipments/shared/WorkflowDocumentsHub";
import { requireUser } from "@/lib/auth";
import { listDocumentRequests, listDocuments } from "@/lib/data/documents";
import { listParties } from "@/lib/data/parties";
import {
  getShipment,
  listShipmentSteps,
  listSubshipmentsForMaster,
  syncShipmentStepsFromTemplate,
} from "@/lib/data/shipments";
import { requireShipmentAccess } from "@/lib/permissions";
import { parseStepFieldSchema, parseStepFieldValues, encodeFieldPath, stepFieldDocType } from "@/lib/stepFields";
import {
  LTL_MASTER_JAFZA_SYRIA_OPERATIONS_STEPS,
  LTL_MASTER_JAFZA_SYRIA_TRACKING_STEPS,
  LTL_SUBSHIPMENT_STEP_NAMES,
} from "@/lib/ltlMasterJafzaSyria/constants";
import { parseSubshipmentImportRows, toRecord } from "@/lib/ltlMasterJafzaSyria/helpers";
import {
  computeLtlMasterStatuses,
  computeLtlSubshipmentStatuses,
} from "@/lib/ltlMasterJafzaSyria/status";
import { ensureLtlMasterJafzaSyriaTemplate } from "@/lib/ltlMasterJafzaSyria/template";
import { listFtlImportCandidates } from "@/lib/ftlExport/importCandidates";
import {
  deleteDocumentAction,
  requestDocumentAction,
  reviewDocumentAction,
  updateDocumentFlagsAction,
  uploadDocumentAction,
} from "../../[shipmentId]/actions";
import { listShipmentDocumentTypeOptions } from "@/lib/shipments/documentTypeOptions";
import {
  closeMasterLoadingAction,
  createSubshipmentAction,
  saveMasterWarehouseArrivalAction,
  updateMasterStepAction,
  updateSubshipmentHandoverAction,
  updateSubshipmentLoadingAction,
} from "./actions";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

type MasterShipmentPageProps = {
  params: Promise<{ shipmentId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function buildLatestDocMap(
  docs: Array<{
    id: number;
    file_name: string;
    uploaded_at: string;
    source: "STAFF" | "CUSTOMER";
    is_received: 0 | 1;
    review_status?: "PENDING" | "VERIFIED" | "REJECTED";
    review_note?: string | null;
    document_type: string;
  }>,
) {
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
  if (error === "invoice_prereq") {
    return "Export invoice can be finalized only after loading is done.";
  }
  if (error === "tracking_locked") {
    return "Tracking is locked until loading and export invoice are done.";
  }
  if (error === "tracking_agent_required") {
    return "Assign corresponding customs agents before updating tracking steps.";
  }
  if (error === "customs_naseeb_locked") {
    return "Naseeb border clearance is restricted to ZAXON for this workflow.";
  }
  if (error === "import_reference_invalid") {
    return "Import references must come from valid import shipments with valid allocation.";
  }
  if (error === "import_reference_required") {
    return "At least one import reference is required for customer shipment.";
  }
  if (error === "totals_mismatch") {
    return "Total cargo weight and volume must match the sum of selected reference allocations.";
  }
  if (error === "customer_required") {
    return "Select a customer for the subshipment.";
  }
  if (error === "loading_required") {
    return "Loaded rows require confirmed weight, volume, and photo.";
  }
  if (error === "offload_required") {
    return "Complete master offload before customer pickup/delivery.";
  }
  if (error === "handover_method_required") {
    return "Handover method is required.";
  }
  if (error === "handover_date_required") {
    return "Collection/Delivery completion requires its date.";
  }
  if (error === "arrival_date_required") {
    return "Arrival date is required when arrived checkbox is selected.";
  }
  if (error === "offload_date_required") {
    return "Offload date is required when offloaded checkbox is selected.";
  }
  if (error === "subshipment_invalid") {
    return "Invalid customer subshipment record.";
  }
  return "Could not save changes.";
}

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function MasterShipmentPage({
  params,
  searchParams,
}: MasterShipmentPageProps) {
  const user = await requireUser();
  const { shipmentId } = await params;
  const id = Number(shipmentId);
  if (!id) redirect("/shipments");

  await requireShipmentAccess(user, id);

  const shipment = await getShipment(id);
  if (!shipment) redirect("/shipments");
  if (shipment.shipment_kind !== "MASTER") {
    redirect(`/shipments/${id}`);
  }

  const templateId = await ensureLtlMasterJafzaSyriaTemplate({
    createdByUserId: user.id,
  });

  let steps = await listShipmentSteps(id);
  const requiredStepNames = [
    ...LTL_MASTER_JAFZA_SYRIA_OPERATIONS_STEPS,
    ...LTL_MASTER_JAFZA_SYRIA_TRACKING_STEPS,
  ];

  if (shipment.workflow_template_id === templateId) {
    const hasAll = requiredStepNames.every((name) =>
      steps.some((step) => step.name === name),
    );
    if (!hasAll) {
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

  const [docs, docRequests, customers, brokers, subshipments, importCandidates] = await Promise.all([
    listDocuments(id),
    listDocumentRequests(id),
    listParties({ type: "CUSTOMER" }),
    listParties({ type: "CUSTOMS_BROKER" }),
    listSubshipmentsForMaster(id),
    listFtlImportCandidates({
      userId: user.id,
      role: user.role,
      currentShipmentId: id,
    }),
  ]);

  const masterStepData = steps.map((step) => ({
    id: step.id,
    name: step.name,
    status: step.status,
    notes: step.notes ?? null,
    values: parseStepFieldValues(step.field_values_json),
    schema: parseStepFieldSchema(step.field_schema_json),
  }));

  const masterDocsByType = new Set(
    docs
      .filter((doc) => doc.is_received)
      .map((doc) => String(doc.document_type)),
  );

  const subshipmentViews: LtlMasterSubshipmentView[] = [];
  const subshipmentStatuses: ReturnType<typeof computeLtlSubshipmentStatuses>[] = [];
  const extraAllocatedBySource = new Map<string, { weight: number; quantity: number }>();
  const extraAllocationHistoryBySource = new Map<
    string,
    Array<{
      exportShipmentId: number;
      exportShipmentCode: string;
      exportDate: string;
      allocatedWeight: number;
      allocatedQuantity: number;
    }>
  >();

  for (const subshipment of subshipments) {
    const [subSteps, subDocs] = await Promise.all([
      listShipmentSteps(subshipment.id),
      listDocuments(subshipment.id),
    ]);

    const stepByName: Record<string, { id: number; values: Record<string, unknown> } | undefined> = {};
    for (const step of subSteps) {
      stepByName[step.name] = {
        id: step.id,
        values: toRecord(parseStepFieldValues(step.field_values_json)),
      };
    }

    const subDocTypes = new Set(
      subDocs
        .filter((doc) => doc.is_received)
        .map((doc) => String(doc.document_type)),
    );

    const status = computeLtlSubshipmentStatuses({
      stepsByName: stepByName,
      docTypes: subDocTypes,
    });
    subshipmentStatuses.push(status);

    const detailsStep = stepByName[LTL_SUBSHIPMENT_STEP_NAMES.detailsAndImports];
    const loadingStep = stepByName[LTL_SUBSHIPMENT_STEP_NAMES.loadingExecution];
    const handoverStep = stepByName[LTL_SUBSHIPMENT_STEP_NAMES.finalHandover];

    const detailsValues = detailsStep?.values ?? {};
    const loadingValues = loadingStep?.values ?? {};
    const handoverValues = handoverStep?.values ?? {};

    const detailsRows = parseSubshipmentImportRows(detailsValues);
    for (const row of detailsRows) {
      const sourceId = row.source_shipment_id.trim();
      if (!sourceId) continue;
      const current = extraAllocatedBySource.get(sourceId) ?? { weight: 0, quantity: 0 };
      current.weight += row.allocated_weight;
      current.quantity += row.allocated_quantity;
      extraAllocatedBySource.set(sourceId, current);

      if (row.allocated_weight > 0 || row.allocated_quantity > 0) {
        const historyRows = extraAllocationHistoryBySource.get(sourceId) ?? [];
        historyRows.push({
          exportShipmentId: subshipment.id,
          exportShipmentCode: subshipment.shipment_code,
          exportDate: subshipment.last_update_at || subshipment.created_at || "",
          allocatedWeight: row.allocated_weight,
          allocatedQuantity: row.allocated_quantity,
        });
        extraAllocationHistoryBySource.set(sourceId, historyRows);
      }
    }

    const loadingPhotoDocType = loadingStep
      ? stepFieldDocType(loadingStep.id, encodeFieldPath(["loading_photos"]))
      : "";
    const loadingPhotoDoc = loadingPhotoDocType
      ? subDocs.find((doc) => String(doc.document_type) === loadingPhotoDocType)
      : null;

    subshipmentViews.push({
      id: subshipment.id,
      shipment_code: subshipment.shipment_code,
      customer_name: subshipment.customer_names ?? "",
      details_step_id: detailsStep?.id ?? null,
      loading_step_id: loadingStep?.id ?? null,
      handover_step_id: handoverStep?.id ?? null,
      details_values: detailsValues,
      loading_values: loadingValues,
      handover_values: handoverValues,
      loading_photo_doc_id: loadingPhotoDoc?.id ?? null,
      details_done: status.detailsDone,
      loading_done: status.loadingDone,
      loaded_into_truck: status.loadedIntoTruck,
      handover_done: status.handoverDone,
      shipment_done: status.shipmentDone,
    });
  }

  const adjustedImportCandidates = importCandidates
    .map((candidate) => {
      const sourceId = String(candidate.shipmentId);
      const extra = extraAllocatedBySource.get(sourceId) ?? {
        weight: 0,
        quantity: 0,
      };
      const alreadyAllocatedWeight = candidate.alreadyAllocatedWeight + extra.weight;
      const alreadyAllocatedQuantity = candidate.alreadyAllocatedQuantity + extra.quantity;
      const remainingWeight = candidate.importedWeight - alreadyAllocatedWeight;
      const remainingQuantity = candidate.importedQuantity - alreadyAllocatedQuantity;
      const extraHistory = extraAllocationHistoryBySource.get(sourceId) ?? [];
      const allocationHistory = [...candidate.allocationHistory, ...extraHistory].sort((left, right) =>
        (left.exportDate || "").localeCompare(right.exportDate || ""),
      );

      return {
        ...candidate,
        alreadyAllocatedWeight,
        alreadyAllocatedQuantity,
        remainingWeight,
        remainingQuantity,
        allocationHistory,
      };
    })
    .filter((candidate) => candidate.remainingWeight > 0.0001 || candidate.remainingQuantity > 0.0001);

  const masterStepByName: Record<string, { id: number; values: Record<string, unknown> } | undefined> = {};
  for (const step of steps) {
    masterStepByName[step.name] = {
      id: step.id,
      values: toRecord(parseStepFieldValues(step.field_values_json)),
    };
  }

  const masterStatus = computeLtlMasterStatuses({
    stepsByName: masterStepByName,
    docTypes: masterDocsByType,
    subshipments: subshipmentStatuses,
  });

  const resolved = searchParams ? await Promise.resolve(searchParams) : {};
  const error = typeof resolved.error === "string" ? resolved.error : null;
  const initialTab = readParam(resolved, "tab") as
    | "creation"
    | "trucks"
    | "subshipments"
    | "loading"
    | "invoice"
    | "agents"
    | "tracking"
    | "handover"
    | undefined;
  const initialTrackingTab = readParam(resolved, "tracking") as
    | "uae"
    | "ksa"
    | "jordan"
    | "syria"
    | "mushtarakah"
    | "lebanon"
    | undefined;
  const activeMainTab = initialTab ?? "creation";
  const docsParams = new URLSearchParams();
  docsParams.set("tab", activeMainTab);
  if (activeMainTab === "tracking") {
    docsParams.set("tracking", initialTrackingTab ?? "uae");
  }
  const docsReturnTo = `/shipments/master/${shipment.id}?${docsParams.toString()}`;
  const workflowDocumentTypeOptions = listShipmentDocumentTypeOptions(steps);

  return (
    <div className={`${bodyFont.className} min-h-screen space-y-4`}>
      <div className="text-sm text-slate-500">
        <Link href="/shipments" className="hover:underline">
          Shipments
        </Link>{" "}
        <span className="text-slate-400">/</span> {shipment.shipment_code}
      </div>

      {errorMessage(error) ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(error)}
        </div>
      ) : null}

      <LtlMasterWorkspace
        headingClassName={headingFont.className}
        shipment={{
          id: shipment.id,
          shipment_code: shipment.shipment_code,
          origin: shipment.origin,
          destination: shipment.destination,
          overall_status: shipment.overall_status,
          risk: shipment.risk,
        }}
        steps={masterStepData}
        latestDocsByType={buildLatestDocMap(docs)}
        customers={customers.map((customer) => ({ id: customer.id, name: customer.name }))}
        brokers={brokers.map((broker) => ({ id: broker.id, name: broker.name }))}
        importCandidates={adjustedImportCandidates}
        subshipments={subshipmentViews}
        masterStatus={masterStatus}
        canEdit={["ADMIN", "OPERATIONS", "CLEARANCE", "SALES"].includes(user.role)}
        isAdmin={user.role === "ADMIN"}
        updateMasterStepAction={updateMasterStepAction.bind(null, shipment.id)}
        createSubshipmentAction={createSubshipmentAction.bind(null, shipment.id)}
        updateSubshipmentLoadingAction={updateSubshipmentLoadingAction.bind(null, shipment.id)}
        updateSubshipmentHandoverAction={updateSubshipmentHandoverAction.bind(null, shipment.id)}
        closeMasterLoadingAction={closeMasterLoadingAction.bind(null, shipment.id)}
        saveMasterWarehouseArrivalAction={saveMasterWarehouseArrivalAction.bind(null, shipment.id)}
        initialTab={initialTab}
        initialTrackingTab={initialTrackingTab}
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
