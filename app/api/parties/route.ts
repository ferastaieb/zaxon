import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createParty, getParty } from "@/lib/data/parties";
import { PartyTypes, type PartyType } from "@/lib/domain";

export const runtime = "nodejs";

type PartyInput = {
  type?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role === "FINANCE") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: PartyInput;
  try {
    payload = (await request.json()) as PartyInput;
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const name = cleanString(payload.name);
  if (!name) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const typeRaw = cleanString(payload.type) ?? "CUSTOMER";
  const type = PartyTypes.includes(typeRaw as PartyType)
    ? (typeRaw as PartyType)
    : "CUSTOMER";

  const phone = cleanString(payload.phone);
  const email = cleanString(payload.email);
  const address = cleanString(payload.address);
  const notes = cleanString(payload.notes);

  const id = await createParty({
    type,
    name,
    phone,
    email,
    address,
    notes,
  });

  const party = await getParty(id);
  if (!party) {
    return NextResponse.json({ error: "not_found" }, { status: 500 });
  }

  return NextResponse.json(
    {
      party,
    },
    { status: 201 },
  );
}
