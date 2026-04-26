"use client";

import Link from "next/link";
import { Clock3, LogOut, Package2, Phone } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import {
  overallStatusLabel,
  transportModeLabel,
} from "@/lib/domain";
import type { TrackingPortalShipmentSummary } from "@/lib/data/tracking";

type Props = {
  token: string;
  customerName: string;
  customerPhone: string | null;
  currentShipmentId: number;
  shipments: TrackingPortalShipmentSummary[];
  logoutTrackingAction: () => Promise<void>;
  children: React.ReactNode;
};

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function maskPhone(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D+/g, "");
  if (digits.length < 4) return "Phone not available";
  return `•••• ${digits.slice(-4)}`;
}

export function CustomerPortalShell({
  token,
  customerName,
  customerPhone,
  currentShipmentId,
  shipments,
  logoutTrackingAction,
  children,
}: Props) {
  const latestUpdate = shipments[0]?.last_update_at ?? null;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(15,118,110,0.14),_transparent_38%),radial-gradient(circle_at_bottom_right,_rgba(14,116,144,0.12),_transparent_42%)] px-5 py-6 sm:px-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-700">
                  Customer Tracking Portal
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-stone-950">
                    {customerName}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-stone-600">
                    <span className="inline-flex items-center gap-2">
                      <Phone className="h-4 w-4 text-stone-400" />
                      Verified with {maskPhone(customerPhone)}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Package2 className="h-4 w-4 text-stone-400" />
                      {shipments.length} shipment{shipments.length === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-stone-400" />
                      Latest update {fmtDateTime(latestUpdate)}
                    </span>
                  </div>
                </div>
              </div>
              <form action={logoutTrackingAction}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-stone-950">All Shipments</h2>
              <p className="text-sm text-stone-500">
                Switch between shipments linked to this customer profile.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {shipments.map((shipment) => {
              const active = shipment.id === currentShipmentId;
              const disabled = !shipment.has_portal_content && !active;
              const cardClassName = active
                ? "border-teal-500 bg-teal-50"
                : disabled
                  ? "border-stone-200 bg-stone-50 opacity-70"
                  : "border-stone-200 bg-white hover:border-teal-300 hover:bg-teal-50/40";
              const content = (
                <div className={`rounded-[1.6rem] border p-4 transition ${cardClassName}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-stone-950">
                        {shipment.shipment_code}
                      </div>
                      <div className="mt-1 text-sm text-stone-500">
                        {shipment.origin} - {shipment.destination}
                      </div>
                    </div>
                    <Badge tone="zinc">{overallStatusLabel(shipment.overall_status)}</Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-stone-600">
                    <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1">
                      {transportModeLabel(shipment.transport_mode)}
                    </span>
                    <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1">
                      Updated {fmtDateTime(shipment.last_update_at)}
                    </span>
                  </div>

                  {disabled ? (
                    <div className="mt-4 text-sm text-stone-500">
                      No customer-facing updates have been shared yet.
                    </div>
                  ) : active ? (
                    <div className="mt-4 text-sm font-medium text-teal-800">
                      Currently open
                    </div>
                  ) : (
                    <div className="mt-4 text-sm font-medium text-teal-800">
                      Open shipment
                    </div>
                  )}
                </div>
              );

              if (disabled) {
                return <div key={shipment.id}>{content}</div>;
              }

              return (
                <Link
                  key={shipment.id}
                  href={`/track/${token}?shipment=${shipment.id}`}
                  className="block"
                >
                  {content}
                </Link>
              );
            })}
          </div>
        </section>

        <div>{children}</div>
      </div>
    </div>
  );
}
