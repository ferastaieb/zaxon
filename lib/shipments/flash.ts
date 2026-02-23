export type ShipmentFlashKind = "saved" | "created" | "requested" | "savedSub";

export type ShipmentFlashTone = "success" | "info";

export type ShipmentFlashPayload = {
  kind: ShipmentFlashKind;
  message: string;
  tone: ShipmentFlashTone;
};

type ParamsLike = Pick<URLSearchParams, "get" | "toString">;

const SHIPMENT_FLASH_PRIORITY: readonly ShipmentFlashKind[] = [
  "created",
  "savedSub",
  "saved",
  "requested",
];

const SHIPMENT_FLASH_METADATA: Record<
  ShipmentFlashKind,
  Omit<ShipmentFlashPayload, "kind">
> = {
  saved: {
    message: "Saved successfully.",
    tone: "success",
  },
  created: {
    message: "Created successfully.",
    tone: "success",
  },
  requested: {
    message: "Request sent.",
    tone: "info",
  },
  savedSub: {
    message: "Saved successfully.",
    tone: "success",
  },
};

function hasFlashValue(params: ParamsLike, key: ShipmentFlashKind) {
  const value = params.get(key);
  return typeof value === "string" && value.trim().length > 0;
}

export function readShipmentFlash(params: ParamsLike): ShipmentFlashPayload | null {
  for (const key of SHIPMENT_FLASH_PRIORITY) {
    if (!hasFlashValue(params, key)) continue;
    return {
      kind: key,
      ...SHIPMENT_FLASH_METADATA[key],
    };
  }

  return null;
}

export function stripShipmentFlashParams(
  params: ParamsLike,
  flashKind: ShipmentFlashKind,
) {
  const next = new URLSearchParams(params.toString());
  next.delete(flashKind);

  // Keep status as a normal page filter unless it was paired with saved flash metadata.
  if (flashKind === "saved" && next.has("status")) {
    next.delete("status");
  }

  return next.toString();
}
