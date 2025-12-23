import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import type { ShipmentType, TransportMode } from "@/lib/domain";
import { suggestTemplate } from "@/lib/data/workflows";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | {
        transportMode?: TransportMode;
        origin?: string;
        destination?: string;
        shipmentType?: ShipmentType;
        customerPartyId?: number;
      }
    | null;

  if (!body) return NextResponse.json({ template: null });

  const transportMode = body.transportMode;
  const origin = (body.origin ?? "").trim();
  const destination = (body.destination ?? "").trim();
  const shipmentType = body.shipmentType;
  const customerPartyId = Number(body.customerPartyId ?? 0);

  if (!transportMode || !origin || !destination || !shipmentType || !customerPartyId) {
    return NextResponse.json({ template: null });
  }

  const template = suggestTemplate({
    transportMode,
    origin,
    destination,
    shipmentType,
    customerPartyId,
  });

  return NextResponse.json({
    template: template ? { id: template.id, name: template.name } : null,
  });
}
