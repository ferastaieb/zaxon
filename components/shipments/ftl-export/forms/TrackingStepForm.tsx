"use client";

import { Fragment, useMemo, useState } from "react";

import { AppIllustration } from "@/components/ui/AppIllustration";
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
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import type { JafzaLandRouteId } from "@/lib/routes/jafzaLandRoutes";

export type TrackingAgentGate = {
  jebelAliReady: boolean;
  silaReady: boolean;
  bathaReady: boolean;
  bathaModeReady: boolean;
  omariReady: boolean;
  naseebReady: boolean;
  mushtarakahReady: boolean;
  masnaaReady: boolean;
};

type Props = {
  step: FtlStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  isAdmin: boolean;
  latestDocsByType: Record<string, FtlDocumentMeta>;
  region: TrackingRegion;
  locked: boolean;
  lockedMessage?: string;
  syriaClearanceMode?: SyriaClearanceMode;
  agentGate: TrackingAgentGate;
  routeId?: JafzaLandRouteId;
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

type GateInfo = {
  ready: boolean;
  message: string;
};

function gateForStage(
  stageId: string,
  gate: TrackingAgentGate,
  routeId: JafzaLandRouteId,
): GateInfo | null {
  if (stageId.startsWith("jebel_ali_")) {
    return {
      ready: gate.jebelAliReady,
      message:
        "Assign Jebel Ali clearing agent in Customs Agents before updating this border.",
    };
  }
  if (stageId.startsWith("sila_")) {
    return {
      ready: gate.silaReady,
      message:
        "Assign Sila clearing agent in Customs Agents before updating this border.",
    };
  }
  if (stageId.startsWith("batha_")) {
    const needsMode = routeId === "JAFZA_TO_KSA";
    return {
      ready: needsMode ? gate.bathaModeReady : gate.bathaReady,
      message: needsMode
        ? "Complete Batha customs mode, consignee, and agent in Customs Agents before updating this border."
        : "Assign Batha clearing agent in Customs Agents before updating this border.",
    };
  }
  if (stageId.startsWith("omari_")) {
    return {
      ready: gate.omariReady,
      message:
        "Assign Omari clearing agent in Customs Agents before updating this border.",
    };
  }
  if (stageId.startsWith("syria_")) {
    return {
      ready: gate.naseebReady,
      message:
        "Complete Naseeb clearance assignment in Customs Agents before updating Syria border.",
    };
  }
  if (stageId.startsWith("mushtarakah_")) {
    return {
      ready: gate.mushtarakahReady,
      message:
        "Assign Mushtarakah agent and consignee in Customs Agents before updating this border.",
    };
  }
  if (stageId.startsWith("masnaa_")) {
    return {
      ready: gate.masnaaReady,
      message:
        "Complete Masnaa customs mode, consignee, and agent in Customs Agents before updating this border.",
    };
  }
  return null;
}

type TrackingStageState = {
  stage: TrackingStageDefinition;
  done: boolean;
  dateValue: string;
  gate: GateInfo | null;
};

type CustomsStageState = {
  stage: TrackingStageDefinition;
  done: boolean;
  dateValue: string;
  gate: GateInfo | null;
};

function stageTone(input: {
  stage: TrackingStageState;
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
  isAdmin,
  latestDocsByType,
  region,
  locked,
  lockedMessage,
  syriaClearanceMode,
  agentGate,
  routeId,
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
  const effectiveRouteId = routeId ?? "JAFZA_TO_SYRIA";

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

  const allStages = useMemo(
    () =>
      trackingStagesForRegion({
        region,
        routeId: effectiveRouteId,
        syriaMode: effectiveSyriaMode,
      }),
    [effectiveRouteId, effectiveSyriaMode, region],
  );
  const customsStages = useMemo(
    () => allStages.filter((stage) => stage.type === "customs"),
    [allStages],
  );
  const trackingStages = useMemo(
    () => allStages.filter((stage) => stage.type === "checkpoint"),
    [allStages],
  );

  const customsStates = useMemo<CustomsStageState[]>(() => {
    return customsStages.map((stage) => {
      const dateValue = stringValue(values[stage.dateKey]);
      const customsDoc =
        stage.fileKey && stage.type === "customs"
          ? !!docFor(latestDocsByType, step.id, stage.fileKey) ||
            !!pendingUploads[stage.id]
          : true;
      const done = !!dateValue && customsDoc;
      return {
        stage,
        done,
        dateValue,
        gate: gateForStage(stage.id, agentGate, effectiveRouteId),
      };
    });
  }, [
    agentGate,
    customsStages,
    effectiveRouteId,
    latestDocsByType,
    pendingUploads,
    step.id,
    values,
  ]);

  const trackingStates = useMemo<TrackingStageState[]>(() => {
    return trackingStages.map((stage) => {
      const dateValue = stringValue(values[stage.dateKey]);
      const checkpointDone = stage.flagKey
        ? boolValue(values[stage.flagKey]) || !!dateValue
        : !!dateValue;
      return {
        stage,
        done: checkpointDone,
        dateValue,
        gate: gateForStage(stage.id, agentGate, effectiveRouteId),
      };
    });
  }, [agentGate, effectiveRouteId, trackingStages, values]);
  const trackingCompletedCount = trackingStates.filter((entry) => entry.done).length;
  const stageSequenceBlockedById = useMemo(() => {
    const blockedById = new Map<string, boolean>();
    for (let index = 0; index < trackingStates.length; index += 1) {
      const current = trackingStates[index];
      const currentDone = current.done;
      if (currentDone) {
        blockedById.set(current.stage.id, false);
        continue;
      }
      const hasPreviousIncomplete = trackingStates
        .slice(0, index)
        .some((stage) => !stage.done);
      blockedById.set(current.stage.id, hasPreviousIncomplete);
    }
    return blockedById;
  }, [trackingStates]);

  const doneIndexes = trackingStates
    .map((entry, index) => (entry.done ? index : -1))
    .filter((index) => index >= 0);
  const latestDoneIndex = doneIndexes.length ? Math.max(...doneIndexes) : -1;
  const nextIndex = Math.min(
    latestDoneIndex + 1,
    Math.max(trackingStates.length - 1, 0),
  );
  const latestDoneDate =
    latestDoneIndex >= 0 ? trackingStates[latestDoneIndex]?.dateValue ?? "" : "";
  const stalledStageId =
    latestDoneIndex >= 0 &&
    latestDoneIndex < trackingStages.length - 1 &&
    daysSince(latestDoneDate) >= STALE_DAYS
      ? trackingStages[latestDoneIndex + 1].id
      : null;
  const activeStage = trackingStages.find((stage) => stage.id === openStageId) ?? null;
  const regionMeta = trackingRegionMeta(region, effectiveRouteId);

  return (
    <form action={updateAction}>
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
        isAdmin={isAdmin}
        disabled={locked}
        disabledMessage={lockedMessage}
        saveLabel="Save tracking"
      >
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Section customs
          </div>
          {customsStates.length ? (
            <div className="space-y-3">
              {customsStates.map((entry) => {
                const stage = entry.stage;
                const stageBlockedByAgent = !!entry.gate && !entry.gate.ready;
                const stageBlockedBySequence = false;
                const stageBlocked = stageBlockedByAgent || stageBlockedBySequence;
                const stageDisabled = disableForm || stageBlocked;
                const doc =
                  stage.fileKey && stage.type === "customs"
                    ? docFor(latestDocsByType, step.id, stage.fileKey)
                    : undefined;

                return (
                  <div
                    key={`customs-${stage.id}`}
                    className="rounded-lg border border-zinc-200 bg-white p-3"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{stage.title}</div>
                        <div className="text-xs text-zinc-500">{stage.location}</div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                          entry.done
                            ? "bg-emerald-100 text-emerald-800"
                            : stageBlocked
                              ? "bg-amber-100 text-amber-800"
                              : "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {entry.done ? "Completed" : stageBlocked ? "Agent required" : "Pending"}
                      </span>
                    </div>

                    {stageBlockedByAgent ? (
                      <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                        {entry.gate?.message}
                      </div>
                    ) : null}
                    {stageBlockedBySequence ? (
                      <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                        Complete previous border checkpoints before this stage.
                      </div>
                    ) : null}

                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <DatePickerInput
                        
                        name={fieldName([stage.dateKey])}
                        value={values[stage.dateKey] ?? ""}
                        onChange={(event) => setValue(stage.dateKey, event.target.value)}
                        disabled={stageDisabled}
                        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                       />
                      <button
                        type="button"
                        onClick={() => setValue(stage.dateKey, todayIso())}
                        disabled={stageDisabled}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                      >
                        Set to now
                      </button>
                    </div>

                    {stage.fileKey ? (
                      <div className="mt-2">
                        <input
                          type="file"
                          name={fieldName([stage.fileKey])}
                          disabled={stageDisabled}
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
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
              No customs actions for this region.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Section tracking
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max items-center gap-2">
              {trackingStates.map((entry, index) => {
                const tone = stageTone({
                  stage: entry,
                  index,
                  nextIndex,
                  stalledStageId,
                });
                const stageBlockedByAgent = !!entry.gate && !entry.gate.ready;
                const stageBlockedBySequence = stageSequenceBlockedById.get(entry.stage.id) ?? false;
                const stageBlocked = stageBlockedByAgent || stageBlockedBySequence;
                const buttonClass =
                  stageBlocked
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : tone === "done"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                      : tone === "active"
                        ? "border-blue-300 bg-blue-50 text-blue-900"
                        : tone === "stalled"
                          ? "border-red-300 bg-red-50 text-red-900"
                          : "border-zinc-200 bg-white text-zinc-700";
                const dotClass =
                  stageBlocked
                    ? "bg-amber-500"
                    : tone === "done"
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
                      disabled={disableForm || stageBlocked}
                      className={`w-40 rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-80 ${buttonClass}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                        <span className="text-xs font-semibold">{entry.stage.shortLabel}</span>
                      </div>
                      <div className="mt-1 text-[11px] opacity-80">{entry.stage.location}</div>
                      <div className="mt-1 text-[11px] font-medium">
                        {entry.done
                          ? "Completed"
                          : stageBlocked
                            ? stageBlockedBySequence
                              ? "Previous checkpoint required"
                              : "Agent required"
                            : "Pending"}
                      </div>
                    </button>
                    {index < trackingStates.length - 1 ? (
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
            {trackingStages.find((stage) => stage.id === stalledStageId)?.shortLabel}.
          </div>
        ) : null}

        {region === "syria" ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            Clearance mode: <span className="font-semibold">{effectiveSyriaMode}</span>
          </div>
        ) : null}

        {trackingStates.map((entry) => {
          const stage = entry.stage;
          const flagChecked = stage.flagKey ? boolValue(values[stage.flagKey]) : false;
          const stageOpen = openStageId === stage.id;
          const stageBlockedByAgent = !!entry.gate && !entry.gate.ready;
          const stageBlockedBySequence = stageSequenceBlockedById.get(stage.id) ?? false;
          const stageBlocked = stageBlockedByAgent || stageBlockedBySequence;
          const stageDisabled = disableForm || stageBlocked;

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
                  {stageBlockedByAgent ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {entry.gate?.message}
                    </div>
                  ) : null}
                  {stageBlockedBySequence ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Complete previous border checkpoints before this stage.
                    </div>
                  ) : null}

                  {stage.type === "checkpoint" && stage.flagKey ? (
                    <label className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
                      <input
                        type="hidden"
                        name={fieldName([stage.flagKey])}
                        value=""
                        disabled={stageDisabled}
                      />
                      <input
                        type="checkbox"
                        name={fieldName([stage.flagKey])}
                        value="1"
                        checked={flagChecked}
                        onChange={(event) =>
                          setBoolWithDate(stage.flagKey!, stage.dateKey, event.target.checked)
                        }
                        disabled={stageDisabled}
                        className="h-4 w-4 rounded border-zinc-300"
                      />
                      <span>Mark as completed</span>
                    </label>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <DatePickerInput
                      
                      name={fieldName([stage.dateKey])}
                      value={values[stage.dateKey] ?? ""}
                      onChange={(event) => setValue(stage.dateKey, event.target.value)}
                      disabled={stageDisabled}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                     />
                    <button
                      type="button"
                      onClick={() => {
                        const now = todayIso();
                        setValue(stage.dateKey, now);
                        if (stage.flagKey) setBoolWithDate(stage.flagKey, stage.dateKey, true);
                      }}
                      disabled={stageDisabled}
                      className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                    >
                      Set to now
                    </button>
                  </div>

                  {stage.includeOffloadLocation ? (
                    <input
                      name={fieldName(["syria_offload_location"])}
                      value={values.syria_offload_location ?? ""}
                      onChange={(event) =>
                        setValue("syria_offload_location", event.target.value)
                      }
                      placeholder="Offload location"
                      disabled={stageDisabled}
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
            {trackingCompletedCount === 0 ? (
              <AppIllustration
                name="empty-no-tracking-events"
                alt="No tracking events yet"
                width={360}
                height={180}
                className="mx-auto mb-2 h-28 w-full max-w-sm"
              />
            ) : null}
            Tracking stages are sequential. Complete earlier checkpoints before later ones.
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
