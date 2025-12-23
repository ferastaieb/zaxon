import "server-only";

import type { PartyType } from "@/lib/domain";
import { getDb, nowIso } from "@/lib/db";
import { execute, queryAll, queryOne } from "@/lib/sql";

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

export function listParties(input?: { type?: PartyType; q?: string }) {
  const db = getDb();
  const params: Array<string | number> = [];
  const where: string[] = [];

  if (input?.type) {
    where.push("type = ?");
    params.push(input.type);
  }

  if (input?.q) {
    where.push("LOWER(name) LIKE ?");
    params.push(`%${input.q.toLowerCase()}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  return queryAll<PartyRow>(
    `
      SELECT *
      FROM parties
      ${whereSql}
      ORDER BY name ASC
    `,
    params,
    db,
  );
}

export function getParty(id: number): PartyRow | null {
  const db = getDb();
  return queryOne<PartyRow>("SELECT * FROM parties WHERE id = ? LIMIT 1", [id], db);
}

export function createParty(input: {
  type: PartyType;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}) {
  const db = getDb();
  const ts = nowIso();
  const result = execute(
    `
      INSERT INTO parties (type, name, phone, email, address, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.type,
      input.name,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.notes ?? null,
      ts,
      ts,
    ],
    db,
  );
  return result.lastInsertRowid;
}

export function updateParty(
  id: number,
  input: {
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
  },
) {
  const db = getDb();
  execute(
    `
      UPDATE parties
      SET name = ?, phone = ?, email = ?, address = ?, notes = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      input.name,
      input.phone ?? null,
      input.email ?? null,
      input.address ?? null,
      input.notes ?? null,
      nowIso(),
      id,
    ],
    db,
  );
}

