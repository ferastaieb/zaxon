import "server-only";

import type { PartyType } from "@/lib/domain";
import { getItem, nextId, nowIso, putItem, scanAll, tableName, updateItem } from "@/lib/db";

export type PartyRow = {
  id: number;
  type: PartyType;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const PARTIES_TABLE = tableName("parties");

export async function listParties(input?: { type?: PartyType; q?: string }) {
  const rows = await scanAll<PartyRow>(PARTIES_TABLE);
  const query = input?.q?.toLowerCase().trim();
  return rows
    .filter((row) => (input?.type ? row.type === input.type : true))
    .filter((row) => (query ? row.name.toLowerCase().includes(query) : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getParty(id: number): Promise<PartyRow | null> {
  return await getItem<PartyRow>(PARTIES_TABLE, { id });
}

export async function createParty(input: {
  type: PartyType;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}) {
  const ts = nowIso();
  const id = await nextId("parties");
  await putItem(PARTIES_TABLE, {
    id,
    type: input.type,
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    notes: input.notes ?? null,
    created_at: ts,
    updated_at: ts,
  });
  return id;
}

export async function updateParty(
  id: number,
  input: {
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
  },
) {
  await updateItem<PartyRow>(
    PARTIES_TABLE,
    { id },
    "SET #name = :name, phone = :phone, email = :email, address = :address, notes = :notes, updated_at = :updated_at",
    {
      ":name": input.name,
      ":phone": input.phone ?? null,
      ":email": input.email ?? null,
      ":address": input.address ?? null,
      ":notes": input.notes ?? null,
      ":updated_at": nowIso(),
    },
    { "#name": "name" },
  );
}
