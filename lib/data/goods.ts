import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { getDb, inTransaction, nowIso } from "@/lib/db";
import { execute, queryAll, queryOne } from "@/lib/sql";

export type GoodRow = {
  id: number;
  owner_user_id: number;
  name: string;
  origin: string;
  unit_type: string;
  created_at: string;
  updated_at: string;
};

export type ShipmentGoodRow = {
  id: number;
  shipment_id: number;
  good_id: number;
  owner_user_id: number;
  customer_party_id: number | null;
  applies_to_all_customers: 0 | 1;
  quantity: number;
  created_at: string;
  created_by_user_id: number | null;
  updated_at: string;
  good_name: string;
  good_origin: string;
  unit_type: string;
  customer_name: string | null;
  allocated_quantity: number;
  inventory_quantity: number;
  allocated_at: string | null;
};

export type InventoryBalanceRow = {
  owner_user_id: number;
  good_id: number;
  quantity: number;
  updated_at: string;
  good_name: string;
  good_origin: string;
  unit_type: string;
};

export type InventoryTransactionRow = {
  id: number;
  owner_user_id: number;
  good_id: number;
  shipment_id: number | null;
  shipment_good_id: number | null;
  step_id: number | null;
  direction: "IN" | "OUT";
  quantity: number;
  created_at: string;
  note: string | null;
  shipment_code: string | null;
  good_name: string;
  good_origin: string;
  unit_type: string;
};

export type CustomerInventoryTransactionRow = InventoryTransactionRow & {
  customer_party_id: number | null;
  customer_name: string | null;
};

export type CustomerGoodsSummaryRow = {
  good_id: number;
  good_name: string;
  good_origin: string;
  unit_type: string;
  total_quantity: number;
  shipment_count: number;
  shipment_refs: string | null;
};

export function listGoodsForUser(userId: number) {
  const db = getDb();
  return queryAll<GoodRow>(
    `
      SELECT *
      FROM goods
      WHERE owner_user_id = ?
      ORDER BY name ASC, origin ASC
    `,
    [userId],
    db,
  );
}

export function getGoodForUser(userId: number, goodId: number) {
  const db = getDb();
  return queryOne<GoodRow>(
    `
      SELECT *
      FROM goods
      WHERE owner_user_id = ? AND id = ?
      LIMIT 1
    `,
    [userId, goodId],
    db,
  );
}

export function createGood(input: {
  ownerUserId: number;
  name: string;
  origin: string;
  unitType: string;
}) {
  const db = getDb();
  const ts = nowIso();
  execute(
    `
      INSERT OR IGNORE INTO goods (
        owner_user_id, name, origin, unit_type, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [input.ownerUserId, input.name, input.origin, input.unitType, ts, ts],
    db,
  );

  const row = queryOne<{ id: number }>(
    `
      SELECT id
      FROM goods
      WHERE owner_user_id = ? AND name = ? AND origin = ?
      LIMIT 1
    `,
    [input.ownerUserId, input.name, input.origin],
    db,
  );
  return row?.id ?? null;
}

export function listShipmentGoods(input: { shipmentId: number; ownerUserId: number }) {
  const db = getDb();
  return queryAll<ShipmentGoodRow>(
    `
      SELECT
        sg.*,
        g.name AS good_name,
        g.origin AS good_origin,
        g.unit_type AS unit_type,
        p.name AS customer_name,
        COALESCE(SUM(sga.taken_quantity), 0) AS allocated_quantity,
        COALESCE(SUM(sga.inventory_quantity), 0) AS inventory_quantity,
        MAX(sga.created_at) AS allocated_at
      FROM shipment_goods sg
      JOIN goods g ON g.id = sg.good_id
      LEFT JOIN parties p ON p.id = sg.customer_party_id
      LEFT JOIN shipment_goods_allocations sga ON sga.shipment_good_id = sg.id
      WHERE sg.shipment_id = ? AND sg.owner_user_id = ?
      GROUP BY sg.id
      ORDER BY sg.created_at ASC
    `,
    [input.shipmentId, input.ownerUserId],
    db,
  );
}

export function addShipmentGood(input: {
  shipmentId: number;
  ownerUserId: number;
  goodId: number;
  quantity: number;
  customerPartyId?: number | null;
  appliesToAllCustomers?: boolean;
  createdByUserId?: number | null;
}) {
  const db = getDb();
  const ts = nowIso();
  execute(
    `
      INSERT INTO shipment_goods (
        shipment_id, good_id, owner_user_id,
        customer_party_id, applies_to_all_customers,
        quantity, created_at, created_by_user_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.shipmentId,
      input.goodId,
      input.ownerUserId,
      input.customerPartyId ?? null,
      input.appliesToAllCustomers ? 1 : 0,
      input.quantity,
      ts,
      input.createdByUserId ?? null,
      ts,
    ],
    db,
  );
}

export function deleteShipmentGood(input: {
  shipmentGoodId: number;
  ownerUserId: number;
}) {
  const db = getDb();
  execute(
    "DELETE FROM shipment_goods WHERE id = ? AND owner_user_id = ?",
    [input.shipmentGoodId, input.ownerUserId],
    db,
  );
}

