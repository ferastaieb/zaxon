import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { ShipmentTypes, TransportModes, type ShipmentType } from "@/lib/domain";
import { listParties } from "@/lib/data/parties";
import {
  createTemplateRule,
  deleteTemplateRule,
  listTemplateRules,
  listWorkflowTemplates,
} from "@/lib/data/workflows";

export default async function WorkflowRulesPage() {
  await requireAdmin();
  const templates = await listWorkflowTemplates({
    includeArchived: false,
    isSubworkflow: false,
  });
  const customers = await listParties({ type: "CUSTOMER" });
  const rules = await listTemplateRules();
  const serviceTypes = Array.from(
    new Set(
      [
        ...TransportModes,
        ...rules.map((rule) => rule.transport_mode ?? "").filter(Boolean),
      ].map((value) => value.trim()),
    ),
  ).filter(Boolean);

  async function createRuleAction(formData: FormData) {
    "use server";
    const user = await requireAdmin();
    const templateId = Number(formData.get("templateId") ?? 0);
    const transportMode = String(formData.get("serviceType") ?? "").trim() || null;
    const origin = String(formData.get("origin") ?? "").trim() || null;
    const destination = String(formData.get("destination") ?? "").trim() || null;
    const shipmentType = (String(formData.get("shipmentType") ?? "") ||
      null) as ShipmentType | null;
    const customerPartyIdRaw = String(
      formData.get("customerPartyId") ?? "",
    ).trim();
    const customerPartyId = customerPartyIdRaw ? Number(customerPartyIdRaw) : null;

    if (!templateId) redirect("/workflows/rules?error=invalid");

    await createTemplateRule({
      templateId,
      transportMode,
      origin,
      destination,
      shipmentType,
      customerPartyId: Number.isFinite(customerPartyId) ? customerPartyId : null,
      createdByUserId: user.id,
    });
    redirect("/workflows/rules");
  }

  async function deleteRuleAction(formData: FormData) {
    "use server";
    await requireAdmin();
    const ruleId = Number(formData.get("ruleId") ?? 0);
    if (!ruleId) redirect("/workflows/rules?error=invalid");
    await deleteTemplateRule(ruleId);
    redirect("/workflows/rules");
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-zinc-500">
          <Link href="/workflows" className="hover:underline">
            Workflows
          </Link>{" "}
          <span className="text-zinc-400">/</span> Rules
        </div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Template auto-suggestion rules
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              If (service type + route + type + customer) then choose a template.
            </p>
          </div>
          <Link
            href="/workflows"
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Back
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Add rule</h2>
          <form action={createRuleAction} className="mt-4 space-y-3">
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">
                Choose template
              </div>
              <select
                name="templateId"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                required
              >
                <option value="" disabled>
                  Select...
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-sm font-medium text-zinc-800">
                  Service Type (optional)
                </div>
                <input
                  name="serviceType"
                  list="serviceTypeOptions"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  placeholder="Select or type a new value"
                />
                <datalist id="serviceTypeOptions">
                  {serviceTypes.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
                <div className="mt-1 text-xs text-zinc-500">
                  Pick an existing value or type a new service type.
                </div>
              </label>
              <label className="block">
                <div className="mb-1 text-sm font-medium text-zinc-800">
                  Shipment type (optional)
                </div>
                <select
                  name="shipmentType"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  defaultValue=""
                >
                  <option value="">Any</option>
                  {ShipmentTypes.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-sm font-medium text-zinc-800">
                  Origin (optional)
                </div>
                <input
                  name="origin"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="Algiers"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-sm font-medium text-zinc-800">
                  Destination (optional)
                </div>
                <input
                  name="destination"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="Marseille"
                />
              </label>
            </div>

            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">
                Customer (optional)
              </div>
              <select
                name="customerPartyId"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                defaultValue=""
              >
                <option value="">Any</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Add rule
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Existing rules</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Template</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rules.map((r) => {
                  const parts = [
                    r.transport_mode ? `Service=${r.transport_mode}` : null,
                    r.shipment_type ? `Type=${r.shipment_type}` : null,
                    r.origin ? `From=${r.origin}` : null,
                    r.destination ? `To=${r.destination}` : null,
                    r.customer_name ? `Customer=${r.customer_name}` : null,
                  ].filter(Boolean);
                  return (
                    <tr key={r.id}>
                      <td className="py-2 pr-4 text-zinc-700">
                        {parts.length ? parts.join(" / ") : "Any shipment"}
                      </td>
                      <td className="py-2 pr-4 font-medium text-zinc-900">
                        {r.template_name}
                      </td>
                      <td className="py-2 pr-4">
                        <form action={deleteRuleAction}>
                          <input type="hidden" name="ruleId" value={r.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
                {rules.length === 0 ? (
                  <tr>
                    <td className="py-6 text-sm text-zinc-500" colSpan={3}>
                      No rules yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
