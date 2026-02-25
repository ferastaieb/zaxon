import Link from "next/link";
import { redirect } from "next/navigation";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import { AppIcon } from "@/components/ui/AppIcon";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { assertCanWrite, canWrite, requireUser } from "@/lib/auth";
import { createShipment, listShipmentSteps } from "@/lib/data/shipments";
import { updateShipmentStep } from "@/lib/data/steps";
import {
  LTL_MASTER_ROUTE_TO_SERVICE_TYPE,
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES,
} from "@/lib/ltlMasterJafzaSyria/constants";
import { ensureLtlMasterJafzaSyriaTemplate } from "@/lib/ltlMasterJafzaSyria/template";
import { refreshShipmentDerivedState } from "@/lib/services/shipmentDerived";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import {
  JAFZA_LAND_ROUTES,
  type JafzaLandRouteId,
} from "@/lib/routes/jafzaLandRoutes";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

type NewMasterShipmentPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function messageByError(error: string | null) {
  if (!error) return null;
  if (error === "invalid") {
    return "Invalid input. Please review planned loading date and notes.";
  }
  return "Could not create master shipment.";
}

const ROUTE_OPTIONS = [
  JAFZA_LAND_ROUTES.JAFZA_TO_SYRIA,
  JAFZA_LAND_ROUTES.JAFZA_TO_KSA,
  JAFZA_LAND_ROUTES.JAFZA_TO_MUSHTARAKAH,
] as const;

export default async function NewMasterShipmentPage({
  searchParams,
}: NewMasterShipmentPageProps) {
  const user = await requireUser();
  const resolved = searchParams ? await Promise.resolve(searchParams) : {};
  const error = typeof resolved.error === "string" ? resolved.error : null;

  async function createMasterShipmentAction(formData: FormData) {
    "use server";

    const user = await requireUser();
    assertCanWrite(user);

    const routeIdRaw = String(formData.get("routeId") ?? "").trim();
    if (
      routeIdRaw !== "JAFZA_TO_SYRIA" &&
      routeIdRaw !== "JAFZA_TO_KSA" &&
      routeIdRaw !== "JAFZA_TO_MUSHTARAKAH"
    ) {
      redirect("/shipments/master/new?error=invalid");
    }
    const routeId = routeIdRaw as JafzaLandRouteId;
    const route = JAFZA_LAND_ROUTES[routeId];
    const serviceType = LTL_MASTER_ROUTE_TO_SERVICE_TYPE[routeId];

    const plannedLoadingDate = String(formData.get("plannedLoadingDate") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    const templateId = await ensureLtlMasterJafzaSyriaTemplate({
      createdByUserId: user.id,
    });

    const created = await createShipment({
      customerPartyIds: [],
      transportMode: "LAND",
      origin: route.origin,
      destination: route.destination,
      shipmentType: "LAND",
      cargoDescription: `LTL ${route.origin} -> ${route.destination} Master Consolidation`,
      workflowTemplateId: templateId,
      shipmentKind: "MASTER",
      skipTrackingToken: true,
      createdByUserId: user.id,
    });

    const steps = await listShipmentSteps(created.shipmentId);
    const creationStep = steps.find(
      (step) => step.name === LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.shipmentCreation,
    );

    if (creationStep) {
      await updateShipmentStep({
        stepId: creationStep.id,
        status: "DONE",
        fieldValuesJson: JSON.stringify({
          service_type: serviceType,
          route_id: routeId,
          planned_loading_date: plannedLoadingDate,
          notes,
        }),
      });
    }

    await refreshShipmentDerivedState({
      shipmentId: created.shipmentId,
      actorUserId: user.id,
      updateLastUpdate: true,
    });

    redirect(`/shipments/master/${created.shipmentId}?created=1`);
  }

  return (
    <div className={`${bodyFont.className} mx-auto max-w-4xl space-y-6`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-500">
            <AppIcon name="icon-shipment-create" size={24} />
            Master shipment
          </div>
          <h1
            className={`${headingFont.className} mt-2 text-3xl font-semibold tracking-tight text-slate-900`}
          >
            Create LTL Master Shipment
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Select route first. Service type and route behavior are set automatically,
            then add customer subshipments inside the master workflow.
          </p>
        </div>
        <Link
          href="/shipments"
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          Back to shipments
        </Link>
      </div>

      {messageByError(error) ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {messageByError(error)}
        </div>
      ) : null}

      <form
        action={createMasterShipmentAction}
        className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <label className="block">
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
            Route
          </div>
          <select
            name="routeId"
            defaultValue="JAFZA_TO_SYRIA"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700"
            required
          >
            {ROUTE_OPTIONS.map((route) => (
              <option key={route.id} value={route.id}>
                {route.label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Planned loading date</div>
            <DatePickerInput
              
              name="plannedLoadingDate"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
             />
          </label>

          <label className="block md:col-span-2">
            <div className="mb-1 text-xs font-medium text-zinc-600">Notes</div>
            <textarea
              name="notes"
              rows={4}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>

        <SubmitButton
          pendingLabel="Creating..."
          disabled={!canWrite(user.role)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          Create master shipment
        </SubmitButton>
      </form>
    </div>
  );
}

