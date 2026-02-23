import Link from "next/link";
import { redirect } from "next/navigation";

import { assertCanWrite, requireUser } from "@/lib/auth";
import { PartyTypes, type PartyType } from "@/lib/domain";
import { createParty } from "@/lib/data/parties";

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
      return "Customer";
    case "SUPPLIER":
      return "Supplier";
    case "CUSTOMS_BROKER":
      return "Customs broker";
  }
}

export default async function NewPartyPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const user = await requireUser();
  assertCanWrite(user);

  const resolved = searchParams
    ? await Promise.resolve(searchParams)
    : ({} as SearchParams);
  const typeRaw = readParam(resolved, "type");
  const type = PartyTypes.includes(typeRaw as PartyType)
    ? (typeRaw as PartyType)
    : "CUSTOMER";

  async function createPartyAction(formData: FormData) {
    "use server";
    const user = await requireUser();
    assertCanWrite(user);

    const name = String(formData.get("name") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const email = String(formData.get("email") ?? "").trim() || null;
    const address = String(formData.get("address") ?? "").trim() || null;
    const notes = String(formData.get("notes") ?? "").trim() || null;
    const type = String(formData.get("type") ?? "") as PartyType;

    if (!name || !PartyTypes.includes(type)) {
      redirect(`/parties/new?type=${type}&error=invalid`);
    }

    const id = await createParty({ type, name, phone, email, address, notes });
    redirect(`/parties/${id}?type=${type}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="text-sm text-zinc-500">
          <Link href={`/parties?type=${type}`} className="hover:underline">
            Parties
          </Link>{" "}
          <span className="text-zinc-400">/</span> New
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          New {partyTypeLabel(type)}
        </h1>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <form action={createPartyAction} className="space-y-4">
          <input type="hidden" name="type" value={type} />
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">Name</div>
            <input
              name="name"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              required
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">Phone</div>
              <input
                name="phone"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">Email</div>
              <input
                name="email"
                type="email"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">Address</div>
            <input
              name="address"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">Notes</div>
            <textarea
              name="notes"
              className="min-h-28 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
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
              href={`/parties?type=${type}`}
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
