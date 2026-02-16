import Image from "next/image";

const ICON_PATHS = {
  "icon-shipment-create": "/icons/icon-shipment-create.svg",
  "icon-client-single": "/icons/icon-client-single.svg",
  "icon-route": "/icons/icon-route.svg",
  "icon-order-received": "/icons/icon-order-received.svg",
  "icon-calendar-trigger": "/icons/icon-calendar-trigger.svg",
  "icon-doc-required": "/icons/icon-doc-required.svg",
  "icon-upload-proof": "/icons/icon-upload-proof.svg",
  "icon-stock": "/icons/icon-stock.svg",
  "icon-allocation": "/icons/icon-allocation.svg",
  "icon-finalized": "/icons/icon-finalized.svg",
  "icon-locked": "/icons/icon-locked.svg",
  "icon-activity-log": "/icons/icon-activity-log.svg",
} as const;

export type AppIconName = keyof typeof ICON_PATHS;

export function AppIcon({
  name,
  size = 20,
  className = "",
  title,
}: {
  name: AppIconName;
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <Image
      src={ICON_PATHS[name]}
      alt={title ? title : ""}
      title={title}
      aria-hidden={title ? undefined : true}
      width={size}
      height={size}
      className={`shrink-0 select-none object-contain ${className}`}
    />
  );
}
