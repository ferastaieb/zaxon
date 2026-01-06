import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { assertCanWrite, requireUser } from "@/lib/auth";
import {
  overallStatusLabel,
  riskLabel,
  transportModeLabel,
  type PartyType,
} from "@/lib/domain";
import {
  listCustomerGoodsSummary,
  listCustomerInventoryTransactions,
} from "@/lib/data/goods";
import { getParty, updateParty } from "@/lib/data/parties";
import { listShipmentsForUser } from "@/lib/data/shipments";

function partyTypeLabel(type: PartyType) {
  switch (type) {
    case "CUSTOMER":
      return "Customer";
    case "SUPPLIER":
      return "Supplier";
    case "CUSTOMS_BROKER":
      return "Customs broker";
  }
}

function riskTone(risk: string) {
  if (risk === "BLOCKED") return "red";
  if (risk === "AT_RISK") return "yellow";
  return "green";
}

function directionTone(direction: string) {
  return direction === "IN" ? "green" : "red";
}

function parseShipmentRefs(refs: string | null) {
  if (!refs) return [];
  return refs
    .split(",")
    .map((ref) => {
      const [idRaw, code] = ref.split("|");
      const id = Number(idRaw);
      if (!id || !code) return null;
      return { id, code };
    })
    .filter((value): value is { id: number; code: string } => value !== null);
}

