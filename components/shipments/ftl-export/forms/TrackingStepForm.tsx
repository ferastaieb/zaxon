"use client";

import { Fragment, useMemo, useState } from "react";

import { encodeFieldPath, stepFieldDocType } from "@/lib/stepFields";
import type { FtlDocumentMeta, FtlStepData } from "../types";
import { boolValue, fieldName, stringValue } from "../fieldNames";
import { SectionFrame } from "./SectionFrame";
import {
  trackingRegionMeta,
  trackingStagesForRegion,
  type SyriaClearanceMode,
  type TrackingRegion,
  type TrackingStageDefinition,
} from "./trackingTimelineConfig";

type Props = {
  step: FtlStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  latestDocsByType: Record<string, FtlDocumentMeta>;
  region: TrackingRegion;
  locked: boolean;
  lockedMessage?: string;
  syriaClearanceMode?: SyriaClearanceMode;
};

const STALE_DAYS = 3;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function docFor(
  latestDocsByType: Record<string, FtlDocumentMeta>,
  stepId: number,
  key: string,
) {
  const docType = stepFieldDocType(stepId, encodeFieldPath([key]));
  return latestDocsByType[docType];
}

function daysSince(isoDate: string) {
  if (!isoDate) return 0;
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return 0;
  const diff = Date.now() - target.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

type StageState = {
  stage: TrackingStageDefinition;
  done: boolean;
  dateValue: string;
};

function stageTone(input: {
  stage: StageState;
  index: number;
  nextIndex: number;
  stalledStageId: string | null;
}) {
  if (input.stage.done) return "done";
  if (input.stalledStageId === input.stage.stage.id) return "stalled";
  if (input.index === input.nextIndex) return "active";
  return "pending";
}

export function TrackingStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  latestDocsByType,
  region,
  locked,
  lockedMessage,
  syriaClearanceMode,
}: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const source = step.values as Record<string, unknown>;
    const mapped: Record<string, string> = {};
    Object.keys(source).forEach((key) => {
      mapped[key] = stringValue(source[key]);
    });
    return mapped;
  });
  const [notes, setNotes] = useState(step.notes ?? "");
  const [openStageId, setOpenStageId] = useState<string | null>(null);
  const [pendingUploads, setPendingUploads] = useState<Record<string, boolean>>({});
  const disableForm = !canEdit || locked;

  const setValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const setBoolWithDate = (flagKey: string, dateKey: string, checked: boolean) => {
    setValues((prev) => {
      const next = { ...prev, [flagKey]: checked ? "1" : "" };
      if (checked && !next[dateKey]) next[dateKey] = todayIso();
      return next;
    });
  };

  const effectiveSyriaMode =
    region === "syria"
      ? (stringValue(values.syria_clearance_mode).toUpperCase() as SyriaClearanceMode) ||
        syriaClearanceMode ||
        "CLIENT"
      : "CLIENT";

  const stages = useMemo(
    () => trackingStagesForRegion(region, effectiveSyriaMode),
    [effectiveSyriaMode, region],
  );

  const stageStates = useMemo<StageState[]>(() => {
    return stages.map((stage) => {
      const dateValue = stringValue(values[stage.dateKey]);
      const checkpointDone = stage.flagKey
        ? boolValue(values[stage.flagKey]) || !!dateValue
        : !!dateValue;
      const customsDoc =
        stage.type === "customs" && stage.fileKey
          ? !!docFor(latestDocsByType, step.id, stage.fileKey) ||
            !!pendingUploads[stage.id]
          : true;
      const done =
        stage.type === "customs" ? !!dateValue && customsDoc : checkpointDone;
      return { stage, done, dateValue };
    });
  }, [latestDocsByType, pendingUploads, stages, step.id, values]);

  const doneIndexes = stageStates
    .map((entry, index) => (entry.done ? index : -1))
    .filter((index) => index >= 0);
  const latestDoneIndex = doneIndexes.length ? Math.max(...doneIndexes) : -1;
  const nextIndex = Math.min(latestDoneIndex + 1, Math.max(stages.length - 1, 0));
  const latestDoneDate =
    latestDoneIndex >= 0 ? stageStates[latestDoneIndex]?.dateValue ?? "" : "";
  const stalledStageId =
    latestDoneIndex >= 0 &&
    latestDoneIndex < stages.length - 1 &&
    daysSince(latestDoneDate) >= STALE_DAYS
      ? stages[latestDoneIndex + 1].id
      : null;
  const activeStage = stages.find((stage) => stage.id === openStageId) ?? null;
  const regionMeta = trackingRegionMeta(region);

  return (
    <form action={updateAction} encType="multipart/form-data">
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {region === "syria" ? (
        <input
          type="hidden"
          name={fieldName(["syria_clearance_mode"])}
          value={effectiveSyriaMode}
        />
      ) : null}
      <SectionFrame
        title={regionMeta.title}
        description={regionMeta.description}
        status={step.status}
        canEdit={canEdit}
        disabled={locked}
        disabledMessage={lockedMessage}
        saveLabel="Save tracking"
      >
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Interactive timeline
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max items-center gap-2">
              {stageStates.map((entry, index) => {
                const tone = stageTone({
                  stage: entry,
                  index,
                  nextIndex,
                  stalledStageId,
                });
                const buttonClass =
                  tone === "done"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : tone === "active"
                      ? "border-blue-300 bg-blue-50 text-blue-900"
                      : tone === "stalled"
                        ? "border-red-300 bg-red-50 text-red-900"
                        : "border-zinc-200 bg-white text-zinc-700";
                const dotClass =
                  tone === "done"
                    ? "bg-emerald-500"
                    : tone === "active"
                      ? "bg-blue-500"
                      : tone === "stalled"
                        ? "bg-red-500"
                        : "bg-zinc-300";
                return (
                  <Fragment key={entry.stage.id}>
                    <button
                      type="button"
                      onClick={() => setOpenStageId(entry.stage.id)}
                      className={`w-40 rounded-lg border px-3 py-2 text-left transition ${buttonClass}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                        <span className="text-xs font-semibold">{entry.stage.shortLabel}</span>
                      </div>
                      <div className="mt-1 text-[11px] opacity-80">{entry.stage.location}</div>
                      <div className="mt-1 text-[11px] font-medium">
                        {entry.done ? "Completed" : "Pending"}
                      </div>
                    </button>
                    {index < stageStates.length - 1 ? (
                      <div
                        className={`h-[3px] w-8 rounded-full ${
                          entry.done ? "bg-emerald-400" : "bg-zinc-300"
                        }`}
                      />
                    ) : null}
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {stalledStageId ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            Tracking looks stalled for more than {STALE_DAYS} days at{" "}
            {stages.find((stage) => stage.id === stalledStageId)?.shortLabel}.
          </div>
        ) : null}

        {region === "syria" ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            Clearance mode: <span className="font-semibold">{effectiveSyriaMode}</span>
          </div>
        ) : null}

        {stageStates.map((entry) => {
          const stage = entry.stage;
          const doc =
            stage.fileKey && stage.type === "customs"
              ? docFor(latestDocsByType, step.id, stage.fileKey)
              : undefined;
          const flagChecked = stage.flagKey ? boolValue(values[stage.flagKey]) : false;
          const stageOpen = openStageId === stage.id;

          return (
            <div
              key={`modal-${stage.id}`}
              className={
                stageOpen
                  ? "fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
                  : "hidden"
              }
            >
              <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                      {stage.location}
                    </div>
                    <h4 className="mt-1 text-lg font-semibold text-zinc-900">{stage.title}</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenStageId(null)}
                    className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {stage.type === "checkpoint" && stage.flagKey ? (
                    <label className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                      <input type="hidden" name={fieldName([stage.flagKey])} value="" />
                      <input
                        type="checkbox"
                        name={fieldName([stage.flagKey])}
                        value="1"
                        checked={flagChecked}
                        onChange={(event) =>
                          setBoolWithDate(stage.flagKey!, stage.dateKey, event.target.checked)
                        }
                        disabled={disableForm}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                      <span>Mark as completed</span>
                    </label>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      type="date"
                      name={fieldName([stage.dateKey])}
                      value={values[stage.dateKey] ?? ""}
                      onChange={(event) => setValue(stage.dateKey, event.target.value)}
                      disabled={disableForm}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const now = todayIso();
                        setValue(stage.dateKey, now);
                        if (stage.flagKey) setBoolWithDate(stage.flagKey, stage.dateKey, true);
                      }}
                      disabled={disableForm}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                    >
                      Set to now
                    </button>
                  </div>

                  {stage.type === "customs" && stage.fileKey ? (
                    <div>
                      <input
                        type="file"
                        name={fieldName([stage.fileKey])}
                        disabled={disableForm}
                        onChange={(event) =>
                          setPendingUploads((prev) => ({
                            ...prev,
                            [stage.id]: (event.target.files?.length ?? 0) > 0,
                          }))
                        }
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs disabled:bg-zinc-100"
                      />
                      <div className="mt-1 text-xs text-zinc-500">
                        {doc ? (
                          <a href={`/api/documents/${doc.id}`} className="hover:underline">
                            Download latest declaration
                          </a>
                        ) : (
                          "No declaration upload yet."
                        )}
                      </div>
                    </div>
                  ) : null}

                  {stage.includeOffloadLocation ? (
                    <input
                      name={fieldName(["syria_offload_location"])}
                      value={values.syria_offload_location ?? ""}
                      onChange={(event) =>
                        setValue("syria_offload_location", event.target.value)
                      }
                      placeholder="Offload location"
                      disabled={disableForm}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                    />
                  ) : null}
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setOpenStageId(null)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Apply and close
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {activeStage ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            Editing stage: <span className="font-semibold">{activeStage.title}</span>
          </div>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            Click any timeline stage to update date, documents, and status.
          </div>
        )}

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Notes</div>
          <textarea
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={disableForm}
            className="min-h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
        </label>
      </SectionFrame>
    </form>
  );
}
