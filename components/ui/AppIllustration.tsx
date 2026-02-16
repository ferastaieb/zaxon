import Image from "next/image";

const ILLUSTRATION_PATHS = {
  "hero-fcl-port": "/Illustrations/img-hero-fcl-port.png",
  "hero-ftl-route": "/Illustrations/img-hero-ftl-route.png",
  "hero-import-ownership": "/Illustrations/img-hero-import-ownership.png",
  "empty-no-trucks-booked": "/Illustrations/img-empty-no-trucks-booked.png",
  "empty-no-tracking-events": "/Illustrations/img-empty-no-tracking-events.png",
  "empty-no-import-links": "/Illustrations/img-empty-no-import-links.png",
  "empty-no-documents": "/Illustrations/img-empty-no-documents.png",
  "stock-ledger": "/Illustrations/img-stock-ledger.png",
} as const;

export type AppIllustrationName = keyof typeof ILLUSTRATION_PATHS;

export function AppIllustration({
  name,
  alt = "",
  width = 320,
  height = 180,
  className = "",
  priority = false,
}: {
  name: AppIllustrationName;
  alt?: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={ILLUSTRATION_PATHS[name]}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={`select-none object-contain ${className}`}
    />
  );
}

