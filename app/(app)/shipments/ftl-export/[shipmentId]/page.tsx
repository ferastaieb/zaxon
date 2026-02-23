import Link from "next/link";
import { redirect } from "next/navigation";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import {
  FtlExportWorkspace,
  type FtlInvoiceTab,
  type FtlMainTab,
  type FtlTrackingTab,
} from "@/components/shipments/ftl-export/FtlExportWorkspace";
import { requireUser } from "@/lib/auth";
import { listDocumentRequests, listDocuments, type DocumentRow } from "@/lib/data/documents";
import { listParties } from "@/lib/data/parties";
import {
  getShipment,
  getTrackingTokenForShipment,
  listShipmentSteps,
  syncShipmentStepsFromTemplate,
} from "@/lib/data/shipments";
import { requireShipmentAccess } from "@/lib/permissions";
import { parseStepFieldSchema, parseStepFieldValues } from "@/lib/stepFields";
import {
  FTL_EXPORT_OPERATIONS_STEPS,
  FTL_EXPORT_TRACKING_STEPS,
} from "@/lib/ftlExport/constants";
import { listFtlImportCandidates } from "@/lib/ftlExport/importCandidates";
import { ensureFtlExportTemplate } from "@/lib/ftlExport/template";
import { updateFtlStepAction } from "./actions";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const MAIN_TABS: readonly FtlMainTab[] = [
  "plan",
  "trucks",
  "loading",
  "invoice",
  "agents",
  "tracking",
];
const INVOICE_TABS: readonly FtlInvoiceTab[] = ["imports", "invoice", "stock"];
const TRACKING_TABS: readonly FtlTrackingTab[] = ["uae", "ksa", "jordan", "syria"];

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
  if (error === "invoice_duplicate") {
    return "Invoice number must be unique across all shipments.";
  }
  if (error === "invoice_prereq") {
    return "Export invoice cannot be saved/finalized before loading is done and imports are available.";
  }
  if (error === "invoice_truck_details_required") {
    return "Complete truck number, driver name, and driver contact for all active trucks before saving/finalizing the export invoice.";
  }
  if (error === "invoice_required_fields") {
    return "Invoice number, invoice date, and invoice file are required before finalization.";
  }
  if (error === "truck_locked") {
    return "Truck details are locked because export invoice is finalized.";
  }
  if (error === "truck_booking_required") {
    return "Booking date is required for each booked truck.";
  }
  if (error === "loading_required") {
    return "Complete mandatory loading fields and photos before saving loaded trucks.";
  }
  if (error === "tracking_locked") {
    return "Tracking is locked until loading is done and export invoice is finalized.";
  }
  if (error === "tracking_agent_required") {
    return "Assign the corresponding customs agent in Customs Agents before updating that tracking border.";
  }
  if (error === "import_reference_invalid") {
    return "Import references must be selected from existing import shipments.";
  }
  if (error === "invalid") {
    return "Invalid request data.";
  }
  return null;
}

function asMainTab(value: string | undefined): FtlMainTab | undefined {
  if (!value) return undefined;
  return MAIN_TABS.includes(value as FtlMainTab) ? (value as FtlMainTab) : undefined;
}

function asInvoiceTab(value: string | undefined): FtlInvoiceTab | undefined {
  if (!value) return undefined;
  return INVOICE_TABS.includes(value as FtlInvoiceTab)
    ? (value as FtlInvoiceTab)
    : undefined;
}

function asTrackingTab(value: string | undefined): FtlTrackingTab | undefined {
  if (!value) return undefined;
  return TRACKING_TABS.includes(value as FtlTrackingTab)
    ? (value as FtlTrackingTab)
    : undefined;
}

export default async function FtlExportShipmentPage({
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

  const templateId = await ensureFtlExportTemplate({ createdByUserId: user.id });
  let steps = await listShipmentSteps(id);
  const requiredSteps = [...FTL_EXPORT_OPERATIONS_STEPS, ...FTL_EXPORT_TRACKING_STEPS];

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

  const [docs, docRequests, trackingToken, importCandidates, brokers] = await Promise.all([
    listDocuments(id),
    listDocumentRequests(id),
    getTrackingTokenForShipment(id),
    listFtlImportCandidates({
      userId: user.id,
      role: user.role,
      currentShipmentId: id,
    }),
    listParties({ type: "CUSTOMS_BROKER" }),
  ]);

  const stepData = steps.map((step) => ({
    id: step.id,
    name: step.name,
    status: step.status,
    notes: step.notes ?? null,
    values: parseStepFieldValues(step.field_values_json),
    schema: parseStepFieldSchema(step.field_schema_json),
  }));

  const hasTemplateSteps = requiredSteps.every((name) =>
    stepData.some((step) => step.name === name),
  );

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
          This shipment is not using the FTL Export workflow template.
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
  const error =
    typeof resolved.error === "string" ? resolved.error : null;
  const initialTab = asMainTab(typeof resolved.tab === "string" ? resolved.tab : undefined);
  const initialInvoiceTab = asInvoiceTab(
    typeof resolved.invoice === "string" ? resolved.invoice : undefined,
  );
  const initialTrackingTab = asTrackingTab(
    typeof resolved.tracking === "string" ? resolved.tracking : undefined,
  );

  const openDocRequestTypes = docRequests
    .filter((request) => request.status === "OPEN")
    .map((request) => String(request.document_type));

  return (
    <div className={`${bodyFont.className} min-h-screen space-y-4`}>
      {errorMessage(error) ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {errorMessage(error)}
        </div>
      ) : null}
      {openDocRequestTypes.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Open customer document requests: {openDocRequestTypes.join(", ")}
        </div>
      ) : null}
      <FtlExportWorkspace
        headingClassName={headingFont.className}
        shipment={shipment}
        steps={stepData}
        brokers={brokers.map((broker) => ({ id: broker.id, name: broker.name }))}
        latestDocsByType={buildLatestDocMap(docs)}
        importCandidates={importCandidates}
        trackingToken={trackingToken}
        canEdit={["ADMIN", "OPERATIONS", "CLEARANCE", "SALES"].includes(user.role)}
        isAdmin={user.role === "ADMIN"}
        updateAction={updateFtlStepAction.bind(null, shipment.id)}
        initialTab={initialTab}
        initialInvoiceTab={initialInvoiceTab}
        initialTrackingTab={initialTrackingTab}
      />
    </div>
  );
}
