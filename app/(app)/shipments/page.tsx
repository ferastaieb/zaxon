import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { assertCanWrite, requireUser } from "@/lib/auth";
import {
  ShipmentOverallStatuses,
  TransportModes,
  overallStatusLabel,
  transportModeLabel,
  type ShipmentOverallStatus,
  type TransportMode,
} from "@/lib/domain";
import { listParties } from "@/lib/data/parties";
import {
  ShipmentKinds,
  ShipmentListSortByValues,
  ShipmentListSortDirValues,
  type ShipmentKind,
  type ShipmentListSortBy,
  type ShipmentListSortDir,
  listShipmentsForUser,
} from "@/lib/data/shipments";

type SearchParams = Record<string, string | string[] | undefined>;

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
type ShipmentsPageSize = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: ShipmentsPageSize = 10;
const DEFAULT_SORT_BY: ShipmentListSortBy = "last_update";

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
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

function pageSizeOrDefault(
  value: string | undefined,
  fallback: ShipmentsPageSize,
): ShipmentsPageSize {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (PAGE_SIZE_OPTIONS.includes(parsed as ShipmentsPageSize)) {
    return parsed as ShipmentsPageSize;
  }
  return fallback;
}

function shipmentKindLabel(kind: ShipmentKind) {
  if (kind === "MASTER") return "Master";
  if (kind === "SUBSHIPMENT") return "Subshipment";
  return "Standard";
}

function sortDirectionDefault(sortBy: ShipmentListSortBy): ShipmentListSortDir {
  return sortBy === "last_update" ? "desc" : "asc";
}

function shipmentStatusTone(status: ShipmentOverallStatus) {
  if (status === "IN_PROGRESS") return "blue";
  if (status === "COMPLETED") return "green";
  if (status === "DELAYED") return "yellow";
  return "zinc";
}

function relativeTimeLabel(isoDate: string) {
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return "Unknown";

  const deltaSeconds = Math.floor((Date.now() - timestamp) / 1000);
  const future = deltaSeconds < 0;
  const seconds = Math.abs(deltaSeconds);
  if (seconds < 60) return future ? "In a few seconds" : "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return future ? `In ${minutes} min` : `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return future ? `In ${hours} hr` : `${hours} hr ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return future ? `In ${days} day` : `${days} day ago`;

  return new Date(isoDate).toLocaleDateString();
}

type ShipmentsQueryState = {
  q: string;
  customerIdRaw: string;
  modeRaw: string;
  statusRaw: string;
  kindRaw: string;
  masterShipmentCode: string;
  page: number;
  pageSize: ShipmentsPageSize;
  sortBy: ShipmentListSortBy;
  sortDir: ShipmentListSortDir;
};

function buildShipmentsHref(state: ShipmentsQueryState) {
  const params = new URLSearchParams();
  const q = state.q.trim();
  const masterCode = state.masterShipmentCode.trim();
  if (q) params.set("q", q);
  if (state.customerIdRaw) params.set("customerId", state.customerIdRaw);
  if (state.modeRaw) params.set("mode", state.modeRaw);
  if (state.statusRaw) params.set("status", state.statusRaw);
  if (state.kindRaw) params.set("kind", state.kindRaw);
  if (masterCode) params.set("masterShipmentCode", masterCode);
  if (state.sortBy !== DEFAULT_SORT_BY) {
    params.set("sortBy", state.sortBy);
  }
  if (state.sortDir !== sortDirectionDefault(state.sortBy)) {
    params.set("sortDir", state.sortDir);
  }
  if (state.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set("pageSize", String(state.pageSize));
  }
  if (state.page > 1) {
    params.set("page", String(state.page));
  }
  const query = params.toString();
  return query ? `/shipments?${query}` : "/shipments";
}

