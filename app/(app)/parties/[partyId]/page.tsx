import Link from "next/link";
import { redirect } from "next/navigation";

import { assertCanWrite, requireUser } from "@/lib/auth";
import { type PartyType } from "@/lib/domain";
import { getParty, updateParty } from "@/lib/data/parties";

function partyTypeLabel(type: PartyType) {
  switch (type) {
    case "CUSTOMER":
      return "Customer";
    case "SUPPLIER":
      return "Supplier";
    case "CUSTOMS_BROKER":
      return "Customs broker";
  }
}

export default async function PartyDetailsPage({
  params,
}: {
  params: Promise<{ partyId: string }>;
}) {
  const user = await requireUser();
  const { partyId } = await params;
  const party = getParty(Number(partyId));
  if (!party) redirect("/parties");

  async function updatePartyAction(formData: FormData) {
    "use server";
    const user = await requireUser();
    assertCanWrite(user);

    const id = Number(formData.get("id") ?? 0);
    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const email = String(formData.get("email") ?? "").trim() || null;
    const address = String(formData.get("address") ?? "").trim() || null;
    const notes = String(formData.get("notes") ?? "").trim() || null;

    if (!id || !name) redirect(`/parties/${id}?error=invalid`);
    updateParty(id, { name, phone, email, address, notes });
    redirect(`/parties/${id}`);
  }

  const canEdit = user.role !== "FINANCE";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="text-sm text-zinc-500">
          <Link href={`/parties?type=${party.type}`} className="hover:underline">
            Parties
          </Link>{" "}
          <span className="text-zinc-400">/</span>{" "}
          {partyTypeLabel(party.type)}
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {party.name}
        </h1>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <form action={updatePartyAction} className="space-y-4">
          <input type="hidden" name="id" value={party.id} />
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">Name</div>
            <input
              name="name"
              defaultValue={party.name}
              disabled={!canEdit}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
              required
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">Phone</div>
              <input
                name="phone"
                defaultValue={party.phone ?? ""}
                disabled={!canEdit}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">Email</div>
              <input
                name="email"
                type="email"
                defaultValue={party.email ?? ""}
                disabled={!canEdit}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
              />
            </label>
          </div>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">Address</div>
            <input
              name="address"
              defaultValue={party.address ?? ""}
              disabled={!canEdit}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">Notes</div>
            <textarea
              name="notes"
              defaultValue={party.notes ?? ""}
              disabled={!canEdit}
              className="min-h-28 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>

          {canEdit ? (
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Save
              </button>
              <Link
                href={`/parties?type=${party.type}`}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Back
              </Link>
            </div>
          ) : (
            <div className="text-sm text-zinc-500">
              Finance role is view-only.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
