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

export type UserSummaryRow = {
  user_id: number;
  goods_count: number;
  inventory_goods_count: number;
  inventory_total_quantity: number;
  shipment_count: number;
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

export function listUserSummaries(): UserSummaryRow[] {
  const db = getDb();
  return queryAll<UserSummaryRow>(
    `
      SELECT
        u.id AS user_id,
        COALESCE(g.goods_count, 0) AS goods_count,
        COALESCE(ib.inventory_goods_count, 0) AS inventory_goods_count,
        COALESCE(ib.inventory_total_quantity, 0) AS inventory_total_quantity,
        CASE
          WHEN u.role IN ('ADMIN', 'FINANCE') THEN (
            SELECT COUNT(*) FROM shipments
          )
          ELSE COALESCE(sa.shipment_count, 0)
        END AS shipment_count
      FROM users u
      LEFT JOIN (
        SELECT owner_user_id, COUNT(*) AS goods_count
        FROM goods
        GROUP BY owner_user_id
      ) g ON g.owner_user_id = u.id
      LEFT JOIN (
        SELECT owner_user_id,
          COUNT(*) AS inventory_goods_count,
          COALESCE(SUM(quantity), 0) AS inventory_total_quantity
        FROM inventory_balances
        GROUP BY owner_user_id
      ) ib ON ib.owner_user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(DISTINCT shipment_id) AS shipment_count
        FROM shipment_access
        GROUP BY user_id
      ) sa ON sa.user_id = u.id
      ORDER BY u.created_at DESC
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
