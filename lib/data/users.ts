import "server-only";

import type { Role } from "@/lib/domain";
import {
  getItem,
  nowIso,
  nextId,
  scanAll,
  tableName,
  updateItem,
  putItem,
} from "@/lib/db";

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

const USERS_TABLE = tableName("users");
const GOODS_TABLE = tableName("goods");
const INVENTORY_BALANCES_TABLE = tableName("inventory_balances");
const SHIPMENT_ACCESS_TABLE = tableName("shipment_access");
const SHIPMENTS_TABLE = tableName("shipments");

export async function countUsers(): Promise<number> {
  const users = await scanAll<DbUser>(USERS_TABLE);
  return users.length;
}

export async function listUsers(): Promise<
  Pick<DbUser, "id" | "name" | "phone" | "role" | "disabled" | "created_at">[]
> {
  const users = await scanAll<DbUser>(USERS_TABLE);
  return users
    .map((user) => ({
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      disabled: user.disabled,
      created_at: user.created_at,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function listUserSummaries(): Promise<UserSummaryRow[]> {
  const [users, goods, balances, accessRows, shipments] = await Promise.all([
    scanAll<DbUser>(USERS_TABLE),
    scanAll<{ owner_user_id: number }>(GOODS_TABLE),
    scanAll<{ owner_user_id: number; quantity: number }>(INVENTORY_BALANCES_TABLE),
    scanAll<{ user_id: number; shipment_id: number }>(SHIPMENT_ACCESS_TABLE),
    scanAll<{ id: number }>(SHIPMENTS_TABLE),
  ]);

  const goodsCount = new Map<number, number>();
  for (const row of goods) {
    goodsCount.set(row.owner_user_id, (goodsCount.get(row.owner_user_id) ?? 0) + 1);
  }

  const inventoryCounts = new Map<number, { count: number; total: number }>();
  for (const row of balances) {
    const current = inventoryCounts.get(row.owner_user_id) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += Number(row.quantity ?? 0);
    inventoryCounts.set(row.owner_user_id, current);
  }

  const shipmentAccessCounts = new Map<number, Set<number>>();
  for (const row of accessRows) {
    if (!shipmentAccessCounts.has(row.user_id)) {
      shipmentAccessCounts.set(row.user_id, new Set());
    }
    shipmentAccessCounts.get(row.user_id)?.add(row.shipment_id);
  }

  const totalShipments = shipments.length;

  return users
    .map((user) => {
      const inventory = inventoryCounts.get(user.id) ?? { count: 0, total: 0 };
      const shipmentCount =
        user.role === "ADMIN" || user.role === "FINANCE"
          ? totalShipments
          : shipmentAccessCounts.get(user.id)?.size ?? 0;
      return {
        user_id: user.id,
        goods_count: goodsCount.get(user.id) ?? 0,
        inventory_goods_count: inventory.count,
        inventory_total_quantity: inventory.total,
        shipment_count: shipmentCount,
      };
    })
    .sort((a, b) => {
      const aUser = users.find((u) => u.id === a.user_id);
      const bUser = users.find((u) => u.id === b.user_id);
      const aCreated = aUser?.created_at ?? "";
      const bCreated = bUser?.created_at ?? "";
      return bCreated.localeCompare(aCreated);
    });
}

export async function listActiveUsers(): Promise<Pick<DbUser, "id" | "name" | "role">[]> {
  const users = await scanAll<DbUser>(USERS_TABLE);
  return users
    .filter((user) => user.disabled === 0)
    .map((user) => ({ id: user.id, name: user.name, role: user.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listActiveUserIdsByRole(role: Role): Promise<number[]> {
  const users = await scanAll<DbUser>(USERS_TABLE);
  return users
    .filter((user) => user.role === role && user.disabled === 0)
    .sort((a, b) => a.id - b.id)
    .map((user) => user.id);
}

export async function getUserByPhone(phone: string): Promise<DbUser | null> {
  const users = await scanAll<DbUser>(USERS_TABLE);
  return users.find((user) => user.phone === phone) ?? null;
}

export async function getUserById(id: number): Promise<DbUser | null> {
  return await getItem<DbUser>(USERS_TABLE, { id });
}

export async function createUser(input: {
  name: string;
  phone: string;
  role: Role;
  passwordHash: string;
}): Promise<number> {
  const existing = await getUserByPhone(input.phone);
  if (existing) {
    throw new Error("Phone number already exists");
  }

  const ts = nowIso();
  const id = await nextId("users");
  await putItem(USERS_TABLE, {
    id,
    name: input.name,
    phone: input.phone,
    role: input.role,
    password_hash: input.passwordHash,
    disabled: 0,
    created_at: ts,
    updated_at: ts,
  });

  return id;
}

export async function setUserDisabled(userId: number, disabled: boolean) {
  await updateItem<DbUser>(
    USERS_TABLE,
    { id: userId },
    "SET disabled = :disabled, updated_at = :updated_at",
    {
      ":disabled": disabled ? 1 : 0,
      ":updated_at": nowIso(),
    },
  );
}
