import "server-only";

import { redirect } from "next/navigation";

import type { AuthUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { queryOne } from "@/lib/sql";

export function canAccessAllShipments(user: AuthUser) {
  return user.role === "ADMIN" || user.role === "FINANCE";
}

export function canUserAccessShipment(user: AuthUser, shipmentId: number): boolean {
  if (canAccessAllShipments(user)) return true;
  const db = getDb();
  const row = queryOne<{ shipment_id: number }>(
    "SELECT shipment_id FROM shipment_access WHERE shipment_id = ? AND user_id = ? LIMIT 1",
    [shipmentId, user.id],
    db,
  );
  return !!row;
}

export function requireShipmentAccess(user: AuthUser, shipmentId: number) {
  if (canUserAccessShipment(user, shipmentId)) return;
  redirect("/forbidden");
}

