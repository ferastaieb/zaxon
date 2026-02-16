"use client";

import { useState } from "react";

import { AppIllustration } from "@/components/ui/AppIllustration";
import type { FtlStepData } from "../types";
import { boolValue, fieldName } from "../fieldNames";
import { SectionFrame } from "./SectionFrame";

type StockSummaryRow = {
  reference: string;
  importedQuantity: number;
  importedWeight: number;
  exportedQuantity: number;
  exportedWeight: number;
  remainingQuantity: number;
  remainingWeight: number;
};

type Props = {
  step: FtlStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  isAdmin: boolean;
  summaryRows: StockSummaryRow[];
};

export function StockViewStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  isAdmin,
  summaryRows,
}: Props) {
  const [snapshotConfirmed, setSnapshotConfirmed] = useState(
    boolValue(step.values.stock_snapshot_confirmed),
  );

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="notes" value="" />
      <SectionFrame
        title="Stock View"
        description="Consolidated import/export balance by linked import shipment."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        saveLabel="Save stock snapshot"
      >
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-zinc-600">
              Ledger-style view of imported, exported, and remaining balances.
            </div>
            <AppIllustration
              name="stock-ledger"
              alt="Stock ledger overview"
              width={260}
              height={140}
              className="h-20 w-44"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-zinc-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-600">
              <tr>
                <th className="px-3 py-2">Import reference</th>
                <th className="px-3 py-2">Imported qty</th>
                <th className="px-3 py-2">Imported wt</th>
                <th className="px-3 py-2">Exported qty</th>
                <th className="px-3 py-2">Exported wt</th>
                <th className="px-3 py-2">Remaining qty</th>
                <th className="px-3 py-2">Remaining wt</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.reference} className="border-t border-zinc-200">
                  <td className="px-3 py-2 font-medium text-zinc-900">{row.reference}</td>
                  <td className="px-3 py-2 text-zinc-700">{row.importedQuantity}</td>
                  <td className="px-3 py-2 text-zinc-700">{row.importedWeight}</td>
                  <td className="px-3 py-2 text-zinc-700">{row.exportedQuantity}</td>
                  <td className="px-3 py-2 text-zinc-700">{row.exportedWeight}</td>
                  <td className="px-3 py-2 text-zinc-700">{row.remainingQuantity}</td>
                  <td className="px-3 py-2 text-zinc-700">{row.remainingWeight}</td>
                </tr>
              ))}
              {summaryRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center">
                    <AppIllustration
                      name="stock-ledger"
                      alt="No stock rows yet"
                      width={300}
                      height={160}
                      className="mx-auto h-24 w-full max-w-xs"
                    />
                    <div className="mt-1 text-zinc-500">No import allocation rows yet.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
          <input type="hidden" name={fieldName(["stock_snapshot_confirmed"])} value="" />
          <input
            type="checkbox"
            name={fieldName(["stock_snapshot_confirmed"])}
            value="1"
            checked={snapshotConfirmed}
            onChange={(event) => setSnapshotConfirmed(event.target.checked)}
            disabled={!canEdit}
            className="h-4 w-4 rounded border-zinc-300"
          />
          <span>Stock snapshot confirmed</span>
        </label>
      </SectionFrame>
    </form>
  );
}