export default async function PartyDetailsPage({
  params,
}: {
  params: Promise<{ partyId: string }>;
}) {
  const user = await requireUser();
  const { partyId } = await params;
  const party = getParty(Number(partyId));
  if (!party) redirect("/parties");
  const isCustomer = party.type === "CUSTOMER";
  const canAccessAllShipments = user.role === "ADMIN" || user.role === "FINANCE";

  const shipments = isCustomer
    ? listShipmentsForUser({
        userId: user.id,
        role: user.role,
        customerId: party.id,
      })
    : [];
  const goodsSummary = isCustomer
    ? listCustomerGoodsSummary({
        ownerUserId: user.id,
        customerPartyId: party.id,
        canAccessAllShipments,
      })
    : [];
  const inventoryTransactions = isCustomer
    ? listCustomerInventoryTransactions({
        ownerUserId: user.id,
        customerPartyId: party.id,
        canAccessAllShipments,
        limit: 200,
      })
    : [];

  async function updatePartyAction(formData: FormData) {
    "use server";
    const user = await requireUser();
    assertCanWrite(user);

    const id = Number(formData.get("id") ?? 0);
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const email = String(formData.get("email") ?? "").trim() || null;
    const address = String(formData.get("address") ?? "").trim() || null;
    const notes = String(formData.get("notes") ?? "").trim() || null;

    if (!id || !name) redirect(`/parties/${id}?error=invalid`);
    updateParty(id, { name, phone, email, address, notes });
    redirect(`/parties/${id}`);
  }

  const canEdit = user.role !== "FINANCE";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="text-sm text-zinc-500">
          <Link href={`/parties?type=${party.type}`} className="hover:underline">
            Parties
          </Link>{" "}
          <span className="text-zinc-400">/</span>{" "}
          {partyTypeLabel(party.type)}
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {party.name}
        </h1>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <form action={updatePartyAction} className="space-y-4">
          <input type="hidden" name="id" value={party.id} />
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">Name</div>
            <input
              name="name"
              defaultValue={party.name}
              disabled={!canEdit}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
              required
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">Phone</div>
              <input
                name="phone"
                defaultValue={party.phone ?? ""}
                disabled={!canEdit}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">Email</div>
              <input
                name="email"
                type="email"
                defaultValue={party.email ?? ""}
                disabled={!canEdit}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
              />
            </label>
          </div>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">Address</div>
            <input
              name="address"
              defaultValue={party.address ?? ""}
              disabled={!canEdit}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">Notes</div>
            <textarea
              name="notes"
              defaultValue={party.notes ?? ""}
              disabled={!canEdit}
              className="min-h-28 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>

          {canEdit ? (
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Save
              </button>
              <Link
                href={`/parties?type=${party.type}`}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Back
              </Link>
            </div>
          ) : (
            <div className="text-sm text-zinc-500">
              Finance role is view-only.
            </div>
          )}
        </form>
      </div>

      {isCustomer ? (
        <>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Connected shipments
              </h2>
              <div className="text-xs text-zinc-500">
                {shipments.length} shipments
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="py-2 pr-4">Shipment</th>
                    <th className="py-2 pr-4">Mode</th>
                    <th className="py-2 pr-4">Route</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Updated</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {shipments.map((s) => (
                    <tr key={s.id} className="hover:bg-zinc-50">
                      <td className="py-2 pr-4 font-medium text-zinc-900">
                        <div>{s.shipment_code}</div>
                        {s.job_ids ? (
                          <div className="mt-0.5 text-xs text-zinc-500">
                            Job: {s.job_ids}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-4 text-zinc-700">
                        {transportModeLabel(s.transport_mode)}
                      </td>
                      <td className="py-2 pr-4 text-zinc-700">
                        {s.origin} - {s.destination}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <Badge tone="zinc">
                            {overallStatusLabel(s.overall_status)}
                          </Badge>
                          <Badge tone={riskTone(s.risk)}>
                            {riskLabel(s.risk)}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-zinc-700">
                        {new Date(s.last_update_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/shipments/${s.id}`}
                          className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {shipments.length === 0 ? (
                    <tr>
                      <td className="py-6 text-sm text-zinc-500" colSpan={6}>
                        No connected shipments.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Goods summary
              </h2>
              <div className="text-xs text-zinc-500">
                {goodsSummary.length} goods
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="py-2 pr-4">Good</th>
                    <th className="py-2 pr-4">Total quantity</th>
                    <th className="py-2 pr-4">Remaining</th>
                    <th className="py-2 pr-4">Shipments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {goodsSummary.map((g) => {
                    const shipmentRefs = parseShipmentRefs(g.shipment_refs);
                    return (
                      <tr key={g.good_id}>
                        <td className="py-2 pr-4 font-medium text-zinc-900">
                          <div>{g.good_name}</div>
                          <div className="mt-0.5 text-xs text-zinc-500">
                            {g.good_origin}
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-zinc-700">
                          {g.total_quantity} {g.unit_type}
                        </td>
                        <td className="py-2 pr-4 text-zinc-700">
                          {g.remaining_quantity} {g.unit_type}
                        </td>
                        <td className="py-2 pr-4 text-zinc-700">
                          {shipmentRefs.length ? (
                            <div className="flex flex-wrap gap-2">
                              {shipmentRefs.map((s) => (
                                <Link
                                  key={s.id}
                                  href={`/shipments/${s.id}`}
                                  className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                                >
                                  {s.code}
                                </Link>
                              ))}
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {goodsSummary.length === 0 ? (
                    <tr>
                      <td className="py-6 text-sm text-zinc-500" colSpan={4}>
                        No goods yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-zinc-900">
                Inventory transactions
              </h2>
              <div className="text-xs text-zinc-500">Latest 200</div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Shipment</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Good</th>
                    <th className="py-2 pr-4">Direction</th>
                    <th className="py-2 pr-4">Quantity</th>
                    <th className="py-2 pr-4">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {inventoryTransactions.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2 pr-4 text-zinc-700">
                        {new Date(t.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4 text-zinc-700">
                        {t.shipment_id ? (
                          <Link
                            href={`/shipments/${t.shipment_id}`}
                            className="font-medium text-zinc-900 hover:underline"
                          >
                            {t.shipment_code ?? "Shipment"}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2 pr-4 text-zinc-700">
                        {t.customer_name ?? party.name}
                      </td>
                      <td className="py-2 pr-4 text-zinc-700">
                        <div className="font-medium text-zinc-900">
                          {t.good_name}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {t.good_origin}
                        </div>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge tone={directionTone(t.direction)}>
                          {t.direction}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-zinc-700">
                        {t.quantity} {t.unit_type}
                      </td>
                      <td className="py-2 pr-4 text-zinc-700">
                        {t.note ?? "-"}
                      </td>
                    </tr>
                  ))}
                  {inventoryTransactions.length === 0 ? (
                    <tr>
                      <td className="py-6 text-sm text-zinc-500" colSpan={7}>
                        No inventory transactions yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
