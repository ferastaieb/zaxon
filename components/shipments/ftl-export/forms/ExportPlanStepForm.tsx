"use client";

import { useState } from "react";

import type { FtlStepData } from "../types";
import { boolValue, fieldName, stringValue, toRecord } from "../fieldNames";
import { SectionFrame } from "./SectionFrame";
import { DatePickerInput } from "@/components/ui/DatePickerInput";

type Props = {
  step: FtlStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  isAdmin: boolean;
};

export function ExportPlanStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  isAdmin,
}: Props) {
  const values = toRecord(step.values);
  const [orderReceived, setOrderReceived] = useState(boolValue(values.order_received));
  const [orderReceivedDate, setOrderReceivedDate] = useState(
    stringValue(values.order_received_date),
  );
  const isDone = step.status === "DONE";

  const todayIso = () => new Date().toISOString().slice(0, 10);

  const toggleMission = () => {
    setOrderReceived((prev) => {
      const next = !prev;
      if (next && !orderReceivedDate) {
        setOrderReceivedDate(todayIso());
      }
      return next;
    });
  };

  const missionDateDisplay = orderReceivedDate
    ? orderReceivedDate.split("-").reverse().join(".")
    : "--.--.----";

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title="Export Plan Overview"
        description="Order confirmation triggers the loading workflow for the shipment."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        lockOnDone={false}
        saveLabel="Save overview"
      >
        <div
          className={`rounded-xl border p-4 transition ${
            orderReceived
              ? "border-blue-300 bg-blue-50"
              : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <input type="hidden" name={fieldName(["order_received"])} value="" />
          <input
            type="hidden"
            name={fieldName(["order_received"])}
            value={orderReceived ? "1" : ""}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                Mission control
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-900">
                Export order received
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={orderReceived}
              onClick={toggleMission}
              disabled={!canEdit || isDone}
              className={`relative inline-flex h-11 w-32 items-center rounded-full border transition ${
                orderReceived
                  ? "border-blue-500 bg-blue-600 text-white"
                  : "border-zinc-300 bg-white text-zinc-700"
              }`}
            >
              <span
                className={`absolute left-1 h-9 w-11 rounded-full bg-white shadow-sm transition-transform ${
                  orderReceived ? "translate-x-19" : "translate-x-0"
                }`}
              />
              <span
                className={`relative z-10 w-full text-xs font-semibold uppercase tracking-[0.08em] ${
                  orderReceived ? "pl-3 text-left" : "pr-3 text-right"
                }`}
              >
                {orderReceived ? "Started" : "Start"}
              </span>
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px]">
            <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                Start date
              </div>
              <div className="mt-2 font-mono text-3xl tracking-[0.18em] text-zinc-900">
                {missionDateDisplay}
              </div>
            </div>
            <label className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">Order received date *</div>
              <DatePickerInput
                
                name={fieldName(["order_received_date"])}
                value={orderReceivedDate}
                onChange={(event) => setOrderReceivedDate(event.target.value)}
                disabled={!canEdit || !orderReceived || isDone}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
               />
            </label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">Planned loading date</div>
            <DatePickerInput
              
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

      </SectionFrame>
    </form>
  );
}


