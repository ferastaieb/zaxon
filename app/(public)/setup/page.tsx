import { redirect } from "next/navigation";

import { createSession, getCurrentUser, hashPassword } from "@/lib/auth";
import { countUsers, createUser } from "@/lib/data/users";
import { seedInitialData } from "@/lib/seed";

export default async function SetupPage() {
  if (await getCurrentUser()) redirect("/shipments");
  if (countUsers() > 0) redirect("/login");

  async function setupAction(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!name || !phone || password.length < 6) redirect("/setup?error=invalid");

    const userId = createUser({
      name,
      phone,
      role: "ADMIN",
      passwordHash: hashPassword(password),
    });

    seedInitialData(userId);

    await createSession(userId);
    redirect("/shipments");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create the first admin
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            This setup runs only once.
          </p>
        </div>

        <form action={setupAction} className="space-y-4">
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">Name</div>
            <input
              name="name"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-2 ring-transparent focus:border-zinc-400 focus:ring-zinc-900/10"
              required
            />
          </label>

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
              autoComplete="new-password"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none ring-2 ring-transparent focus:border-zinc-400 focus:ring-zinc-900/10"
              minLength={6}
              required
            />
            <div className="mt-1 text-xs text-zinc-500">
              Minimum 6 characters.
            </div>
          </label>

          <button
            type="submit"
            className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Create admin
          </button>
        </form>
      </div>
    </div>
  );
}
