import Link from "next/link";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { createExceptionType } from "@/lib/data/exceptions";
import { ShipmentRisks, riskLabel, type ShipmentRisk } from "@/lib/domain";

export default async function NewExceptionPage() {
  await requireAdmin();

  async function createExceptionAction(formData: FormData) {
    "use server";
    const user = await requireAdmin();

    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim() || null;
    const defaultRisk = String(formData.get("defaultRisk") ?? "") as ShipmentRisk;
    const customerMessageTemplate =
      String(formData.get("customerMessageTemplate") ?? "").trim() || null;

    if (!name || !ShipmentRisks.includes(defaultRisk)) {
      redirect("/exceptions/new?error=invalid");
    }

    const id = createExceptionType({
      name,
      description,
      defaultRisk,
      customerMessageTemplate,
      createdByUserId: user.id,
    });
    redirect(`/exceptions/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="text-sm text-zinc-500">
          <Link href="/exceptions" className="hover:underline">
            Exceptions
          </Link>{" "}
          <span className="text-zinc-400">/</span> New
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          New exception type
        </h1>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <form action={createExceptionAction} className="space-y-4">
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">Name</div>
            <input
              name="name"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Missing document"
              required
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              Default risk
            </div>
            <select
              name="defaultRisk"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              defaultValue="AT_RISK"
            >
              {ShipmentRisks.filter((r) => r !== "ON_TRACK").map((r) => (
                <option key={r} value={r}>
                  {riskLabel(r)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              Description
            </div>
            <textarea
              name="description"
              className="min-h-28 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="When to use this exception..."
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              Customer message template (optional)
            </div>
            <input
              name="customerMessageTemplate"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              placeholder="We need {{document}} to proceed..."
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Create
            </button>
            <Link
              href="/exceptions"
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
