"use client";

import { useState } from "react";

import type { FtlStepData } from "../types";
import { boolValue, fieldName, stringValue, toRecord } from "../fieldNames";
import { SectionFrame } from "./SectionFrame";

type Props = {
  step: FtlStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
};

export function ExportPlanStepForm({ step, updateAction, returnTo, canEdit }: Props) {
  const values = toRecord(step.values);
  const [orderReceived, setOrderReceived] = useState(boolValue(values.order_received));

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title="Export Plan Overview"
        description="Order confirmation triggers the loading workflow for the shipment."
        status={step.status}
        canEdit={canEdit}
        saveLabel="Save overview"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
            <input type="hidden" name={fieldName(["order_received"])} value="" />
            <input
              type="checkbox"
              name={fieldName(["order_received"])}
              value="1"
              checked={orderReceived}
              onChange={(event) => setOrderReceived(event.target.checked)}
              disabled={!canEdit}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <span>Order received</span>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">
              Order received date {orderReceived ? "*" : ""}
            </div>
            <input
              type="date"
              name={fieldName(["order_received_date"])}
              defaultValue={stringValue(values.order_received_date)}
              required={orderReceived}
              disabled={!canEdit}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Planned loading date</div>
            <input
              type="date"
              name={fieldName(["planned_loading_date"])}
              defaultValue={stringValue(values.planned_loading_date)}
              disabled={!canEdit}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>
        </div>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Remarks</div>
          <textarea
            name={fieldName(["remarks"])}
            defaultValue={stringValue(values.remarks)}
            disabled={!canEdit}
            className="min-h-24 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
        </label>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Notes</div>
          <textarea
            name="notes"
            defaultValue={step.notes ?? ""}
            disabled={!canEdit}
            className="min-h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
        </label>
      </SectionFrame>
    </form>
  );
}

