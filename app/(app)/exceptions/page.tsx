import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { listExceptionTypes } from "@/lib/data/exceptions";
import { riskLabel } from "@/lib/domain";
import { Badge } from "@/components/ui/Badge";

export default async function ExceptionsPage() {
  await requireAdmin();
  const exceptions = listExceptionTypes({ includeArchived: false });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Exceptions</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage common issues and playbooks (tasks + customer message).
          </p>
        </div>
        <Link
          href="/exceptions/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          New exception
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Default risk</th>
                <th className="py-2 pr-4">Updated</th>
                <th className="py-2 pr-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {exceptions.map((e) => (
                <tr key={e.id}>
                  <td className="py-2 pr-4 font-medium text-zinc-900">
                    {e.name}
                  </td>
                  <td className="py-2 pr-4">
                    <Badge tone={e.default_risk === "BLOCKED" ? "red" : "yellow"}>
                      {riskLabel(e.default_risk)}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">
                    {new Date(e.updated_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    <Link
                      href={`/exceptions/${e.id}`}
                      className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {exceptions.length === 0 ? (
                <tr>
                  <td className="py-6 text-sm text-zinc-500" colSpan={4}>
                    No exceptions yet.
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
