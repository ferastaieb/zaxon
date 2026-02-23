"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  readShipmentFlash,
  stripShipmentFlashParams
} from "@/lib/shipments/flash";

const TOAST_HIDE_DELAY_MS = 3000;

export function ShipmentFlashToast() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isShipmentPath = pathname.startsWith("/shipments");
  const flash = isShipmentPath ? readShipmentFlash(searchParams) : null;

  useEffect(() => {
    if (!isShipmentPath || !flash) return;
    const cleanedQuery = stripShipmentFlashParams(searchParams, flash.kind);

    const timer = window.setTimeout(() => {
      router.replace(cleanedQuery ? `${pathname}?${cleanedQuery}` : pathname, {
        scroll: false,
      });
    }, TOAST_HIDE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [flash, isShipmentPath, pathname, router, searchParams]);

  if (!flash || !isShipmentPath) return null;

  const toneClasses =
    flash.tone === "info"
      ? "border-blue-200 bg-blue-50 text-blue-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80]">
      <div
        role="status"
        aria-live="polite"
        className={`rounded-lg border px-3 py-2 text-xs font-medium shadow-lg ${toneClasses}`}
      >
        {flash.message}
      </div>
    </div>
  );
}
