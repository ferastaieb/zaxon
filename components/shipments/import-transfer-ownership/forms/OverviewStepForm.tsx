"use client";

import { useState } from "react";

import type { ImportTransferJobIdMeta, ImportTransferStepData } from "../types";
import { boolValue, fieldName, stringValue, toRecord } from "../fieldNames";
import { SectionFrame } from "@/components/shipments/ftl-export/forms/SectionFrame";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import { CopyField } from "@/components/ui/CopyField";

type Props = {
  step: ImportTransferStepData;
  updateAction: (formData: FormData) => void;
  addJobIdsAction: (formData: FormData) => void;
  removeJobIdAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  isAdmin: boolean;
  jobIds: ImportTransferJobIdMeta[];
  trackingLink: string;
};

function todayIso() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function OverviewStepForm({
  step,
  updateAction,
  addJobIdsAction,
  removeJobIdAction,
  returnTo,
  canEdit,
  isAdmin,
  jobIds,
  trackingLink,
}: Props) {
  const values = toRecord(step.values);
  const [requestReceived, setRequestReceived] = useState(
    boolValue(values.request_received),
  );
  const [requestDate, setRequestDate] = useState(
    stringValue(values.request_received_date),
  );
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
        description="Start the import ownership workflow when the request is received, add the job number, and share the client tracking link."
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
              disabled={!canEdit}
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
                disabled={!canEdit || !requestReceived}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
               />
            </label>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Job number
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {jobIds.length === 0 ? (
                <span className="text-sm text-amber-700">
                  Add a job number before this shipment can be completed.
                </span>
              ) : (
                jobIds.map((job) => (
                  <div
                    key={job.id}
                    className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800"
                  >
                    <span>{job.job_id}</span>
                    {canEdit ? (
                      <button
                        type="submit"
                        formAction={removeJobIdAction}
                        name="jobIdId"
                        value={String(job.id)}
                        className="text-zinc-400 transition hover:text-red-600"
                      >
                        x
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                name="jobIds"
                disabled={!canEdit}
                placeholder="Add job number"
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
              />
              <button
                type="submit"
                formAction={addJobIdsAction}
                disabled={!canEdit}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100"
              >
                Add job number
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">
              Client tracking
            </div>
            <div className="mt-3">
              <CopyField value={trackingLink} />
              <p className="mt-2 text-xs text-zinc-500">
                Share this link with the client.
              </p>
            </div>
          </div>
        </div>
      </SectionFrame>
    </form>
  );
}