const SORT_COLUMNS: Array<{
  key: ShipmentListSortBy;
  label: string;
  className: string;
}> = [
  { key: "shipment_code", label: "Shipment ID", className: "whitespace-nowrap py-2 pl-4 pr-4" },
  { key: "kind", label: "Kind", className: "whitespace-nowrap py-2 pr-4" },
  { key: "customer", label: "Customer", className: "whitespace-nowrap py-2 pr-4" },
  { key: "mode", label: "Mode", className: "whitespace-nowrap py-2 pr-4" },
  { key: "status", label: "Status", className: "whitespace-nowrap py-2 pr-4" },
  { key: "last_update", label: "Last update", className: "whitespace-nowrap py-2 pr-4" },
];

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
  const kindRaw = readParam(resolved, "kind");
  const kind = ShipmentKinds.includes(kindRaw as ShipmentKind)
    ? (kindRaw as ShipmentKind)
    : undefined;
  const masterShipmentCode = readParam(resolved, "masterShipmentCode") ?? "";
  const sortByRaw = readParam(resolved, "sortBy");
  const sortBy = ShipmentListSortByValues.includes(sortByRaw as ShipmentListSortBy)
    ? (sortByRaw as ShipmentListSortBy)
    : DEFAULT_SORT_BY;
  const sortDirRaw = readParam(resolved, "sortDir");
  const sortDir = ShipmentListSortDirValues.includes(sortDirRaw as ShipmentListSortDir)
    ? (sortDirRaw as ShipmentListSortDir)
    : sortDirectionDefault(sortBy);
  const pageSizeRaw = readParam(resolved, "pageSize");
  const pageSize = pageSizeOrDefault(pageSizeRaw, DEFAULT_PAGE_SIZE);
  const pageRaw = readParam(resolved, "page");

  const customers = await listParties({ type: "CUSTOMER" });
  const customersById = new Map(customers.map((customer) => [String(customer.id), customer.name]));
  const shipments = await listShipmentsForUser({
    userId: user.id,
    role: user.role,
    q: q.trim() || undefined,
    customerId: Number.isFinite(customerId) ? customerId : undefined,
    transportMode: mode,
    status,
    kind,
    masterShipmentCode: masterShipmentCode.trim() || undefined,
    sortBy,
    sortDir,
  });

  const requestedPage = positiveIntOrDefault(pageRaw, 1);
  const totalRows = shipments.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const paginatedShipments = shipments.slice(pageStart, pageEnd);
  const showingFrom = totalRows === 0 ? 0 : pageStart + 1;
  const showingTo = Math.min(pageEnd, totalRows);

  const queryState: ShipmentsQueryState = {
    q,
    customerIdRaw: customerIdRaw ?? "",
    modeRaw: modeRaw ?? "",
    statusRaw: statusRaw ?? "",
    kindRaw: kindRaw ?? "",
    masterShipmentCode,
    page: currentPage,
    pageSize,
    sortBy,
    sortDir,
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

  const hasActiveFilters =
    !!q.trim() ||
    !!customerIdRaw ||
    !!modeRaw ||
    !!statusRaw ||
    !!kindRaw ||
    !!masterShipmentCode.trim();

  const activeFilterChips = [
    q.trim()
      ? {
          id: "q",
          label: "Search",
          value: q.trim(),
          href: buildShipmentsHref({
            ...queryState,
            q: "",
            page: 1,
          }),
        }
      : null,
    customerIdRaw
      ? {
          id: "customerId",
          label: "Customer",
          value: customersById.get(customerIdRaw) ?? customerIdRaw,
          href: buildShipmentsHref({
            ...queryState,
            customerIdRaw: "",
            page: 1,
          }),
        }
      : null,
    modeRaw
      ? {
          id: "mode",
          label: "Mode",
          value: mode ? transportModeLabel(mode) : modeRaw,
          href: buildShipmentsHref({
            ...queryState,
            modeRaw: "",
            page: 1,
          }),
        }
      : null,
    statusRaw
      ? {
          id: "status",
          label: "Status",
          value: status ? overallStatusLabel(status) : statusRaw,
          href: buildShipmentsHref({
            ...queryState,
            statusRaw: "",
            page: 1,
          }),
        }
      : null,
    kindRaw
      ? {
          id: "kind",
          label: "Kind",
          value: kind ? shipmentKindLabel(kind) : kindRaw,
          href: buildShipmentsHref({
            ...queryState,
            kindRaw: "",
            page: 1,
          }),
        }
      : null,
    masterShipmentCode.trim()
      ? {
          id: "masterShipmentCode",
          label: "Master",
          value: masterShipmentCode.trim(),
          href: buildShipmentsHref({
            ...queryState,
            masterShipmentCode: "",
            page: 1,
          }),
        }
      : null,
  ].filter((entry): entry is NonNullable<typeof entry> => !!entry);

  const sortHref = (column: ShipmentListSortBy) => {
    const nextDir =
      sortBy === column ? (sortDir === "asc" ? "desc" : "asc") : sortDirectionDefault(column);
    return buildShipmentsHref({
      ...queryState,
      sortBy: column,
      sortDir: nextDir,
      page: 1,
    });
  };

  async function createShipmentRedirectAction() {
    "use server";
    const user = await requireUser();
    assertCanWrite(user);
    redirect("/shipments/new");
  }

  async function createMasterShipmentRedirectAction() {
    "use server";
    const user = await requireUser();
    assertCanWrite(user);
    redirect("/shipments/master/new");
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
            <SubmitButton
              pendingLabel="Loading..."
              disabled={user.role === "FINANCE"}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              Create shipment
            </SubmitButton>
          </form>
          <form action={createMasterShipmentRedirectAction}>
            <SubmitButton
              pendingLabel="Loading..."
              disabled={user.role === "FINANCE"}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
            >
              Create master shipment
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Shipment Directory</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Search, filter, and sort shipments quickly.
            </p>
          </div>
          <div className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600">
            {totalRows} result(s)
          </div>
        </div>

        <form className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 lg:p-5" method="get">
          <input type="hidden" name="sortBy" value={sortBy} />
          <input type="hidden" name="sortDir" value={sortDir} />
          <input type="hidden" name="pageSize" value={String(pageSize)} />

          <div className="grid gap-3 xl:grid-cols-12">
            <label className="block xl:col-span-4">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                Search
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="h-4 w-4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <circle cx="9" cy="9" r="6" />
                    <path d="M13.5 13.5L18 18" />
                  </svg>
                </span>
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Shipment ID, customer, container/B/L/job..."
                  className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
                />
              </div>
            </label>

            <label className="block xl:col-span-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                Customer
              </div>
              <select
                name="customerId"
                defaultValue={customerIdRaw ?? ""}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              >
                <option value="">All customers</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block xl:col-span-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                Transport mode
              </div>
              <select
                name="mode"
                defaultValue={modeRaw ?? ""}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              >
                <option value="">All modes</option>
                {TransportModes.map((transportMode) => (
                  <option key={transportMode} value={transportMode}>
                    {transportModeLabel(transportMode)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block xl:col-span-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                Status
              </div>
              <select
                name="status"
                defaultValue={statusRaw ?? ""}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              >
                <option value="">All statuses</option>
                {ShipmentOverallStatuses.map((shipmentStatus) => (
                  <option key={shipmentStatus} value={shipmentStatus}>
                    {overallStatusLabel(shipmentStatus)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block xl:col-span-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                Kind
              </div>
              <select
                name="kind"
                defaultValue={kindRaw ?? ""}
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              >
                <option value="">All kinds</option>
                {ShipmentKinds.map((entry) => (
                  <option key={entry} value={entry}>
                    {shipmentKindLabel(entry)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block xl:col-span-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                Master reference
              </div>
              <input
                name="masterShipmentCode"
                defaultValue={masterShipmentCode}
                placeholder="MSH-000001"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200"
              />
            </label>

            <div className="flex flex-wrap items-end justify-start gap-2 xl:col-span-9 xl:justify-end">
              <button
                type="submit"
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
              >
                Apply filters
              </button>
              <Link
                href="/shipments"
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100"
              >
                Clear all
              </Link>
            </div>
          </div>
        </form>

        {hasActiveFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Active
            </span>
            {activeFilterChips.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700"
              >
                <span className="font-medium text-zinc-600">{chip.label}:</span>
                <span className="max-w-44 truncate text-zinc-900">{chip.value}</span>
                <Link
                  href={chip.href}
                  className="rounded-full px-1 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-900"
                  aria-label={`Remove ${chip.label} filter`}
                >
                  x
                </Link>
              </span>
            ))}
            <Link
              href="/shipments"
              className="ml-auto text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              Clear all filters
            </Link>
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto rounded-xl border border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500">
              <tr>
                {SORT_COLUMNS.map((column) => {
                  const isActive = sortBy === column.key;
                  return (
                    <th key={column.key} className={column.className}>
                      <Link
                        href={sortHref(column.key)}
                        className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <span>{column.label}</span>
                        {isActive ? (
                          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                            {sortDir === "asc" ? "asc" : "desc"}
                          </span>
                        ) : null}
                      </Link>
                    </th>
                  );
                })}
                <th className="whitespace-nowrap py-2 pr-4">Route</th>
                <th className="whitespace-nowrap py-2 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {paginatedShipments.map((shipment) => {
                const openHref =
                  shipment.shipment_kind === "SUBSHIPMENT" && shipment.master_shipment_id
                    ? `/shipments/master/${shipment.master_shipment_id}`
                    : `/shipments/${shipment.id}`;

                return (
                  <tr key={shipment.id} className="transition-colors hover:bg-zinc-50/90">
                    <td className="whitespace-nowrap py-2.5 pl-4 pr-4 font-medium text-zinc-900">
                      <div className="whitespace-nowrap">{shipment.shipment_code}</div>
                      {shipment.job_ids ? (
                        <div className="mt-0.5 max-w-56 truncate whitespace-nowrap text-xs font-normal text-zinc-500">
                          Job: {shipment.job_ids}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-zinc-700">
                      <div>{shipmentKindLabel(shipment.shipment_kind)}</div>
                      {shipment.master_shipment_code ? (
                        <div className="mt-0.5 text-xs text-zinc-500">
                          Master: {shipment.master_shipment_code}
                        </div>
                      ) : null}
                    </td>
                    <td className="max-w-52 py-2.5 pr-4 text-zinc-700">
                      <div className="truncate" title={shipment.customer_names ?? "-"}>
                        {shipment.customer_names ?? "-"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-zinc-700">
                      {shipmentModeLabel({
                        shipment_type: shipment.shipment_type,
                        cargo_description: shipment.cargo_description,
                      })}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4">
                      <Badge tone={shipmentStatusTone(shipment.overall_status)}>
                        {overallStatusLabel(shipment.overall_status)}
                      </Badge>
                    </td>
                    <td
                      className="whitespace-nowrap py-2.5 pr-4 text-zinc-700"
                      title={new Date(shipment.last_update_at).toLocaleString()}
                    >
                      <div className="text-sm">{relativeTimeLabel(shipment.last_update_at)}</div>
                      <div className="text-xs text-zinc-500">
                        {new Date(shipment.last_update_at).toLocaleString()}
                      </div>
                    </td>
                    <td className="max-w-56 py-2.5 pr-4 text-zinc-700">
                      <div
                        className="truncate"
                        title={`${shipment.origin} -> ${shipment.destination}`}
                      >
                        {shipment.origin} {"->"} {shipment.destination}
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4">
                      <Link
                        href={openHref}
                        className="whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {paginatedShipments.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center" colSpan={8}>
                    <div className="mx-auto max-w-md space-y-3">
                      <div className="text-sm font-medium text-zinc-900">
                        No shipments match the current filters.
                      </div>
                      <div className="text-xs text-zinc-500">
                        Try removing one or more filters, or create a new shipment.
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {user.role !== "FINANCE" ? (
                          <Link
                            href="/shipments/new"
                            className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-800"
                          >
                            Create shipment
                          </Link>
                        ) : null}
                        <Link
                          href="/shipments"
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          Reset filters
                        </Link>
                      </div>
                    </div>
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
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500">Rows:</span>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <Link
                  key={size}
                  href={buildShipmentsHref({
                    ...queryState,
                    pageSize: size,
                    page: 1,
                  })}
                  className={`rounded-md border px-2 py-1 text-xs font-medium ${
                    pageSize === size
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {size}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={buildShipmentsHref({
                  ...queryState,
                  page: Math.max(1, currentPage - 1),
                })}
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
                      href={buildShipmentsHref({
                        ...queryState,
                        page,
                      })}
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
                href={buildShipmentsHref({
                  ...queryState,
                  page: Math.min(totalPages, currentPage + 1),
                })}
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
    </div>
  );
}
