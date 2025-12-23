import { redirect } from "next/navigation";

import { createSession, getCurrentUser, verifyPassword } from "@/lib/auth";
import { countUsers, getUserByPhone } from "@/lib/data/users";

type SearchParams = Record<string, string | string[] | undefined>;

function readParam(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolved = searchParams
    ? await Promise.resolve(searchParams)
    : ({} as SearchParams);

  if (countUsers() === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/shipments");

  const error = readParam(resolved, "error");
  const next = readParam(resolved, "next") ?? "/shipments";

  async function loginAction(formData: FormData) {
    "use server";
    const phone = String(formData.get("phone") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const nextRaw = String(formData.get("next") ?? "/shipments");
    const safeNext = nextRaw.startsWith("/") ? nextRaw : "/shipments";

    const user = getUserByPhone(phone);
    if (!user) redirect(`/login?error=invalid&next=${encodeURIComponent(safeNext)}`);
    if (user.disabled) redirect(`/login?error=disabled&next=${encodeURIComponent(safeNext)}`);
    if (!verifyPassword(password, user.password_hash)) {
      redirect(`/login?error=invalid&next=${encodeURIComponent(safeNext)}`);
    }

    await createSession(user.id);
    redirect(safeNext);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Use your phone number and password.
          </p>
        </div>

        {error ? (
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error === "disabled"
              ? "This account is disabled."
              : "Invalid phone number or password."}
          </div>
        ) : null}

        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              Phone number
            </div>
            <input
              name="phone"
              inputMode="tel"
              autoComplete="tel"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-2 ring-transparent focus:border-zinc-400 focus:ring-zinc-900/10"
              placeholder="+213..."
              required
            />
          </label>

          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              Password
            </div>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-2 ring-transparent focus:border-zinc-400 focus:ring-zinc-900/10"
              required
            />
          </label>

          <button
            type="submit"
            className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-xs text-zinc-500">
          If you don’t have an account, ask an admin to create one.
        </p>
      </div>
    </div>
  );
}
