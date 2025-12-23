import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { listAlerts, markAlertRead } from "@/lib/data/alerts";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const user = await requireUser();
  const resolved = searchParams
    ? await Promise.resolve(searchParams)
    : ({} as SearchParams);
  const showAll = readParam(resolved, "all") === "1";

  const alerts = listAlerts(user.id, { includeRead: showAll });

  async function markReadAction(formData: FormData) {
    "use server";
    const user = await requireUser();
    const alertId = Number(formData.get("alertId") ?? 0);
    if (!alertId) redirect("/alerts");
    markAlertRead(alertId, user.id);
    redirect("/alerts");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Alerts</h1>
          <p className="mt-1 text-sm text-zinc-600">
            SLA warnings and important updates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={showAll ? "/alerts" : "/alerts?all=1"}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {showAll ? "Show unread only" : "Show all"}
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="space-y-2">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4"
            >
              <div className="min-w-0">
                <div className="text-xs text-zinc-500">
                  {new Date(a.created_at).toLocaleString()} • {a.type}
                  {a.shipment_code ? ` • ${a.shipment_code}` : ""}
                </div>
                <div className="mt-1 text-sm font-medium text-zinc-900">
                  {a.message}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {a.shipment_id ? (
                  <Link
                    href={`/shipments/${a.shipment_id}`}
                    className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Open
                  </Link>
                ) : null}
                {!a.is_read ? (
                  <form action={markReadAction}>
                    <input type="hidden" name="alertId" value={a.id} />
                    <button
                      type="submit"
                      className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Mark read
                    </button>
                  </form>
                ) : (
                  <span className="text-xs text-zinc-500">Read</span>
                )}
              </div>
            </div>
          ))}
          {alerts.length === 0 ? (
            <div className="text-sm text-zinc-500">No alerts.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
