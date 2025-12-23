import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser, assertCanWrite } from "@/lib/auth";
import { PartyTypes, type PartyType } from "@/lib/domain";
import { listParties } from "@/lib/data/parties";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

function partyTypeLabel(type: PartyType) {
  switch (type) {
    case "CUSTOMER":
      return "Customers";
    case "SUPPLIER":
      return "Suppliers";
    case "CUSTOMS_BROKER":
      return "Customs Brokers";
  }
}

export default async function PartiesPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const user = await requireUser();
  const resolved = searchParams
    ? await Promise.resolve(searchParams)
    : ({} as SearchParams);
  const typeRaw = readParam(resolved, "type");
  const q = readParam(resolved, "q") ?? "";
  const type = PartyTypes.includes(typeRaw as PartyType)
    ? (typeRaw as PartyType)
    : "CUSTOMER";

  const parties = listParties({ type, q: q.trim() || undefined });

  async function createRedirectAction() {
    "use server";
    const user = await requireUser();
    assertCanWrite(user);
    redirect(`/parties/new?type=${type}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Parties</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Customers, suppliers, and customs brokers.
          </p>
        </div>

        <form action={createRedirectAction}>
          <button
            type="submit"
            disabled={user.role === "FINANCE"}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            New party
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PartyTypes.map((t) => (
          <Link
            key={t}
            href={`/parties?type=${t}`}
            className={
              t === type
                ? "rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
                : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            }
          >
            {partyTypeLabel(t)}
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-zinc-900">
            {partyTypeLabel(type)}
          </div>
          <form className="flex items-center gap-2" method="get">
            <input type="hidden" name="type" value={type} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name..."
              className="w-64 max-w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Filter
            </button>
          </form>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {parties.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-4 font-medium text-zinc-900">
                    {p.name}
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">{p.phone ?? "—"}</td>
                  <td className="py-2 pr-4 text-zinc-700">{p.email ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <Link
                      href={`/parties/${p.id}`}
                      className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {parties.length === 0 ? (
                <tr>
                  <td className="py-6 text-sm text-zinc-500" colSpan={4}>
                    No {partyTypeLabel(type).toLowerCase()}.
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
