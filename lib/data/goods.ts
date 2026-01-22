import "server-only";

import {
  deleteItem,
  getItem,
  nextId,
  nowIso,
  putItem,
  scanAll,
  tableName,
  updateItem,
} from "@/lib/db";

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

export type ShipmentAllocationGoodRow = ShipmentGoodRow & {
  shipment_code: string;
  is_connected: 0 | 1;
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
  remaining_quantity: number;
  shipment_count: number;
  shipment_refs: string | null;
};

const GOODS_TABLE = tableName("goods");
const SHIPMENT_GOODS_TABLE = tableName("shipment_goods");
const SHIPMENT_GOODS_ALLOCATIONS_TABLE = tableName("shipment_goods_allocations");
const INVENTORY_TRANSACTIONS_TABLE = tableName("inventory_transactions");
const INVENTORY_BALANCES_TABLE = tableName("inventory_balances");
const PARTIES_TABLE = tableName("parties");
const SHIPMENTS_TABLE = tableName("shipments");
const SHIPMENT_LINKS_TABLE = tableName("shipment_links");
const SHIPMENT_CUSTOMERS_TABLE = tableName("shipment_customers");
const SHIPMENT_ACCESS_TABLE = tableName("shipment_access");

export async function listGoodsForUser(userId: number) {
  const goods = await scanAll<GoodRow>(GOODS_TABLE);
  return goods
    .filter((good) => good.owner_user_id === userId)
    .sort((a, b) => a.name.localeCompare(b.name) || a.origin.localeCompare(b.origin));
}

export async function getGoodForUser(userId: number, goodId: number) {
  const good = await getItem<GoodRow>(GOODS_TABLE, { id: goodId });
  if (!good || good.owner_user_id !== userId) return null;
  return good;
}

export async function createGood(input: {
  ownerUserId: number;
  name: string;
  origin: string;
  unitType: string;
}) {
  const goods = await scanAll<GoodRow>(GOODS_TABLE);
  const existing = goods.find(
    (good) =>
      good.owner_user_id === input.ownerUserId &&
      good.name === input.name &&
      good.origin === input.origin,
  );
  if (existing) return existing.id;

  const ts = nowIso();
  const id = await nextId("goods");
  await putItem(GOODS_TABLE, {
    id,
    owner_user_id: input.ownerUserId,
    name: input.name,
    origin: input.origin,
    unit_type: input.unitType,
    created_at: ts,
    updated_at: ts,
  });
  return id;
}

function buildAllocationSummary(
  allocations: Array<{
    shipment_good_id: number;
    taken_quantity: number;
    created_at: string;
  }>,
) {
  const summary = new Map<number, { takenTotal: number; allocatedAt: string | null }>();
  for (const row of allocations) {
    const current = summary.get(row.shipment_good_id) ?? {
      takenTotal: 0,
      allocatedAt: null,
    };
    current.takenTotal += Number(row.taken_quantity ?? 0);
    if (!current.allocatedAt || row.created_at > current.allocatedAt) {
      current.allocatedAt = row.created_at;
    }
    summary.set(row.shipment_good_id, current);
  }
  return summary;
}

