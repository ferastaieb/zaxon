import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { Roles, roleLabel, type Role } from "@/lib/domain";
import { hashPassword } from "@/lib/auth";
import { createUser, listUsers, listUserSummaries, setUserDisabled } from "@/lib/data/users";
import { importSqliteBuffer } from "@/lib/importSqlite";

export const runtime = "nodejs";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function UsersAdminPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  await requireAdmin();
  const resolved = searchParams
    ? await Promise.resolve(searchParams)
    : ({} as SearchParams);
  const error = readParam(resolved, "error");
  const importResult = readParam(resolved, "import");
  const importCount = readParam(resolved, "imported");
  const importError = readParam(resolved, "importError");

  const users = await listUsers();
  const summaries = await listUserSummaries();
  const summaryById = new Map(summaries.map((s) => [s.user_id, s]));

  async function createUserAction(formData: FormData) {
    "use server";
    await requireAdmin();

    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const role = String(formData.get("role") ?? "") as Role;
    const password = String(formData.get("password") ?? "");

    if (!name || !phone || !Roles.includes(role) || password.length < 6) {
      redirect("/admin/users?error=invalid");
    }

    try {
      await createUser({
        name,
        phone,
        role,
        passwordHash: hashPassword(password),
      });
    } catch {
      redirect("/admin/users?error=phone");
    }

    redirect("/admin/users");
  }

  async function toggleDisabledAction(formData: FormData) {
    "use server";
    await requireAdmin();

    const userId = Number(formData.get("userId") ?? 0);
    const disabled = String(formData.get("disabled") ?? "") === "1";
    if (!userId) redirect("/admin/users?error=invalid");
    await setUserDisabled(userId, disabled);
    redirect("/admin/users");
  }

  async function importSqliteAction(formData: FormData) {
    "use server";
    await requireAdmin();

    const fileValue = formData.get("sqliteFile");
    if (!fileValue || typeof fileValue === "string") {
      redirect("/admin/users?importError=missing");
    }

    const file = fileValue as File;
    if (!file.size) {
      redirect("/admin/users?importError=empty");
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const summary = await importSqliteBuffer(buffer);
      redirect(`/admin/users?import=success&imported=${summary.totalRows}`);
    } catch (err) {
      console.error("Failed to import sqlite data.", err);
      const message = err instanceof Error ? err.message : "";
      const code = message === "invalid_sqlite" ? "invalid" : "failed";
      redirect(`/admin/users?importError=${code}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Create accounts and manage access.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error === "phone"
            ? "Phone number is already used."
            : "Please check the inputs."}
        </div>
      ) : null}

      {importResult === "success" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Imported {importCount ?? "data"} rows into DynamoDB.
        </div>
      ) : null}

      {importError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {importError === "missing"
            ? "Upload a SQLite file to start the import."
            : importError === "empty"
              ? "The uploaded file is empty."
              : importError === "invalid"
                ? "The file does not look like a valid SQLite database."
                : "Import failed. Check the server logs for details."}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Create user</h2>
          <form action={createUserAction} className="mt-4 space-y-3">
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">Name</div>
              <input
                name="name"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">
                Phone
              </div>
              <input
                name="phone"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">Role</div>
              <select
                name="role"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                defaultValue="OPERATIONS"
                required
              >
                {Roles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">
                Password
              </div>
              <input
                name="password"
                type="password"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                minLength={6}
                required
              />
              <div className="mt-1 text-xs text-zinc-500">
                Minimum 6 characters.
              </div>
            </label>

            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Create user
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">All users</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Phone</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Goods</th>
                  <th className="py-2 pr-3">Inventory</th>
                  <th className="py-2 pr-3">Shipments</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {users.map((u) => {
                  const summary = summaryById.get(u.id) ?? {
                    goods_count: 0,
                    inventory_goods_count: 0,
                    inventory_total_quantity: 0,
                    shipment_count: 0,
                  };
                  return (
                    <tr key={u.id}>
                      <td className="py-2 pr-3 font-medium text-zinc-900">
                        {u.name}
                      </td>
                      <td className="py-2 pr-3 text-zinc-700">{u.phone}</td>
                      <td className="py-2 pr-3 text-zinc-700">
                        {roleLabel(u.role)}
                      </td>
                      <td className="py-2 pr-3 text-zinc-700">
                        {summary.goods_count}
                      </td>
                      <td className="py-2 pr-3 text-zinc-700">
                        {summary.inventory_goods_count} items /{" "}
                        {summary.inventory_total_quantity}
                      </td>
                      <td className="py-2 pr-3 text-zinc-700">
                        {summary.shipment_count}
                      </td>
                      <td className="py-2 pr-3 text-zinc-700">
                        {u.disabled ? "Disabled" : "Active"}
                      </td>
                      <td className="py-2 pr-3">
                        <form action={toggleDisabledAction}>
                          <input type="hidden" name="userId" value={u.id} />
                          <input
                            type="hidden"
                            name="disabled"
                            value={u.disabled ? "0" : "1"}
                          />
                          <button
                            type="submit"
                            className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            {u.disabled ? "Enable" : "Disable"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 ? (
                  <tr>
                    <td className="py-6 text-sm text-zinc-500" colSpan={8}>
                      No users yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-zinc-900">
            Import from SQLite
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Upload the legacy SQLite database and migrate all tables into DynamoDB.
          </p>
          <form
            action={importSqliteAction}
            encType="multipart/form-data"
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <label className="block w-full sm:flex-1">
              <div className="mb-1 text-sm font-medium text-zinc-800">
                SQLite file
              </div>
              <input
                name="sqliteFile"
                type="file"
                accept=".sqlite,.db"
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                required
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Import data
            </button>
          </form>
          <p className="mt-2 text-xs text-zinc-500">
            This overwrites rows with matching keys and updates ID counters.
          </p>
        </div>
      </div>
    </div>
  );
}
