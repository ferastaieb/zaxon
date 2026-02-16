"use client";

import type { ImportTransferStepData, ImportTransferStockSummary } from "../types";
import { boolValue, fieldName, toRecord } from "../fieldNames";
import { SectionFrame } from "@/components/shipments/ftl-export/forms/SectionFrame";

type Props = {
  step: ImportTransferStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  isAdmin: boolean;
  summary: ImportTransferStockSummary;
};

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function stockTypeLabel(stockType: ImportTransferStockSummary["stockType"]) {
  if (stockType === "WAREHOUSE_STOCK") return "Warehouse Stock";
  if (stockType === "OWNERSHIP_STOCK") return "Ownership Stock";
  return "Pending";
}

export function StockViewStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  isAdmin,
  summary,
}: Props) {
  const values = toRecord(step.values);
  const confirmed = boolValue(values.stock_snapshot_confirmed);

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title="Stock View"
        description="Stock position is computed from imported baseline and export allocations."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        saveLabel="Save stock view"
      >
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-3 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="text-xs uppercase tracking-[0.08em] text-zinc-500">Imported</div>
              <div className="mt-1 text-sm font-semibold text-emerald-700">
                {summary.importedQuantity} qty / {summary.importedWeight} wt
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="text-xs uppercase tracking-[0.08em] text-zinc-500">Exported</div>
              <div className="mt-1 text-sm font-semibold text-rose-700">
                {summary.exportedQuantity} qty / {summary.exportedWeight} wt
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="text-xs uppercase tracking-[0.08em] text-zinc-500">Remaining</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">
                {summary.remainingQuantity} qty / {summary.remainingWeight} wt
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="text-xs uppercase tracking-[0.08em] text-zinc-500">Stock type</div>
              <div
                className={`mt-1 text-sm font-semibold ${
                  summary.stockType === "WAREHOUSE_STOCK"
                    ? "text-emerald-700"
                    : summary.stockType === "OWNERSHIP_STOCK"
                      ? "text-blue-700"
                      : "text-amber-700"
                }`}
              >
                {stockTypeLabel(summary.stockType)}
              </div>
            </div>
          </div>

          <label className="mb-3 flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
            <input type="hidden" name={fieldName(["stock_snapshot_confirmed"])} value="" />
            <input
              type="checkbox"
              name={fieldName(["stock_snapshot_confirmed"])}
              value="1"
              defaultChecked={confirmed}
              className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
            />
            <span className="font-medium text-zinc-800">Stock snapshot confirmed</span>
          </label>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-semibold uppercase tracking-[0.08em]">
                    Export shipment
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-[0.08em]">Date</th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-[0.08em]">
                    Allocated qty
                  </th>
                  <th className="px-3 py-2 font-semibold uppercase tracking-[0.08em]">
                    Allocated wt
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {summary.allocationHistory.map((row, index) => (
                  <tr key={`${row.exportShipmentCode}-${row.exportDate}-${index}`}>
                    <td className="px-3 py-2 font-medium">{row.exportShipmentCode}</td>
                    <td className="px-3 py-2">{formatDate(row.exportDate)}</td>
                    <td className="px-3 py-2">{row.allocatedQuantity}</td>
                    <td className="px-3 py-2">{row.allocatedWeight}</td>
                  </tr>
                ))}
                {summary.allocationHistory.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-zinc-500" colSpan={4}>
                      No export allocations yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </SectionFrame>
    </form>
  );
}
