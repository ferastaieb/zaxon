import "server-only";

import type { Role } from "@/lib/domain";
import { getDb, nowIso } from "@/lib/db";
import { execute, queryAll, queryOne } from "@/lib/sql";

export type DbUser = {
  id: number;
  name: string;
  phone: string;
  role: Role;
  password_hash: string;
  disabled: 0 | 1;
  created_at: string;
  updated_at: string;
};

export function countUsers(): number {
  const db = getDb();
  const row = queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM users",
    [],
    db,
  );
  return row?.count ?? 0;
}

export function listUsers(): Pick<
  DbUser,
  "id" | "name" | "phone" | "role" | "disabled" | "created_at"
>[] {
  const db = getDb();
  return queryAll(
    `
      SELECT id, name, phone, role, disabled, created_at
      FROM users
      ORDER BY created_at DESC
    `,
    [],
    db,
  );
}

export function listActiveUsers(): Pick<DbUser, "id" | "name" | "role">[] {
  const db = getDb();
  return queryAll(
    "SELECT id, name, role FROM users WHERE disabled = 0 ORDER BY name ASC",
    [],
    db,
  );
}

export function listActiveUserIdsByRole(role: Role): number[] {
  const db = getDb();
  const rows = queryAll<{ id: number }>(
    "SELECT id FROM users WHERE role = ? AND disabled = 0 ORDER BY id ASC",
    [role],
    db,
  );
  return rows.map((r) => r.id);
}

export function getUserByPhone(phone: string): DbUser | null {
  const db = getDb();
  return queryOne<DbUser>(
    "SELECT * FROM users WHERE phone = ? LIMIT 1",
    [phone],
    db,
  );
}

export function getUserById(id: number): DbUser | null {
  const db = getDb();
  return queryOne<DbUser>("SELECT * FROM users WHERE id = ? LIMIT 1", [id], db);
}

export function createUser(input: {
  name: string;
  phone: string;
  role: Role;
  passwordHash: string;
}): number {
  const db = getDb();
  const ts = nowIso();
  const result = execute(
    `
      INSERT INTO users (name, phone, role, password_hash, disabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `,
    [input.name, input.phone, input.role, input.passwordHash, ts, ts],
    db,
  );
  return result.lastInsertRowid;
}

export function setUserDisabled(userId: number, disabled: boolean) {
  const db = getDb();
  execute(
    "UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?",
    [disabled ? 1 : 0, nowIso(), userId],
    db,
  );
}
