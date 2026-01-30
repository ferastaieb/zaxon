import Link from "next/link";
import { redirect } from "next/navigation";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import { FclImportWorkspace } from "@/components/shipments/fcl-import/FclImportWorkspace";
import { requireUser } from "@/lib/auth";
import { listDocuments } from "@/lib/data/documents";
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
import { updateFclStepAction } from "./actions";

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
};

function buildLatestDocMap(docs: DocumentRow[]) {
  const latest: Record<string, { id: number; file_name: string; uploaded_at: string }> =
    {};
  for (const doc of docs) {
    const key = String(doc.document_type);
    if (!latest[key]) {
      latest[key] = {
        id: doc.id,
        file_name: doc.file_name,
        uploaded_at: doc.uploaded_at,
      };
    }
  }
  return latest;
}

export default async function FclImportShipmentPage({ params }: ShipmentPageProps) {
  const user = await requireUser();
  const { shipmentId } = await params;
  const id = Number(shipmentId);
  if (!id) redirect("/shipments");

  await requireShipmentAccess(user, id);

  const shipment = await getShipment(id);
  if (!shipment) redirect("/shipments");

  const [customers, jobIds, docs, trackingToken] = await Promise.all([
    listShipmentCustomers(id),
    listShipmentJobIds(id),
    listDocuments(id),
    getTrackingTokenForShipment(id),
  ]);

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

  return (
    <div className={`${bodyFont.className} min-h-screen`}>
      <FclImportWorkspace
        headingClassName={headingFont.className}
        shipment={shipment}
        customers={customers}
        steps={stepData}
        jobIds={jobIds}
        containerNumbers={containerNumbers}
        latestDocsByType={buildLatestDocMap(docs)}
        trackingToken={trackingToken}
        canEdit={["ADMIN", "OPERATIONS", "CLEARANCE", "SALES"].includes(user.role)}
        updateAction={updateFclStepAction.bind(null, shipment.id)}
      />
    </div>
  );
}
