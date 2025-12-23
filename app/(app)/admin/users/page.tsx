import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { Roles, roleLabel, type Role } from "@/lib/domain";
import { hashPassword } from "@/lib/auth";
import { createUser, listUsers, setUserDisabled } from "@/lib/data/users";

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

  const users = listUsers();

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
      createUser({
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
    setUserDisabled(userId, disabled);
    redirect("/admin/users");
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
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2 pr-3 font-medium text-zinc-900">
                      {u.name}
                    </td>
                    <td className="py-2 pr-3 text-zinc-700">{u.phone}</td>
                    <td className="py-2 pr-3 text-zinc-700">
                      {roleLabel(u.role)}
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
                ))}
                {users.length === 0 ? (
                  <tr>
                    <td className="py-6 text-sm text-zinc-500" colSpan={5}>
                      No users yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
