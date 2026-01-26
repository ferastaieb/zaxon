import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateShipmentForm } from "@/components/shipments/CreateShipmentForm";
import { assertCanWrite, canWrite, requireUser } from "@/lib/auth";
import { TransportModes, type ShipmentType, type TransportMode } from "@/lib/domain";
import { listParties } from "@/lib/data/parties";
import { createShipment } from "@/lib/data/shipments";
import { listWorkflowTemplates, suggestTemplate } from "@/lib/data/workflows";

export default async function NewShipmentPage() {
  const user = await requireUser();

  const customers = await listParties({ type: "CUSTOMER" });
  const templates = await listWorkflowTemplates({
    includeArchived: false,
    isSubworkflow: false,
  });

  async function createShipmentAction(formData: FormData) {
    "use server";
    const user = await requireUser();
    assertCanWrite(user);

    const customerPartyIds = (formData.getAll("customerPartyIds") ?? [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    const transportMode = String(formData.get("transportMode") ?? "") as TransportMode;
    const origin = String(formData.get("origin") ?? "").trim();
    const destination = String(formData.get("destination") ?? "").trim();
    const shipmentType = (transportMode === "LAND" ? "LAND" : "FCL") as ShipmentType;
    const cargoDescription = "Not set";
    const jobIdsRaw = String(formData.get("jobIds") ?? "").trim();
    const jobIds = jobIdsRaw
      ? Array.from(
          new Set(
            jobIdsRaw
              .split(/[,\n\r]+/)
              .map((v) => v.trim())
              .filter(Boolean),
          ),
        ).slice(0, 20)
      : [];
    const workflowTemplateIdRaw = String(formData.get("workflowTemplateId") ?? "").trim();
    let workflowTemplateId = workflowTemplateIdRaw ? Number(workflowTemplateIdRaw) : null;

    if (
      customerPartyIds.length === 0 ||
      !TransportModes.includes(transportMode) ||
      !origin ||
      !destination
    ) {
      redirect("/shipments/new?error=invalid");
    }

    if (!workflowTemplateId) {
      const primaryCustomerId = customerPartyIds[0] ?? 0;
      const suggested = await suggestTemplate({
        transportMode,
        origin,
        destination,
        shipmentType,
        customerPartyId: primaryCustomerId,
      });
      workflowTemplateId = suggested?.id ?? null;
    }

    if (!workflowTemplateId) {
      const fallbackTemplates = await listWorkflowTemplates({
        includeArchived: false,
        isSubworkflow: false,
      });
      workflowTemplateId = fallbackTemplates[0]?.id ?? null;
    }

    if (!workflowTemplateId) redirect("/shipments/new?error=template");

    const created = await createShipment({
      customerPartyIds,
      transportMode,
      origin,
      destination,
      shipmentType,
      cargoDescription,
      jobIds: jobIds.length ? jobIds : undefined,
      workflowTemplateId,
      createdByUserId: user.id,
    });

    redirect(`/shipments/${created.shipmentId}`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="text-sm text-zinc-500">
          <Link href="/shipments" className="hover:underline">
            Shipments
          </Link>{" "}
          <span className="text-zinc-400">/</span> New
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          Create shipment
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Fill the basics — the workflow steps will be generated automatically.
        </p>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 text-sm text-yellow-900">
          No workflow templates found.{" "}
          <Link href="/workflows/new" className="font-medium underline">
            Create a template
          </Link>{" "}
          first.
        </div>
      ) : null}

      {customers.length === 0 ? (
        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5 text-sm text-yellow-900">
          No customers found.{" "}
          <Link href="/parties/new?type=CUSTOMER" className="font-medium underline">
            Create a customer
          </Link>{" "}
          first.
        </div>
      ) : null}

      <CreateShipmentForm
        customers={customers}
        templates={templates}
        action={createShipmentAction}
        canWrite={canWrite(user.role)}
      />
    </div>
  );
}