export async function listShipmentGoods(input: {
  shipmentId: number;
  ownerUserId: number;
}) {
  const [shipmentGoods, goods, parties, allocations] = await Promise.all([
    scanAll<{
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
    }>(SHIPMENT_GOODS_TABLE),
    scanAll<GoodRow>(GOODS_TABLE),
    scanAll<{ id: number; name: string }>(PARTIES_TABLE),
    scanAll<{
      shipment_good_id: number;
      taken_quantity: number;
      created_at: string;
    }>(SHIPMENT_GOODS_ALLOCATIONS_TABLE),
  ]);

  const goodsMap = new Map(goods.map((good) => [good.id, good]));
  const partyMap = new Map(parties.map((party) => [party.id, party.name]));
  const allocationMap = buildAllocationSummary(allocations);

  return shipmentGoods
    .filter(
      (sg) => sg.shipment_id === input.shipmentId && sg.owner_user_id === input.ownerUserId,
    )
    .map((sg) => {
      const good = goodsMap.get(sg.good_id);
      const allocation = allocationMap.get(sg.id) ?? { takenTotal: 0, allocatedAt: null };
      const inventoryQty = Math.max(0, sg.quantity - allocation.takenTotal);
      return {
        ...sg,
        good_name: good?.name ?? "",
        good_origin: good?.origin ?? "",
        unit_type: good?.unit_type ?? "",
        customer_name: sg.customer_party_id
          ? partyMap.get(sg.customer_party_id) ?? null
          : null,
        allocated_quantity: allocation.takenTotal,
        inventory_quantity: inventoryQty,
        allocated_at: allocation.allocatedAt,
      } as ShipmentGoodRow;
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function listShipmentGoodsForAllocations(input: {
  shipmentId: number;
  ownerUserId: number;
}) {
  const [shipmentGoods, goods, parties, allocations, shipments, links, shipmentCustomers] =
    await Promise.all([
      scanAll<{
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
      }>(SHIPMENT_GOODS_TABLE),
      scanAll<GoodRow>(GOODS_TABLE),
      scanAll<{ id: number; name: string }>(PARTIES_TABLE),
      scanAll<{
        shipment_good_id: number;
        taken_quantity: number;
        created_at: string;
      }>(SHIPMENT_GOODS_ALLOCATIONS_TABLE),
      scanAll<{ id: number; shipment_code: string }>(SHIPMENTS_TABLE),
      scanAll<{ shipment_id: number; connected_shipment_id: number }>(SHIPMENT_LINKS_TABLE),
      scanAll<{ shipment_id: number; customer_party_id: number }>(SHIPMENT_CUSTOMERS_TABLE),
    ]);

  const goodsMap = new Map(goods.map((good) => [good.id, good]));
  const partyMap = new Map(parties.map((party) => [party.id, party.name]));
  const allocationMap = buildAllocationSummary(allocations);
  const shipmentsMap = new Map(shipments.map((shipment) => [shipment.id, shipment]));

  const connectedIds = new Set<number>();
  for (const link of links) {
    if (link.shipment_id === input.shipmentId) {
      connectedIds.add(link.connected_shipment_id);
    } else if (link.connected_shipment_id === input.shipmentId) {
      connectedIds.add(link.shipment_id);
    }
  }

  const allowedCustomerIds = new Set<number>(
    shipmentCustomers
      .filter((row) => row.shipment_id === input.shipmentId)
      .map((row) => row.customer_party_id),
  );

  const filteredGoods = shipmentGoods.filter((sg) => {
    if (sg.owner_user_id !== input.ownerUserId) return false;
    if (sg.shipment_id === input.shipmentId) return true;
    if (!connectedIds.has(sg.shipment_id)) return false;
    return sg.customer_party_id !== null && allowedCustomerIds.has(sg.customer_party_id);
  });

  return filteredGoods
    .map((sg) => {
      const good = goodsMap.get(sg.good_id);
      const allocation = allocationMap.get(sg.id) ?? { takenTotal: 0, allocatedAt: null };
      const inventoryQty = Math.max(0, sg.quantity - allocation.takenTotal);
      const shipment = shipmentsMap.get(sg.shipment_id);
      return {
        ...sg,
        good_name: good?.name ?? "",
        good_origin: good?.origin ?? "",
        unit_type: good?.unit_type ?? "",
        customer_name: sg.customer_party_id
          ? partyMap.get(sg.customer_party_id) ?? null
          : null,
        allocated_quantity: allocation.takenTotal,
        inventory_quantity: inventoryQty,
        allocated_at: allocation.allocatedAt,
        shipment_code: shipment?.shipment_code ?? "",
        is_connected: sg.shipment_id === input.shipmentId ? 0 : 1,
      } as ShipmentAllocationGoodRow;
    })
    .sort((a, b) => {
      if (a.is_connected !== b.is_connected) return a.is_connected - b.is_connected;
      return a.created_at.localeCompare(b.created_at);
    });
}

export async function addShipmentGood(input: {
  shipmentId: number;
  ownerUserId: number;
  goodId: number;
  quantity: number;
  customerPartyId?: number | null;
  appliesToAllCustomers?: boolean;
  createdByUserId?: number | null;
}) {
  const ts = nowIso();
  const id = await nextId("shipment_goods");
  await putItem(SHIPMENT_GOODS_TABLE, {
    id,
    shipment_id: input.shipmentId,
    good_id: input.goodId,
    owner_user_id: input.ownerUserId,
    customer_party_id: input.customerPartyId ?? null,
    applies_to_all_customers: input.appliesToAllCustomers ? 1 : 0,
    quantity: input.quantity,
    created_at: ts,
    created_by_user_id: input.createdByUserId ?? null,
    updated_at: ts,
  });

  if (input.quantity > 0) {
    await recordInventoryTransaction({
      ownerUserId: input.ownerUserId,
      goodId: input.goodId,
      shipmentId: input.shipmentId,
      shipmentGoodId: id,
      direction: "IN",
      quantity: input.quantity,
      note: "Shipment goods received",
    });
  }
}

export async function deleteShipmentGood(input: {
  shipmentGoodId: number;
  ownerUserId: number;
}) {
  const sg = await getItem<{ id: number; owner_user_id: number }>(
    SHIPMENT_GOODS_TABLE,
    { id: input.shipmentGoodId },
  );
  if (!sg || sg.owner_user_id !== input.ownerUserId) return;
  await deleteItem(SHIPMENT_GOODS_TABLE, { id: input.shipmentGoodId });
}

export async function listInventoryBalances(ownerUserId: number) {
  const [balances, goods] = await Promise.all([
    scanAll<{ owner_user_id: number; good_id: number; quantity: number; updated_at: string }>(
      INVENTORY_BALANCES_TABLE,
    ),
    scanAll<GoodRow>(GOODS_TABLE),
  ]);

  const goodsMap = new Map(goods.map((good) => [good.id, good]));

  return balances
    .filter((row) => row.owner_user_id === ownerUserId)
    .map((row) => {
      const good = goodsMap.get(row.good_id);
      return {
        owner_user_id: row.owner_user_id,
        good_id: row.good_id,
        quantity: row.quantity,
        updated_at: row.updated_at,
        good_name: good?.name ?? "",
        good_origin: good?.origin ?? "",
        unit_type: good?.unit_type ?? "",
      } as InventoryBalanceRow;
    })
    .sort((a, b) => a.good_name.localeCompare(b.good_name) || a.good_origin.localeCompare(b.good_origin));
}

export async function listInventoryTransactions(input: {
  ownerUserId: number;
  shipmentId?: number;
  limit?: number;
}) {
  const limit = input.limit && input.limit > 0 ? Math.floor(input.limit) : 100;
  const [transactions, goods, shipments] = await Promise.all([
    scanAll<InventoryTransactionRow>(INVENTORY_TRANSACTIONS_TABLE),
    scanAll<GoodRow>(GOODS_TABLE),
    scanAll<{ id: number; shipment_code: string }>(SHIPMENTS_TABLE),
  ]);

  const goodsMap = new Map(goods.map((good) => [good.id, good]));
  const shipmentsMap = new Map(shipments.map((shipment) => [shipment.id, shipment.shipment_code]));

  return transactions
    .filter((tx) => tx.owner_user_id === input.ownerUserId)
    .filter((tx) => (input.shipmentId ? tx.shipment_id === input.shipmentId : true))
    .map((tx) => {
      const good = goodsMap.get(tx.good_id);
      return {
        ...tx,
        shipment_code: tx.shipment_id ? shipmentsMap.get(tx.shipment_id) ?? null : null,
        good_name: good?.name ?? "",
        good_origin: good?.origin ?? "",
        unit_type: good?.unit_type ?? "",
      } as InventoryTransactionRow;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function listCustomerGoodsSummary(input: {
  ownerUserId: number;
  customerPartyId: number;
  canAccessAllShipments: boolean;
}) {
  const [shipmentGoods, goods, shipments, shipmentCustomers, allocations, accessRows] =
    await Promise.all([
      scanAll<{
        id: number;
        shipment_id: number;
        good_id: number;
        owner_user_id: number;
        customer_party_id: number | null;
        applies_to_all_customers: 0 | 1;
        quantity: number;
      }>(SHIPMENT_GOODS_TABLE),
      scanAll<GoodRow>(GOODS_TABLE),
      scanAll<{ id: number; shipment_code: string }>(SHIPMENTS_TABLE),
      scanAll<{ shipment_id: number; customer_party_id: number }>(SHIPMENT_CUSTOMERS_TABLE),
      scanAll<{ shipment_good_id: number; taken_quantity: number }>(
        SHIPMENT_GOODS_ALLOCATIONS_TABLE,
      ),
      scanAll<{ shipment_id: number; user_id: number }>(SHIPMENT_ACCESS_TABLE),
    ]);

  const allocationMap = new Map<number, number>();
  for (const row of allocations) {
    allocationMap.set(
      row.shipment_good_id,
      (allocationMap.get(row.shipment_good_id) ?? 0) + Number(row.taken_quantity ?? 0),
    );
  }

  const allowedShipments = new Set<number>();
  if (!input.canAccessAllShipments) {
    for (const row of accessRows) {
      if (row.user_id === input.ownerUserId) allowedShipments.add(row.shipment_id);
    }
  }

  const shipmentsForCustomer = new Set<number>(
    shipmentCustomers
      .filter((row) => row.customer_party_id === input.customerPartyId)
      .map((row) => row.shipment_id),
  );

  const shipmentsMap = new Map(shipments.map((shipment) => [shipment.id, shipment.shipment_code]));
  const goodsMap = new Map(goods.map((good) => [good.id, good]));

  const summary = new Map<
    number,
    { total: number; remaining: number; shipments: Set<number> }
  >();

  for (const sg of shipmentGoods) {
    if (sg.owner_user_id !== input.ownerUserId) continue;
    if (!shipmentsForCustomer.has(sg.shipment_id)) continue;
    if (!input.canAccessAllShipments && !allowedShipments.has(sg.shipment_id)) continue;
    if (!(sg.applies_to_all_customers === 1 || sg.customer_party_id === input.customerPartyId)) {
      continue;
    }

    const takenTotal = allocationMap.get(sg.id) ?? 0;
    const remaining = Math.max(0, sg.quantity - takenTotal);

    if (!summary.has(sg.good_id)) {
      summary.set(sg.good_id, { total: 0, remaining: 0, shipments: new Set() });
    }
    const entry = summary.get(sg.good_id)!;
    entry.total += sg.quantity;
    entry.remaining += remaining;
    entry.shipments.add(sg.shipment_id);
  }

  const rows: CustomerGoodsSummaryRow[] = [];
  for (const [goodId, entry] of summary) {
    const good = goodsMap.get(goodId);
    const refs = Array.from(entry.shipments)
      .map((shipmentId) => {
        const code = shipmentsMap.get(shipmentId);
        return code ? `${shipmentId}|${code}` : null;
      })
      .filter((value): value is string => !!value);

    rows.push({
      good_id: goodId,
      good_name: good?.name ?? "",
      good_origin: good?.origin ?? "",
      unit_type: good?.unit_type ?? "",
      total_quantity: entry.total,
      remaining_quantity: entry.remaining,
      shipment_count: entry.shipments.size,
      shipment_refs: refs.length ? refs.join(",") : null,
    });
  }

  return rows.sort((a, b) => a.good_name.localeCompare(b.good_name) || a.good_origin.localeCompare(b.good_origin));
}

export async function listCustomerInventoryTransactions(input: {
  ownerUserId: number;
  customerPartyId: number;
  canAccessAllShipments: boolean;
  limit?: number;
}) {
  const limit = input.limit && input.limit > 0 ? Math.floor(input.limit) : 100;
  const [transactions, goods, shipments, shipmentGoods, shipmentCustomers, parties, accessRows] =
    await Promise.all([
      scanAll<InventoryTransactionRow>(INVENTORY_TRANSACTIONS_TABLE),
      scanAll<GoodRow>(GOODS_TABLE),
      scanAll<{ id: number; shipment_code: string }>(SHIPMENTS_TABLE),
      scanAll<{
        id: number;
        shipment_id: number;
        good_id: number;
        customer_party_id: number | null;
      }>(SHIPMENT_GOODS_TABLE),
      scanAll<{ shipment_id: number; customer_party_id: number }>(SHIPMENT_CUSTOMERS_TABLE),
      scanAll<{ id: number; name: string }>(PARTIES_TABLE),
      scanAll<{ shipment_id: number; user_id: number }>(SHIPMENT_ACCESS_TABLE),
    ]);

  const shipmentsForCustomer = new Set<number>(
    shipmentCustomers
      .filter((row) => row.customer_party_id === input.customerPartyId)
      .map((row) => row.shipment_id),
  );

  const allowedShipments = new Set<number>();
  if (!input.canAccessAllShipments) {
    for (const row of accessRows) {
      if (row.user_id === input.ownerUserId) allowedShipments.add(row.shipment_id);
    }
  }

  const goodsMap = new Map(goods.map((good) => [good.id, good]));
  const shipmentsMap = new Map(shipments.map((shipment) => [shipment.id, shipment.shipment_code]));
  const shipmentGoodsMap = new Map(shipmentGoods.map((sg) => [sg.id, sg]));
  const partyMap = new Map(parties.map((party) => [party.id, party.name]));

  return transactions
    .filter((tx) => tx.owner_user_id === input.ownerUserId)
    .filter((tx) => (tx.shipment_id ? shipmentsForCustomer.has(tx.shipment_id) : false))
    .filter((tx) => (input.canAccessAllShipments ? true : tx.shipment_id ? allowedShipments.has(tx.shipment_id) : false))
    .map((tx) => {
      const sg = tx.shipment_good_id ? shipmentGoodsMap.get(tx.shipment_good_id) : undefined;
      if (!sg || sg.customer_party_id !== input.customerPartyId) return null;
      const good = goodsMap.get(tx.good_id);
      return {
        ...tx,
        shipment_code: tx.shipment_id ? shipmentsMap.get(tx.shipment_id) ?? null : null,
        good_name: good?.name ?? "",
        good_origin: good?.origin ?? "",
        unit_type: good?.unit_type ?? "",
        customer_party_id: sg.customer_party_id ?? null,
        customer_name: sg.customer_party_id
          ? partyMap.get(sg.customer_party_id) ?? null
          : null,
      } as CustomerInventoryTransactionRow;
    })
    .filter((row): row is CustomerInventoryTransactionRow => row !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function listInventoryTransactionsForShipmentCustomers(input: {
  ownerUserId: number;
  shipmentId: number;
  canAccessAllShipments: boolean;
  limit?: number;
}) {
  const limit = input.limit && input.limit > 0 ? Math.floor(input.limit) : 100;
  const [transactions, goods, shipments, shipmentGoods, shipmentCustomers, parties, accessRows] =
    await Promise.all([
      scanAll<InventoryTransactionRow>(INVENTORY_TRANSACTIONS_TABLE),
      scanAll<GoodRow>(GOODS_TABLE),
      scanAll<{ id: number; shipment_code: string }>(SHIPMENTS_TABLE),
      scanAll<{
        id: number;
        shipment_id: number;
        good_id: number;
        customer_party_id: number | null;
      }>(SHIPMENT_GOODS_TABLE),
      scanAll<{ shipment_id: number; customer_party_id: number }>(SHIPMENT_CUSTOMERS_TABLE),
      scanAll<{ id: number; name: string }>(PARTIES_TABLE),
      scanAll<{ shipment_id: number; user_id: number }>(SHIPMENT_ACCESS_TABLE),
    ]);

  const allowedCustomers = new Set<number>(
    shipmentCustomers
      .filter((row) => row.shipment_id === input.shipmentId)
      .map((row) => row.customer_party_id),
  );

  const allowedShipments = new Set<number>();
  if (!input.canAccessAllShipments) {
    for (const row of accessRows) {
      if (row.user_id === input.ownerUserId) allowedShipments.add(row.shipment_id);
    }
  }

  const goodsMap = new Map(goods.map((good) => [good.id, good]));
  const shipmentsMap = new Map(shipments.map((shipment) => [shipment.id, shipment.shipment_code]));
  const shipmentGoodsMap = new Map(shipmentGoods.map((sg) => [sg.id, sg]));
  const partyMap = new Map(parties.map((party) => [party.id, party.name]));

  return transactions
    .filter((tx) => tx.owner_user_id === input.ownerUserId)
    .filter((tx) => (tx.shipment_id ? tx.shipment_id === input.shipmentId : false))
    .filter((tx) => (input.canAccessAllShipments ? true : tx.shipment_id ? allowedShipments.has(tx.shipment_id) : false))
    .map((tx) => {
      const sg = tx.shipment_good_id ? shipmentGoodsMap.get(tx.shipment_good_id) : undefined;
      if (!sg || sg.customer_party_id === null) return null;
      if (!allowedCustomers.has(sg.customer_party_id)) return null;
      const good = goodsMap.get(tx.good_id);
      return {
        ...tx,
        shipment_code: tx.shipment_id ? shipmentsMap.get(tx.shipment_id) ?? null : null,
        good_name: good?.name ?? "",
        good_origin: good?.origin ?? "",
        unit_type: good?.unit_type ?? "",
        customer_party_id: sg.customer_party_id,
        customer_name: partyMap.get(sg.customer_party_id) ?? null,
      } as CustomerInventoryTransactionRow;
    })
    .filter((row): row is CustomerInventoryTransactionRow => row !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
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

async function recordInventoryTransaction(input: InventoryTxInput) {
  const id = await nextId("inventory_transactions");
  await putItem(INVENTORY_TRANSACTIONS_TABLE, {
    id,
    owner_user_id: input.ownerUserId,
    good_id: input.goodId,
    shipment_id: input.shipmentId ?? null,
    shipment_good_id: input.shipmentGoodId ?? null,
    step_id: input.stepId ?? null,
    direction: input.direction,
    quantity: input.quantity,
    created_at: nowIso(),
    note: input.note ?? null,
  });

  const delta = input.direction === "IN" ? input.quantity : -input.quantity;
  await updateItem(
    INVENTORY_BALANCES_TABLE,
    { owner_user_id: input.ownerUserId, good_id: input.goodId },
    "SET updated_at = :updated_at ADD quantity :delta",
    { ":updated_at": nowIso(), ":delta": delta },
  );
}

export async function applyShipmentGoodsAllocations(input: {
  shipmentId: number;
  stepId: number;
  ownerUserId: number;
  allocations: Array<{ shipmentGoodId: number; takenQuantity: number }>;
}) {
  const [links, shipmentCustomers, shipmentGoods, allocations, transactions] =
    await Promise.all([
      scanAll<{ shipment_id: number; connected_shipment_id: number }>(SHIPMENT_LINKS_TABLE),
      scanAll<{ shipment_id: number; customer_party_id: number }>(SHIPMENT_CUSTOMERS_TABLE),
      scanAll<{
        id: number;
        shipment_id: number;
        good_id: number;
        owner_user_id: number;
        quantity: number;
        customer_party_id: number | null;
        applies_to_all_customers: 0 | 1;
      }>(SHIPMENT_GOODS_TABLE),
      scanAll<{
        id: number;
        shipment_good_id: number;
        step_id: number;
        taken_quantity: number;
        created_at: string;
      }>(SHIPMENT_GOODS_ALLOCATIONS_TABLE),
      scanAll<{ shipment_good_id: number | null; direction: "IN" | "OUT" }>(
        INVENTORY_TRANSACTIONS_TABLE,
      ),
    ]);

  const connectedIds = new Set<number>();
  for (const link of links) {
    if (link.shipment_id === input.shipmentId) {
      connectedIds.add(link.connected_shipment_id);
    } else if (link.connected_shipment_id === input.shipmentId) {
      connectedIds.add(link.shipment_id);
    }
  }

  const allowedCustomers = new Set<number>(
    shipmentCustomers
      .filter((row) => row.shipment_id === input.shipmentId)
      .map((row) => row.customer_party_id),
  );

  const existingAllocations = new Set(
    allocations.map((row) => `${row.shipment_good_id}:${row.step_id}`),
  );

  const takenTotals = new Map<number, number>();
  for (const row of allocations) {
    takenTotals.set(
      row.shipment_good_id,
      (takenTotals.get(row.shipment_good_id) ?? 0) + Number(row.taken_quantity ?? 0),
    );
  }

  const hasIncoming = new Set<number>();
  for (const tx of transactions) {
    if (tx.shipment_good_id && tx.direction === "IN") {
      hasIncoming.add(tx.shipment_good_id);
    }
  }

  for (const allocation of input.allocations) {
    if (existingAllocations.has(`${allocation.shipmentGoodId}:${input.stepId}`)) {
      continue;
    }

    const sg = shipmentGoods.find((row) => row.id === allocation.shipmentGoodId);
    if (!sg) continue;
    if (sg.owner_user_id !== input.ownerUserId) continue;

    const isCurrentShipment = sg.shipment_id === input.shipmentId;
    const isConnectedShipment = connectedIds.has(sg.shipment_id);
    const isCustomerAllowed =
      sg.customer_party_id !== null && allowedCustomers.has(sg.customer_party_id);
    if (!isCurrentShipment && !(isConnectedShipment && isCustomerAllowed)) continue;

    const takenTotal = takenTotals.get(allocation.shipmentGoodId) ?? 0;
    const available = Math.max(0, sg.quantity - takenTotal);
    if (available <= 0) continue;

    const requested = Math.max(0, Math.floor(allocation.takenQuantity));
    const taken = Math.min(requested, available);
    const inventoryQty = Math.max(0, available - taken);

    await putItem(SHIPMENT_GOODS_ALLOCATIONS_TABLE, {
      id: await nextId("shipment_goods_allocations"),
      shipment_good_id: allocation.shipmentGoodId,
      step_id: input.stepId,
      taken_quantity: taken,
      inventory_quantity: inventoryQty,
      created_at: nowIso(),
      created_by_user_id: input.ownerUserId,
    });

    if (!hasIncoming.has(allocation.shipmentGoodId) && sg.quantity > 0) {
      await recordInventoryTransaction({
        ownerUserId: input.ownerUserId,
        goodId: sg.good_id,
        shipmentId: sg.shipment_id,
        shipmentGoodId: allocation.shipmentGoodId,
        stepId: input.stepId,
        direction: "IN",
        quantity: sg.quantity,
        note: "Shipment goods received",
      });
      hasIncoming.add(allocation.shipmentGoodId);
    }

    if (taken > 0) {
      await recordInventoryTransaction({
        ownerUserId: input.ownerUserId,
        goodId: sg.good_id,
        shipmentId: sg.shipment_id,
        shipmentGoodId: allocation.shipmentGoodId,
        stepId: input.stepId,
        direction: "OUT",
        quantity: taken,
        note: "Shipment goods allocated",
      });
    }
  }
}
