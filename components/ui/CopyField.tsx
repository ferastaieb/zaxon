"use client";

import { useState } from "react";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        readOnly
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

