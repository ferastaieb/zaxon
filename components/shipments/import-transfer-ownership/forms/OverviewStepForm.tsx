"use client";

import type { ImportTransferStepData } from "../types";
import { boolValue, fieldName, stringValue, toRecord } from "../fieldNames";
import { SectionFrame } from "@/components/shipments/ftl-export/forms/SectionFrame";

type Props = {
  step: ImportTransferStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  isAdmin: boolean;
};

function todayIso() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function OverviewStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  isAdmin,
}: Props) {
  const values = toRecord(step.values);
  const requestReceived = boolValue(values.request_received);
  const requestDate =
    stringValue(values.request_received_date) || (requestReceived ? todayIso() : "");

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title="Overview"
        description="Start the import ownership workflow when the request is received."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        saveLabel="Save overview"
      >
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,220px)]">
            <label className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
              <input type="hidden" name={fieldName(["request_received"])} value="" />
              <input
                type="checkbox"
                name={fieldName(["request_received"])}
                value="1"
                defaultChecked={requestReceived}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-900"
              />
              <span className="font-medium text-zinc-800">Request received</span>
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-zinc-500">
                Request date
              </div>
              <input
                type="date"
                name={fieldName(["request_received_date"])}
                defaultValue={requestDate}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>
      </SectionFrame>
    </form>
  );
}
