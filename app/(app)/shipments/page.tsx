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

function shipmentModeLabel(input: {
  shipment_type: string;
  cargo_description: string;
}) {
  const cargo = input.cargo_description.toLowerCase();
  if (cargo.includes("ftl")) return "FTL";
  if (cargo.includes("import transfer of ownership")) return "Import Transfer";
  if (input.shipment_type === "LAND") return "LAND";
  return input.shipment_type;
}

function positiveIntOrDefault(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
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
  const pageRaw = readParam(resolved, "page");

  const customers = await listParties({ type: "CUSTOMER" });
  const shipments = await listShipmentsForUser({
    userId: user.id,
    role: user.role,
    q: q.trim() || undefined,
    customerId: Number.isFinite(customerId) ? customerId : undefined,
    transportMode: mode,
    status,
  });

  const pageSize = 10;
  const requestedPage = positiveIntOrDefault(pageRaw, 1);
  const totalRows = shipments.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const paginatedShipments = shipments.slice(pageStart, pageEnd);
  const showingFrom = totalRows === 0 ? 0 : pageStart + 1;
  const showingTo = Math.min(pageEnd, totalRows);

  const buildShipmentsPageHref = (page: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (customerIdRaw) params.set("customerId", customerIdRaw);
    if (modeRaw) params.set("mode", modeRaw);
    if (statusRaw) params.set("status", statusRaw);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/shipments?${query}` : "/shipments";
  };

  const visiblePages = (() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    const pages = new Set<number>([1, totalPages, currentPage]);
    if (currentPage - 1 > 1) pages.add(currentPage - 1);
    if (currentPage + 1 < totalPages) pages.add(currentPage + 1);
    const sorted = Array.from(pages).sort((a, b) => a - b);
    return sorted;
  })();

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
        <div className="flex flex-wrap items-center gap-3">
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
                <th className="whitespace-nowrap py-2 pr-4">Shipment ID</th>
                <th className="whitespace-nowrap py-2 pr-4">Customer</th>
                <th className="whitespace-nowrap py-2 pr-4">Mode</th>
                <th className="whitespace-nowrap py-2 pr-4">Route</th>
                <th className="whitespace-nowrap py-2 pr-4">Status</th>
                <th className="whitespace-nowrap py-2 pr-4">Last update</th>
                <th className="whitespace-nowrap py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {paginatedShipments.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50">
                  <td className="whitespace-nowrap py-2 pr-4 font-medium text-zinc-900">
                    <div className="whitespace-nowrap">{s.shipment_code}</div>
                    {s.job_ids ? (
                      <div className="mt-0.5 whitespace-nowrap text-xs font-normal text-zinc-500">
                        Job: {s.job_ids}
                      </div>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-zinc-700">
                    {s.customer_names ?? "-"}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-zinc-700">
                    {shipmentModeLabel({
                      shipment_type: s.shipment_type,
                      cargo_description: s.cargo_description,
                    })}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-zinc-700">
                    {s.origin} {"->"} {s.destination}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <Badge tone="zinc">{overallStatusLabel(s.overall_status)}</Badge>
                      <Badge tone={riskTone(s.risk)}>{riskLabel(s.risk)}</Badge>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4 text-zinc-700">
                    {new Date(s.last_update_at).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-4">
                    <Link
                      href={`/shipments/${s.id}`}
                      className="whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {paginatedShipments.length === 0 ? (
                <tr>
                  <td className="py-6 text-sm text-zinc-500" colSpan={7}>
                    No shipments found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
          <div className="text-xs text-zinc-600">
            Showing {showingFrom}-{showingTo} of {totalRows} shipments
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={buildShipmentsPageHref(Math.max(1, currentPage - 1))}
              aria-disabled={currentPage <= 1}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                currentPage <= 1
                  ? "pointer-events-none border-zinc-100 bg-zinc-50 text-zinc-400"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              Previous
            </Link>
            {visiblePages.map((page, index) => {
              const previous = visiblePages[index - 1];
              const showGap = previous !== undefined && page - previous > 1;
              return (
                <span key={`page-slot-${page}`} className="inline-flex items-center gap-2">
                  {showGap ? <span className="text-xs text-zinc-400">...</span> : null}
                  <Link
                    href={buildShipmentsPageHref(page)}
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                      page === currentPage
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                    }`}
                  >
                    {page}
                  </Link>
                </span>
              );
            })}
            <Link
              href={buildShipmentsPageHref(Math.min(totalPages, currentPage + 1))}
              aria-disabled={currentPage >= totalPages}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                currentPage >= totalPages
                  ? "pointer-events-none border-zinc-100 bg-zinc-50 text-zinc-400"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              Next
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

