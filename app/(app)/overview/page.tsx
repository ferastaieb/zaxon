import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { requireAdmin } from "@/lib/auth";
import {
  getManagementOverview,
  type OverviewFocusType,
  type OverviewKpi,
  type OverviewRange,
} from "@/lib/data/managementOverview";
import {
  overallStatusLabel,
  type ShipmentOverallStatus,
  type ShipmentType,
  type TransportMode,
} from "@/lib/domain";

type SearchParams = Record<string, string | string[] | undefined>;

const DEFAULT_RANGE: OverviewRange = "30d";

type OverviewQueryState = {
  range: OverviewRange;
  focusType: string;
  focusValue: string;
};

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function buildOverviewHref(state: OverviewQueryState) {
  const params = new URLSearchParams();
  if (state.range !== DEFAULT_RANGE) {
    params.set("range", state.range);
  }
  const focusType = state.focusType.trim();
  const focusValue = state.focusValue.trim();
  if (focusType && focusValue) {
    params.set("focusType", focusType);
    params.set("focusValue", focusValue);
  }
  const query = params.toString();
  return query ? `/overview?${query}` : "/overview";
}

function shipmentKindLabel(kind: "STANDARD" | "MASTER" | "SUBSHIPMENT") {
  if (kind === "MASTER") return "Master";
  if (kind === "SUBSHIPMENT") return "Subshipment";
  return "Standard";
}

function shipmentModeLabel(input: {
  shipment_type: ShipmentType;
  cargo_description: string;
  transport_mode: TransportMode;
}) {
  const cargo = input.cargo_description.toLowerCase();
  if (cargo.includes("ftl")) return "FTL";
  if (cargo.includes("import transfer of ownership")) return "Import Transfer";
  if (input.shipment_type === "LAND") return "LAND";
  if (input.transport_mode === "SEA_LAND") return "Sea + Land";
  if (input.transport_mode === "LAND") return "Land";
  return "Sea";
}

