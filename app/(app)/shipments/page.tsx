import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { assertCanWrite, requireUser } from "@/lib/auth";
import {
  ShipmentOverallStatuses,
  TransportModes,
  overallStatusLabel,
  riskLabel,
  transportModeLabel,
  type ShipmentOverallStatus,
  type TransportMode,
} from "@/lib/domain";
import { listParties } from "@/lib/data/parties";
import { listShipmentsForUser } from "@/lib/data/shipments";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function riskTone(risk: string) {
  if (risk === "BLOCKED") return "red";
  if (risk === "AT_RISK") return "yellow";
  return "green";
}

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const user = await requireUser();
  const resolved = searchParams
    ? await Promise.resolve(searchParams)
    : ({} as SearchParams);

  const q = readParam(resolved, "q") ?? "";
  const customerIdRaw = readParam(resolved, "customerId");
  const customerId = customerIdRaw ? Number(customerIdRaw) : undefined;
  const modeRaw = readParam(resolved, "mode");
  const mode = TransportModes.includes(modeRaw as TransportMode)
    ? (modeRaw as TransportMode)
    : undefined;
  const statusRaw = readParam(resolved, "status");
  const status = ShipmentOverallStatuses.includes(statusRaw as ShipmentOverallStatus)
    ? (statusRaw as ShipmentOverallStatus)
    : undefined;

  const customers = listParties({ type: "CUSTOMER" });
  const shipments = listShipmentsForUser({
    userId: user.id,
    role: user.role,
    q: q.trim() || undefined,
    customerId: Number.isFinite(customerId) ? customerId : undefined,
    transportMode: mode,
    status,
  });

  async function createShipmentRedirectAction() {
    "use server";
    const user = await requireUser();
    assertCanWrite(user);
    redirect("/shipments/new");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Shipments</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Create and manage shipments with steps, tasks, and documents.
          </p>
        </div>
        <form action={createShipmentRedirectAction}>
          <button
            type="submit"
            disabled={user.role === "FINANCE"}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            Create shipment
          </button>
        </form>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <form className="grid gap-3 lg:grid-cols-4" method="get">
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Search</div>
            <input
              name="q"
              defaultValue={q}
              placeholder="Shipment ID, customer, container/B/L/job..."
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Customer</div>
            <select
              name="customerId"
              defaultValue={customerIdRaw ?? ""}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">
              Transport mode
            </div>
            <select
              name="mode"
              defaultValue={modeRaw ?? ""}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All modes</option>
              {TransportModes.map((m) => (
                <option key={m} value={m}>
                  {transportModeLabel(m)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Status</div>
            <select
              name="status"
              defaultValue={statusRaw ?? ""}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              {ShipmentOverallStatuses.map((s) => (
                <option key={s} value={s}>
                  {overallStatusLabel(s)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-2 lg:col-span-4">
            <button
              type="submit"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Apply
            </button>
            <Link
              href="/shipments"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Reset
            </Link>
          </div>
        </form>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-2 pr-4">Shipment ID</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Mode</th>
                <th className="py-2 pr-4">Route</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Last update</th>
                <th className="py-2 pr-4">ETD / ETA</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {shipments.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50">
                  <td className="py-2 pr-4 font-medium text-zinc-900">
                    <div>{s.shipment_code}</div>
                    {s.job_ids ? (
                      <div className="mt-0.5 text-xs font-normal text-zinc-500">
                        Job: {s.job_ids}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">
                    {s.customer_names ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">
                    {transportModeLabel(s.transport_mode)}
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">
                    {s.origin} → {s.destination}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <Badge tone="zinc">{overallStatusLabel(s.overall_status)}</Badge>
                      <Badge tone={riskTone(s.risk)}>{riskLabel(s.risk)}</Badge>
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">
                    {new Date(s.last_update_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">
                    <span className="text-zinc-500">
                      {s.etd ? new Date(s.etd).toLocaleDateString() : "—"}
                    </span>{" "}
                    /{" "}
                    <span className="text-zinc-500">
                      {s.eta ? new Date(s.eta).toLocaleDateString() : "—"}
                    </span>
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
                  <td className="py-6 text-sm text-zinc-500" colSpan={8}>
                    No shipments found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
