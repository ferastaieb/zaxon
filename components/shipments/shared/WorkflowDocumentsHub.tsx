"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { FileText, X } from "lucide-react";

import { WorkflowDocumentsPanel } from "@/components/shipments/shared/WorkflowDocumentsPanel";

type WorkflowDocumentsHubProps = ComponentProps<typeof WorkflowDocumentsPanel> & {
  defaultOpen?: boolean;
};

export function WorkflowDocumentsHub({
  defaultOpen = false,
  ...panelProps
}: WorkflowDocumentsHubProps) {
  const [open, setOpen] = useState(defaultOpen);
  const openRequestCount = useMemo(
    () => panelProps.docRequests.filter((request) => request.status === "OPEN").length,
    [panelProps.docRequests],
  );
  const pendingReviewCount = useMemo(
    () =>
      panelProps.docs.filter((doc) => {
        const status = doc.review_status ?? "PENDING";
        return status === "PENDING";
      }).length,
    [panelProps.docs],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-6 right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300"
        aria-label={open ? "Close documents hub" : "Open documents hub"}
        aria-expanded={open}
      >
        <FileText className="h-5 w-5" />
        {pendingReviewCount > 0 || openRequestCount > 0 ? (
          <span className="pointer-events-none absolute -right-2 -top-2 flex flex-col items-end gap-1">
            {pendingReviewCount > 0 ? (
              <span
                className="min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
                title="Pending document reviews"
                aria-label={`Pending document reviews: ${pendingReviewCount}`}
              >
                {pendingReviewCount > 99 ? "99+" : pendingReviewCount}
              </span>
            ) : null}
            {openRequestCount > 0 ? (
              <span
                className="min-w-5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
                title="Open document requests"
                aria-label={`Open document requests: ${openRequestCount}`}
              >
                {openRequestCount > 99 ? "99+" : openRequestCount}
              </span>
            ) : null}
          </span>
        ) : null}
      </button>

      {open ? (
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/20"
          aria-label="Close documents hub overlay"
        />
      ) : null}

      <aside
        className={`fixed right-0 top-0 z-50 h-full w-[min(92vw,380px)] border-l border-zinc-200 bg-zinc-50 shadow-xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
          <div className="text-sm font-semibold text-zinc-900">Document hub</div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-100"
            aria-label="Close documents hub"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="h-[calc(100%-57px)] overflow-y-auto p-3">
          <WorkflowDocumentsPanel {...panelProps} />
        </div>
      </aside>
    </>
  );
}
