import "server-only";

import { redirect } from "next/navigation";

import type { AuthUser } from "@/lib/auth";
import { getItem, tableName } from "@/lib/db";

const SHIPMENT_ACCESS_TABLE = tableName("shipment_access");

export function canAccessAllShipments(user: AuthUser) {
  return user.role === "ADMIN" || user.role === "FINANCE";
}

export async function canUserAccessShipment(
  user: AuthUser,
  shipmentId: number,
): Promise<boolean> {
  if (canAccessAllShipments(user)) return true;
  const row = await getItem<{ shipment_id: number }>(SHIPMENT_ACCESS_TABLE, {
    shipment_id: shipmentId,
    user_id: user.id,
  });
  return !!row;
}

export async function requireShipmentAccess(user: AuthUser, shipmentId: number) {
  if (await canUserAccessShipment(user, shipmentId)) return;
  redirect("/forbidden");
}
