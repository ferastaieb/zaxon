"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  shipmentId: number;
  requestTypes: string[];
};

function normalizeLabel(type: string) {
  return type
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function OpenDocRequestsNotice({ shipmentId, requestTypes }: Props) {
  const normalizedTypes = useMemo(
    () =>
      Array.from(
        new Set(requestTypes.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)),
      ),
    [requestTypes],
  );
  const signature = useMemo(() => normalizedTypes.slice().sort().join("|"), [normalizedTypes]);
  const [dismissedBySignature, setDismissedBySignature] = useState<Record<string, true>>({});
  const visible = signature.length > 0 && !dismissedBySignature[signature];

  useEffect(() => {
    if (!signature || dismissedBySignature[signature]) return;
    const timeout = window.setTimeout(() => {
      setDismissedBySignature((current) => ({ ...current, [signature]: true }));
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [dismissedBySignature, shipmentId, signature]);

  if (!visible || normalizedTypes.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Open customer document requests: {normalizedTypes.map(normalizeLabel).join(", ")}
    </div>
  );
}
