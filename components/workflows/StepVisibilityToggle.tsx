"use client";

import { useState } from "react";

export function StepVisibilityToggle({
  defaultIsExternal = false,
  defaultCustomerVisible = false,
}: {
  defaultIsExternal?: boolean;
  defaultCustomerVisible?: boolean;
}) {
  const [isExternal, setIsExternal] = useState(defaultIsExternal);
  const [customerVisible, setCustomerVisible] = useState(
    defaultIsExternal ? true : defaultCustomerVisible,
  );

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="isExternal"
          value="1"
          checked={isExternal}
          onChange={(event) => {
            const next = event.target.checked;
            setIsExternal(next);
            if (next) {
              setCustomerVisible(true);
            }
          }}
        />
        External tracking step (always customer visible)
      </label>

      {!isExternal ? (
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            name="customerVisible"
            value="1"
            checked={customerVisible}
            onChange={(event) => setCustomerVisible(event.target.checked)}
          />
          Visible in customer portal
        </label>
      ) : (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          Customer visibility is always on for tracking steps.
        </div>
      )}

      {isExternal ? (
        <input type="hidden" name="customerVisible" value="1" />
      ) : null}
    </div>
  );
}
