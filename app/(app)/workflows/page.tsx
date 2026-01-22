import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { listWorkflowTemplates } from "@/lib/data/workflows";

export default async function WorkflowsPage() {
  await requireAdmin();
  const templates = await listWorkflowTemplates({ includeArchived: false });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Workflows</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Build workflow templates and rules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/workflows/rules"
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Rules
          </Link>
          <Link
            href="/workflows/new"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            New template
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Description</th>
                <th className="py-2 pr-4">Updated</th>
                <th className="py-2 pr-4"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {templates.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 pr-4 font-medium text-zinc-900">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{t.name}</span>
                      {t.is_subworkflow ? (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                          Subworkflow
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">
                    {t.description ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-zinc-700">
                    {new Date(t.updated_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    <Link
                      href={`/workflows/${t.id}`}
                      className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {templates.length === 0 ? (
                <tr>
                  <td className="py-6 text-sm text-zinc-500" colSpan={4}>
                    No templates yet.
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
