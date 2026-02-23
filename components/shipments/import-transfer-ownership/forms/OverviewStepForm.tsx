"use client";

import { useState } from "react";

import type { ImportTransferStepData } from "../types";
import { boolValue, fieldName, stringValue, toRecord } from "../fieldNames";
import { SectionFrame } from "@/components/shipments/ftl-export/forms/SectionFrame";
import { DatePickerInput } from "@/components/ui/DatePickerInput";

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
  const [requestReceived, setRequestReceived] = useState(
    boolValue(values.request_received),
  );
  const [requestDate, setRequestDate] = useState(
    stringValue(values.request_received_date),
  );
  const isDone = step.status === "DONE";

  const toggleMission = () => {
    setRequestReceived((prev) => {
      const next = !prev;
      if (next && !requestDate) {
        setRequestDate(todayIso());
      }
      return next;
    });
  };

  const missionDateDisplay = requestDate
    ? requestDate.split("-").reverse().join(".")
    : "--.--.----";

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
        lockOnDone={false}
        saveLabel="Save overview"
      >
        <div
          className={`rounded-xl border p-4 transition ${
            requestReceived
              ? "border-blue-300 bg-blue-50"
              : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <input type="hidden" name={fieldName(["request_received"])} value="" />
          <input
            type="hidden"
            name={fieldName(["request_received"])}
            value={requestReceived ? "1" : ""}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                Mission control
              </div>
              <div className="mt-1 text-lg font-semibold text-zinc-900">
                Transfer request received
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={requestReceived}
              onClick={toggleMission}
              disabled={!canEdit || isDone}
              className={`relative inline-flex h-11 w-32 items-center rounded-full border transition ${
                requestReceived
                  ? "border-blue-500 bg-blue-600 text-white"
                  : "border-zinc-300 bg-white text-zinc-700"
              }`}
            >
              <span
                className={`absolute left-1 h-9 w-11 rounded-full bg-white shadow-sm transition-transform ${
                  requestReceived ? "translate-x-19" : "translate-x-0"
                }`}
              />
              <span
                className={`relative z-10 w-full text-xs font-semibold uppercase tracking-[0.08em] ${
                  requestReceived ? "pl-3 text-left" : "pr-3 text-right"
                }`}
              >
                {requestReceived ? "Started" : "Start"}
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
              <div className="mb-1 text-xs font-medium text-zinc-600">Request received date *</div>
              <DatePickerInput
                
                name={fieldName(["request_received_date"])}
                value={requestDate}
                onChange={(event) => setRequestDate(event.target.value)}
                disabled={!canEdit || !requestReceived || isDone}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
               />
            </label>
          </div>
        </div>
      </SectionFrame>
    </form>
  );
}