function statusTone(status: ShipmentOverallStatus) {
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

function deltaLabel(value: number | null) {
  if (value === null) return null;
  if (value > 0) return `+${value} vs previous`;
  if (value < 0) return `${value} vs previous`;
  return "No change vs previous";
}

function kpiToneClasses(kpi: OverviewKpi) {
  if (kpi.id === "delayed") {
    return "border-yellow-200 bg-yellow-50";
  }
  if (kpi.id === "completed") {
    return "border-green-200 bg-green-50";
  }
  if (kpi.id === "in_progress") {
    return "border-blue-200 bg-blue-50";
  }
  if (kpi.id === "tracked") {
    return "border-indigo-200 bg-indigo-50";
  }
  return "border-zinc-200 bg-white";
}

export default async function ManagementOverviewPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  await requireAdmin();
  const resolved = searchParams
    ? await Promise.resolve(searchParams)
    : ({} as SearchParams);

  const rangeRaw = readParam(resolved, "range");
  const focusTypeRaw = readParam(resolved, "focusType");
  const focusValueRaw = readParam(resolved, "focusValue");

  const data = await getManagementOverview({
    range: rangeRaw ?? null,
    focusType: focusTypeRaw ?? null,
    focusValue: focusValueRaw ?? null,
  });

  const activeFocusType = data.focus.type;
  const activeFocusValue = data.focus.value;
  const currentCount =
    data.range_summaries.find((entry) => entry.range === data.range)?.shipment_count ??
    0;

  const queryState: OverviewQueryState = {
    range: data.range,
    focusType: activeFocusType ?? "",
    focusValue: activeFocusValue ?? "",
  };

  const clearFocusHref = buildOverviewHref({
    ...queryState,
    focusType: "",
    focusValue: "",
  });

  const focusHref = (focusType: OverviewFocusType, focusValue: string) =>
    buildOverviewHref({
      ...queryState,
      focusType,
      focusValue,
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Management Overview</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Consolidated admin dashboard for shipments, customers, lines, and tracking.
          </p>
          <div className="mt-2 text-xs text-zinc-500">
            Date basis: Last update {"|"} Generated:{" "}
            {new Date(data.generated_at).toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
          {data.period.start_at ? (
            <>
              {new Date(data.period.start_at).toLocaleDateString()} {"->"}{" "}
              {new Date(data.period.end_at).toLocaleDateString()}
            </>
          ) : (
            "All available history"
          )}
        </div>
      </div>

      {!data.focus.valid && (data.focus.requested_type || data.focus.requested_value) ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Invalid focus filter was ignored.{" "}
          <Link href={clearFocusHref} className="font-medium underline underline-offset-2">
            Reset filter
          </Link>
        </div>
      ) : null}

      {currentCount === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
          No shipments were updated in this period.{" "}
          <Link href="/overview?range=all" className="font-medium text-zinc-900 underline">
            View all time
          </Link>
          .
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {data.range_summaries.map((entry) => {
            const keepFocus =
              !!activeFocusType &&
              !!activeFocusValue &&
              data.focus.available_by_range[entry.range];
            const href = buildOverviewHref({
              range: entry.range,
              focusType: keepFocus ? activeFocusType : "",
              focusValue: keepFocus ? activeFocusValue : "",
            });

            return (
              <Link
                key={entry.range}
                href={href}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  entry.range === data.range
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {entry.label} ({entry.shipment_count})
              </Link>
            );
          })}
          {activeFocusType && activeFocusValue ? (
            <div className="ml-auto flex items-center gap-2">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600">
                Focus: {data.focus.label ?? activeFocusValue}
              </span>
              <Link
                href={clearFocusHref}
                className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
              >
                Clear focus
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.kpis.map((kpi) => {
          const href =
            kpi.focus_type && kpi.focus_value
              ? focusHref(kpi.focus_type, kpi.focus_value)
              : clearFocusHref;
          const delta = deltaLabel(kpi.delta);

          return (
            <Link
              key={kpi.id}
              href={href}
              className={`rounded-xl border p-4 shadow-sm transition hover:shadow ${kpiToneClasses(
                kpi,
              )}`}
            >
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {kpi.label}
              </div>
              <div className="mt-2 text-3xl font-semibold text-zinc-900">{kpi.value}</div>
              <div className="mt-1 text-xs text-zinc-500">{delta ?? "No period delta"}</div>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">By status</h2>
          <div className="mt-3 space-y-2">
            {data.distributions.by_status.map((row) => (
              <Link
                key={row.key}
                href={
                  row.focus_type && row.focus_value
                    ? focusHref(row.focus_type, row.focus_value)
                    : clearFocusHref
                }
                className="block rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 hover:bg-zinc-100"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-700">{row.label}</span>
                  <span className="text-zinc-600">
                    {row.count} ({row.percentage}%)
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-zinc-200">
                  <div
                    className="h-1.5 rounded bg-zinc-900"
                    style={{ width: `${row.percentage}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">By kind</h2>
          <div className="mt-3 space-y-2">
            {data.distributions.by_kind.map((row) => (
              <Link
                key={row.key}
                href={
                  row.focus_type && row.focus_value
                    ? focusHref(row.focus_type, row.focus_value)
                    : clearFocusHref
                }
                className="block rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 hover:bg-zinc-100"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-700">{row.label}</span>
                  <span className="text-zinc-600">
                    {row.count} ({row.percentage}%)
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-zinc-200">
                  <div
                    className="h-1.5 rounded bg-zinc-900"
                    style={{ width: `${row.percentage}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">By mode</h2>
          <div className="mt-3 space-y-2">
            {data.distributions.by_mode.map((row) => (
              <Link
                key={row.key}
                href={
                  row.focus_type && row.focus_value
                    ? focusHref(row.focus_type, row.focus_value)
                    : clearFocusHref
                }
                className="block rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 hover:bg-zinc-100"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-700">{row.label}</span>
                  <span className="text-zinc-600">
                    {row.count} ({row.percentage}%)
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-zinc-200">
                  <div
                    className="h-1.5 rounded bg-zinc-900"
                    style={{ width: `${row.percentage}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Top route lanes</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-2 pr-3">Lane</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">In progress</th>
                  <th className="py-2 pr-3">Completed</th>
                  <th className="py-2 pr-3">Delayed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.lanes.map((lane) => (
                  <tr key={lane.key}>
                    <td className="py-2 pr-3 text-zinc-700">{lane.label}</td>
                    <td className="py-2 pr-3">
                      <Link
                        href={focusHref("lane", lane.focus_value)}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {lane.total}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-zinc-700">{lane.in_progress}</td>
                    <td className="py-2 pr-3 text-zinc-700">{lane.completed}</td>
                    <td className="py-2 pr-3 text-zinc-700">{lane.delayed}</td>
                  </tr>
                ))}
                {data.lanes.length === 0 ? (
                  <tr>
                    <td className="py-6 text-sm text-zinc-500" colSpan={5}>
                      No lanes available for this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Border agent lines</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-2 pr-3">Border</th>
                  <th className="py-2 pr-3">Agent</th>
                  <th className="py-2 pr-3">Shipments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.agents.map((agent) => (
                  <tr key={agent.key}>
                    <td className="py-2 pr-3 text-zinc-700">{agent.border}</td>
                    <td className="py-2 pr-3 text-zinc-700">{agent.agent}</td>
                    <td className="py-2 pr-3">
                      <Link
                        href={focusHref("agent", agent.focus_value)}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {agent.shipment_count}
                      </Link>
                    </td>
                  </tr>
                ))}
                {data.agents.length === 0 ? (
                  <tr>
                    <td className="py-6 text-sm text-zinc-500" colSpan={3}>
                      No customs agent assignments in this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm xl:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-900">Tracking overview</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs text-zinc-500">Tracked</div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900">
                {data.tracking.tracked}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs text-zinc-500">Untracked</div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900">
                {data.tracking.untracked}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs text-zinc-500">Coverage</div>
              <div className="mt-1 text-2xl font-semibold text-zinc-900">
                {data.tracking.coverage_percent}%
              </div>
              <div className="mt-2 h-1.5 rounded bg-zinc-200">
                <div
                  className="h-1.5 rounded bg-zinc-900"
                  style={{ width: `${data.tracking.coverage_percent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-2 pr-3">Region</th>
                  <th className="py-2 pr-3">Pending</th>
                  <th className="py-2 pr-3">In progress</th>
                  <th className="py-2 pr-3">Done</th>
                  <th className="py-2 pr-3">Blocked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.tracking.regions.map((region) => (
                  <tr key={region.region_id}>
                    <td className="py-2 pr-3 font-medium text-zinc-900">{region.label}</td>
                    <td className="py-2 pr-3 text-zinc-700">{region.pending}</td>
                    <td className="py-2 pr-3 text-zinc-700">{region.in_progress}</td>
                    <td className="py-2 pr-3 text-zinc-700">{region.done}</td>
                    <td className="py-2 pr-3 text-zinc-700">{region.blocked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Operational health</h2>
          <div className="mt-3 space-y-2 text-sm text-zinc-700">
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span>Open workload</span>
              <span className="font-semibold text-zinc-900">
                {data.operational_health.open_workload}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span>Open tasks</span>
              <span>{data.operational_health.open_tasks}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span>In-progress tasks</span>
              <span>{data.operational_health.in_progress_tasks}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span>Blocked tasks</span>
              <span>{data.operational_health.blocked_tasks}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span>Open exceptions</span>
              <span>{data.operational_health.exceptions_open}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span>Resolved exceptions</span>
              <span>{data.operational_health.exceptions_resolved}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span>Open document requests</span>
              <span>{data.operational_health.document_requests_open}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
              <span>Fulfilled document requests</span>
              <span>{data.operational_health.document_requests_fulfilled}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Top customers</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Shipments</th>
                  <th className="py-2 pr-3">Completed</th>
                  <th className="py-2 pr-3">Delayed</th>
                  <th className="py-2 pr-3">Tracked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.top_customers.map((customer) => (
                  <tr key={customer.customer_id}>
                    <td className="py-2 pr-3 text-zinc-700">{customer.customer_name}</td>
                    <td className="py-2 pr-3">
                      <Link
                        href={focusHref("customer", customer.focus_value)}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {customer.shipment_count}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-zinc-700">{customer.completed_count}</td>
                    <td className="py-2 pr-3 text-zinc-700">{customer.delayed_count}</td>
                    <td className="py-2 pr-3 text-zinc-700">{customer.tracked_count}</td>
                  </tr>
                ))}
                {data.top_customers.length === 0 ? (
                  <tr>
                    <td className="py-6 text-sm text-zinc-500" colSpan={5}>
                      No customer activity in this period.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Workflow usage</h2>
          <div className="mt-3 space-y-2">
            {data.workflows.map((workflow) => (
              <div
                key={`${workflow.template_id ?? "none"}-${workflow.template_name}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm"
              >
                <span className="truncate pr-3 text-zinc-700">{workflow.template_name}</span>
                <span className="font-medium text-zinc-900">{workflow.shipment_count}</span>
              </div>
            ))}
            {data.workflows.length === 0 ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
                No workflow usage in this period.
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Recent activity</h2>
        <div className="mt-3 space-y-2">
          {data.recent_activity.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                <div>
                  {new Date(item.created_at).toLocaleString()} {"|"} {item.type}
                  {item.actor_name ? ` | ${item.actor_name}` : ""}
                </div>
                {item.shipment_id ? (
                  <Link
                    href={`/shipments/${item.shipment_id}`}
                    className="font-medium text-zinc-700 hover:underline"
                  >
                    {item.shipment_code ?? `Shipment #${item.shipment_id}`}
                  </Link>
                ) : null}
              </div>
              <div className="mt-1 text-sm text-zinc-800">{item.message}</div>
            </div>
          ))}
          {data.recent_activity.length === 0 ? (
            <div className="text-sm text-zinc-500">No activity in this period.</div>
          ) : null}
        </div>
      </div>

      {activeFocusType && activeFocusValue ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-900">
              Focused shipments {data.focus.label ? `- ${data.focus.label}` : ""}
            </h2>
            <Link
              href={clearFocusHref}
              className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
            >
              Clear focus
            </Link>
          </div>
          {data.focus.shipments.length === 0 ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              No shipments match this focus in the selected range.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="whitespace-nowrap py-2 pl-4 pr-4">Shipment ID</th>
                    <th className="whitespace-nowrap py-2 pr-4">Kind</th>
                    <th className="whitespace-nowrap py-2 pr-4">Customer</th>
                    <th className="whitespace-nowrap py-2 pr-4">Mode</th>
                    <th className="whitespace-nowrap py-2 pr-4">Status</th>
                    <th className="whitespace-nowrap py-2 pr-4">Last update</th>
                    <th className="whitespace-nowrap py-2 pr-4">Route</th>
                    <th className="whitespace-nowrap py-2 pr-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.focus.shipments.map((shipment) => {
                    const openHref =
                      shipment.shipment_kind === "SUBSHIPMENT" &&
                      shipment.master_shipment_id
                        ? `/shipments/master/${shipment.master_shipment_id}`
                        : `/shipments/${shipment.id}`;

                    return (
                      <tr key={shipment.id} className="transition-colors hover:bg-zinc-50/90">
                        <td className="whitespace-nowrap py-2.5 pl-4 pr-4 font-medium text-zinc-900">
                          {shipment.shipment_code}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4 text-zinc-700">
                          {shipmentKindLabel(shipment.shipment_kind)}
                        </td>
                        <td className="max-w-56 truncate py-2.5 pr-4 text-zinc-700">
                          {shipment.customer_names ?? "-"}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4 text-zinc-700">
                          {shipmentModeLabel({
                            shipment_type: shipment.shipment_type,
                            cargo_description: shipment.cargo_description,
                            transport_mode: shipment.transport_mode,
                          })}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4">
                          <Badge tone={statusTone(shipment.overall_status)}>
                            {overallStatusLabel(shipment.overall_status)}
                          </Badge>
                        </td>
                        <td
                          className="whitespace-nowrap py-2.5 pr-4 text-zinc-700"
                          title={new Date(shipment.last_update_at).toLocaleString()}
                        >
                          <div className="text-sm">
                            {relativeTimeLabel(shipment.last_update_at)}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {new Date(shipment.last_update_at).toLocaleString()}
                          </div>
                        </td>
                        <td className="max-w-56 truncate py-2.5 pr-4 text-zinc-700">
                          {shipment.origin} {"->"} {shipment.destination}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pr-4">
                          <Link
                            href={openHref}
                            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