export function listInventoryBalances(ownerUserId: number) {
  const db = getDb();
  return queryAll<InventoryBalanceRow>(
    `
      SELECT
        ib.owner_user_id,
        ib.good_id,
        ib.quantity,
        ib.updated_at,
        g.name AS good_name,
        g.origin AS good_origin,
        g.unit_type AS unit_type
      FROM inventory_balances ib
      JOIN goods g ON g.id = ib.good_id
      WHERE ib.owner_user_id = ?
      ORDER BY g.name ASC, g.origin ASC
    `,
    [ownerUserId],
    db,
  );
}

export function listInventoryTransactions(input: {
  ownerUserId: number;
  shipmentId?: number;
  limit?: number;
}) {
  const db = getDb();
  const params: Array<string | number> = [input.ownerUserId];
  const where: string[] = ["it.owner_user_id = ?"];
  if (input.shipmentId) {
    where.push("it.shipment_id = ?");
    params.push(input.shipmentId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const limit = input.limit && input.limit > 0 ? Math.floor(input.limit) : 100;

  return queryAll<InventoryTransactionRow>(
    `
      SELECT
        it.*,
        s.shipment_code AS shipment_code,
        g.name AS good_name,
        g.origin AS good_origin,
        g.unit_type AS unit_type
      FROM inventory_transactions it
      JOIN goods g ON g.id = it.good_id
      LEFT JOIN shipments s ON s.id = it.shipment_id
      ${whereSql}
      ORDER BY it.created_at DESC
      LIMIT ${limit}
    `,
    params,
    db,
  );
}

export function listCustomerGoodsSummary(input: {
  ownerUserId: number;
  customerPartyId: number;
  canAccessAllShipments: boolean;
}) {
  const db = getDb();
  const accessJoin = input.canAccessAllShipments
    ? ""
    : "JOIN shipment_access sa ON sa.shipment_id = sg.shipment_id AND sa.user_id = ?";
  const params: Array<string | number> = [input.customerPartyId];
  if (!input.canAccessAllShipments) {
    params.push(input.ownerUserId);
  }
  params.push(input.ownerUserId, input.customerPartyId);

  return queryAll<CustomerGoodsSummaryRow>(
    `
      SELECT
        g.id AS good_id,
        g.name AS good_name,
        g.origin AS good_origin,
        g.unit_type AS unit_type,
        COALESCE(SUM(sg.quantity), 0) AS total_quantity,
        COUNT(DISTINCT sg.shipment_id) AS shipment_count,
        group_concat(DISTINCT s.id || '|' || s.shipment_code) AS shipment_refs
      FROM shipment_goods sg
      JOIN goods g ON g.id = sg.good_id
      JOIN shipments s ON s.id = sg.shipment_id
      JOIN shipment_customers sc
        ON sc.shipment_id = sg.shipment_id AND sc.customer_party_id = ?
      ${accessJoin}
      WHERE sg.owner_user_id = ?
        AND (sg.applies_to_all_customers = 1 OR sg.customer_party_id = ?)
      GROUP BY g.id
      ORDER BY g.name ASC, g.origin ASC
    `,
    params,
    db,
  );
}

export function listCustomerInventoryTransactions(input: {
  ownerUserId: number;
  customerPartyId: number;
  canAccessAllShipments: boolean;
  limit?: number;
}) {
  const db = getDb();
  const accessJoin = input.canAccessAllShipments
    ? ""
    : "JOIN shipment_access sa ON sa.shipment_id = s.id AND sa.user_id = ?";
  const params: Array<string | number> = [input.customerPartyId];
  if (!input.canAccessAllShipments) {
    params.push(input.ownerUserId);
  }
  params.push(input.ownerUserId, input.customerPartyId);
  const limit = input.limit && input.limit > 0 ? Math.floor(input.limit) : 100;

  return queryAll<CustomerInventoryTransactionRow>(
    `
      SELECT
        it.*,
        s.shipment_code AS shipment_code,
        g.name AS good_name,
        g.origin AS good_origin,
        g.unit_type AS unit_type,
        sg.customer_party_id AS customer_party_id,
        p.name AS customer_name
      FROM inventory_transactions it
      JOIN goods g ON g.id = it.good_id
      JOIN shipment_goods sg
        ON sg.id = it.shipment_good_id AND sg.shipment_id = it.shipment_id
      JOIN shipments s ON s.id = it.shipment_id
      JOIN shipment_customers sc
        ON sc.shipment_id = s.id AND sc.customer_party_id = ?
      JOIN parties p ON p.id = sg.customer_party_id
      ${accessJoin}
      WHERE it.owner_user_id = ?
        AND sg.customer_party_id = ?
      ORDER BY it.created_at DESC
      LIMIT ${limit}
    `,
    params,
    db,
  );
}

export function listInventoryTransactionsForShipmentCustomers(input: {
  ownerUserId: number;
  shipmentId: number;
  canAccessAllShipments: boolean;
  limit?: number;
}) {
  const db = getDb();
  const accessJoin = input.canAccessAllShipments
    ? ""
    : "JOIN shipment_access sa ON sa.shipment_id = s.id AND sa.user_id = ?";
  const params: Array<string | number> = [input.shipmentId];
  if (!input.canAccessAllShipments) {
    params.push(input.ownerUserId);
  }
  params.push(input.ownerUserId);
  const limit = input.limit && input.limit > 0 ? Math.floor(input.limit) : 100;

  return queryAll<CustomerInventoryTransactionRow>(
    `
      SELECT
        it.*,
        s.shipment_code AS shipment_code,
        g.name AS good_name,
        g.origin AS good_origin,
        g.unit_type AS unit_type,
        sg.customer_party_id AS customer_party_id,
        p.name AS customer_name
      FROM inventory_transactions it
      JOIN goods g ON g.id = it.good_id
      JOIN shipment_goods sg
        ON sg.id = it.shipment_good_id AND sg.shipment_id = it.shipment_id
      JOIN shipments s ON s.id = it.shipment_id
      JOIN shipment_customers sc_allowed
        ON sc_allowed.shipment_id = ? AND sc_allowed.customer_party_id = sg.customer_party_id
      LEFT JOIN parties p ON p.id = sg.customer_party_id
      ${accessJoin}
      WHERE it.owner_user_id = ?
      ORDER BY it.created_at DESC
      LIMIT ${limit}
    `,
    params,
    db,
  );
}

type InventoryTxInput = {
  ownerUserId: number;
  goodId: number;
  shipmentId?: number | null;
  shipmentGoodId?: number | null;
  stepId?: number | null;
  direction: "IN" | "OUT";
  quantity: number;
  note?: string | null;
};

function recordInventoryTransaction(db: DatabaseSync, input: InventoryTxInput) {
  execute(
    `
      INSERT INTO inventory_transactions (
        owner_user_id, good_id, shipment_id, shipment_good_id, step_id,
        direction, quantity, created_at, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.ownerUserId,
      input.goodId,
      input.shipmentId ?? null,
      input.shipmentGoodId ?? null,
      input.stepId ?? null,
      input.direction,
      input.quantity,
      nowIso(),
      input.note ?? null,
    ],
    db,
  );

  const delta = input.direction === "IN" ? input.quantity : -input.quantity;
  execute(
    `
      INSERT INTO inventory_balances (owner_user_id, good_id, quantity, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(owner_user_id, good_id) DO UPDATE SET
        quantity = quantity + ?,
        updated_at = excluded.updated_at
    `,
    [input.ownerUserId, input.goodId, delta, nowIso(), delta],
    db,
  );
}

export function applyShipmentGoodsAllocations(
  input: {
    shipmentId: number;
    stepId: number;
    ownerUserId: number;
    allocations: Array<{ shipmentGoodId: number; takenQuantity: number }>;
  },
  db?: DatabaseSync,
) {
  const targetDb = db ?? getDb();
  const ts = nowIso();

  const apply = () => {
    for (const allocation of input.allocations) {
      const existing = queryOne<{ id: number }>(
        `
          SELECT id
          FROM shipment_goods_allocations
          WHERE shipment_good_id = ?
          LIMIT 1
        `,
        [allocation.shipmentGoodId],
        targetDb,
      );
      if (existing) continue;

      const sg = queryOne<{
        shipment_id: number;
        good_id: number;
        owner_user_id: number;
        quantity: number;
      }>(
        `
          SELECT shipment_id, good_id, owner_user_id, quantity
          FROM shipment_goods
          WHERE id = ? AND shipment_id = ?
          LIMIT 1
        `,
        [allocation.shipmentGoodId, input.shipmentId],
        targetDb,
      );
      if (!sg || sg.owner_user_id !== input.ownerUserId) continue;

      const taken = Math.max(0, Math.min(allocation.takenQuantity, sg.quantity));
      const inventoryQty = Math.max(0, sg.quantity - taken);

      execute(
        `
          INSERT INTO shipment_goods_allocations (
            shipment_good_id, step_id, taken_quantity, inventory_quantity, created_at, created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        [
          allocation.shipmentGoodId,
          input.stepId,
          taken,
          inventoryQty,
          ts,
          input.ownerUserId,
        ],
        targetDb,
      );

      if (sg.quantity > 0) {
        recordInventoryTransaction(targetDb, {
          ownerUserId: input.ownerUserId,
          goodId: sg.good_id,
          shipmentId: input.shipmentId,
          shipmentGoodId: allocation.shipmentGoodId,
          stepId: input.stepId,
          direction: "IN",
          quantity: sg.quantity,
          note: "Shipment goods received",
        });
      }

      if (taken > 0) {
        recordInventoryTransaction(targetDb, {
          ownerUserId: input.ownerUserId,
          goodId: sg.good_id,
          shipmentId: input.shipmentId,
          shipmentGoodId: allocation.shipmentGoodId,
          stepId: input.stepId,
          direction: "OUT",
          quantity: taken,
          note: "Shipment goods allocated",
        });
      }
    }
  };

  if (db) {
    apply();
  } else {
    inTransaction(targetDb, apply);
  }
}
