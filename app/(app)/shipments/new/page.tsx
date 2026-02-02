import Link from "next/link";
import { redirect } from "next/navigation";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import { FclImportCreateForm } from "@/components/shipments/fcl-import/FclImportCreateForm";
import { assertCanWrite, canWrite, requireUser } from "@/lib/auth";
import { listParties } from "@/lib/data/parties";
import { createShipment, listShipmentSteps } from "@/lib/data/shipments";
import { updateShipmentStep } from "@/lib/data/steps";
import { refreshShipmentDerivedState } from "@/lib/services/shipmentDerived";
import { ensureFclImportTemplate } from "@/lib/fclImport/template";
import { FCL_IMPORT_STEP_NAMES } from "@/lib/fclImport/constants";
import { normalizeContainerNumbers } from "@/lib/fclImport/helpers";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const SERVICE_TYPE_FCL = "FCL_IMPORT_CLEARANCE";

type NewShipmentPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewShipmentPage({ searchParams }: NewShipmentPageProps) {
  const user = await requireUser();
  const customers = await listParties({ type: "CUSTOMER" });
  const resolved = searchParams ? await Promise.resolve(searchParams) : {};
  const error = typeof resolved.error === "string" ? resolved.error : null;

  async function createShipmentAction(formData: FormData) {
    "use server";
    const user = await requireUser();
    assertCanWrite(user);

    const serviceType = String(formData.get("serviceType") ?? "").trim();
    const customerPartyIds = (formData.getAll("customerPartyIds") ?? [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    const origin = String(formData.get("origin") ?? "").trim();
    const destination = String(formData.get("destination") ?? "").trim();
    const containerNumbers = normalizeContainerNumbers(
      formData.getAll("containerNumbers").map((value) => String(value)),
    );
    const jobIdsRaw = String(formData.get("jobIds") ?? "").trim();
    const jobIds = jobIdsRaw
      ? Array.from(
          new Set(
            jobIdsRaw
              .split(/[,\n\r]+/)
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        ).slice(0, 20)
      : [];

    if (
      serviceType !== SERVICE_TYPE_FCL ||
      customerPartyIds.length === 0 ||
      !origin ||
      !destination ||
      containerNumbers.length === 0
    ) {
      redirect("/shipments/new?error=invalid");
    }

    const workflowTemplateId = await ensureFclImportTemplate({
      createdByUserId: user.id,
    });

    const created = await createShipment({
      customerPartyIds,
      transportMode: "SEA",
      origin,
      destination,
      shipmentType: "FCL",
      cargoDescription: "FCL Import Clearance",
      jobIds: jobIds.length ? jobIds : undefined,
      containerNumber: containerNumbers[0] ?? null,
      workflowTemplateId,
      createdByUserId: user.id,
    });

    const steps = await listShipmentSteps(created.shipmentId);
    const creationStep = steps.find(
      (step) => step.name === FCL_IMPORT_STEP_NAMES.shipmentCreation,
    );

    if (creationStep) {
      await updateShipmentStep({
        stepId: creationStep.id,
        status: "DONE",
        fieldValuesJson: JSON.stringify({
          containers: containerNumbers.map((number) => ({
            container_number: number,
          })),
        }),
      });
    }

    await refreshShipmentDerivedState({
      shipmentId: created.shipmentId,
      actorUserId: user.id,
      updateLastUpdate: true,
    });

    redirect(`/shipments/${created.shipmentId}`);
  }

  return (
    <div className={`${bodyFont.className} mx-auto max-w-6xl space-y-6`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-slate-500">
            Shipment creation
          </div>
          <h1
            className={`${headingFont.className} mt-2 text-3xl font-semibold tracking-tight text-slate-900`}
          >
            Create shipment
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Service type defaults to FCL Import Clearance. You can change it
            later as more services are added.
          </p>
        </div>
        <Link
          href="/shipments"
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          Back to shipments
        </Link>
      </div>

      <FclImportCreateForm
        customers={customers}
        action={createShipmentAction}
        canWrite={canWrite(user.role)}
        error={error}
      />
    </div>
  );
}
