"use client";

import { useState } from "react";

import { encodeFieldPath, stepFieldDocType } from "@/lib/stepFields";
import type { FtlDocumentMeta, FtlStepData } from "../types";
import { boolValue, fieldName, stringValue } from "../fieldNames";
import { SectionFrame } from "./SectionFrame";

type TrackingRegion = "uae" | "ksa" | "jordan" | "syria";

type Props = {
  step: FtlStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  latestDocsByType: Record<string, FtlDocumentMeta>;
  region: TrackingRegion;
  locked: boolean;
  lockedMessage?: string;
  syriaClearanceMode?: "ZAXON" | "CLIENT";
};

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

  const renderBoolDate = (flagKey: string, dateKey: string, label: string) => (
    <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
      <label className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm">
        <input type="hidden" name={fieldName([flagKey])} value="" />
        <input
          type="checkbox"
          name={fieldName([flagKey])}
          value="1"
          checked={boolValue(values[flagKey])}
          onChange={(event) => setBoolWithDate(flagKey, dateKey, event.target.checked)}
          disabled={disableForm}
          className="h-4 w-4 rounded border-zinc-300"
        />
        <span>{label}</span>
      </label>
      <input
        type="date"
        name={fieldName([dateKey])}
        value={values[dateKey] ?? ""}
        onChange={(event) => setValue(dateKey, event.target.value)}
        disabled={disableForm}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
      />
    </div>
  );

  const renderDeclaration = (
    latestDocsByType: Record<string, FtlDocumentMeta>,
    dateKey: string,
    fileKey: string,
    title: string,
  ) => {
    const doc = docFor(latestDocsByType, step.id, fileKey);
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {title}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="date"
            name={fieldName([dateKey])}
            value={values[dateKey] ?? ""}
            onChange={(event) => setValue(dateKey, event.target.value)}
            disabled={disableForm}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
          <div>
            <input
              type="file"
              name={fieldName([fileKey])}
              disabled={disableForm}
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
        </div>
      </div>
    );
  };

  const regionTitle =
    region === "uae"
      ? "UAE Tracking"
      : region === "ksa"
        ? "KSA Tracking"
        : region === "jordan"
          ? "Jordan Tracking"
          : "Syria Tracking";

  const regionDescription =
    region === "uae"
      ? "Jebel Ali + Sila checkpoints."
      : region === "ksa"
        ? "Batha entry + Hadietha exit."
        : region === "jordan"
          ? "Omari entry + Jaber exit."
          : "Naseeb/Syria clearance and delivery.";

  const effectiveSyriaMode =
    region === "syria"
      ? (stringValue(values.syria_clearance_mode).toUpperCase() as "ZAXON" | "CLIENT") ||
        syriaClearanceMode ||
        "CLIENT"
      : undefined;

  return (
    <form action={updateAction} encType="multipart/form-data">
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title={regionTitle}
        description={regionDescription}
        status={step.status}
        canEdit={canEdit}
        disabled={locked}
        disabledMessage={lockedMessage}
        saveLabel="Save tracking"
      >
        {region === "uae" ? (
          <div className="space-y-3">
            {renderDeclaration(
              latestDocsByType,
              "jebel_ali_declaration_date",
              "jebel_ali_declaration_upload",
              "Jebel Ali customs",
            )}
            {renderBoolDate("jebel_ali_trucks_sealed", "jebel_ali_sealed_date", "Trucks sealed")}
            {renderBoolDate("jebel_ali_exit", "jebel_ali_exit_date", "Exit Jebel Ali")}
            {renderDeclaration(
              latestDocsByType,
              "sila_declaration_date",
              "sila_declaration_upload",
              "Sila customs",
            )}
            {renderBoolDate("sila_arrived", "sila_arrived_date", "Arrived at Sila")}
            {renderBoolDate("sila_exit", "sila_exit_date", "Exit Sila")}
          </div>
        ) : null}

        {region === "ksa" ? (
          <div className="space-y-3">
            {renderDeclaration(
              latestDocsByType,
              "batha_declaration_date",
              "batha_declaration_upload",
              "Batha customs",
            )}
            {renderBoolDate("batha_arrived", "batha_arrived_date", "Arrived at Batha")}
            {renderBoolDate("batha_exit", "batha_exit_date", "Exit Batha")}
            {renderBoolDate("hadietha_exit", "hadietha_exit_date", "Exit Hadietha")}
          </div>
        ) : null}

        {region === "jordan" ? (
          <div className="space-y-3">
            {renderDeclaration(
              latestDocsByType,
              "omari_declaration_date",
              "omari_declaration_upload",
              "Omari customs",
            )}
            {renderBoolDate("omari_arrived", "omari_arrived_date", "Arrived at Omari")}
            {renderBoolDate("omari_exit", "omari_exit_date", "Exit Omari")}
            {renderBoolDate("jaber_exit", "jaber_exit_date", "Exit Jaber")}
          </div>
        ) : null}

        {region === "syria" ? (
          <div className="space-y-3">
            <input
              type="hidden"
              name={fieldName(["syria_clearance_mode"])}
              value={effectiveSyriaMode || ""}
            />
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              Clearance mode: <span className="font-semibold">{effectiveSyriaMode || "CLIENT"}</span>
            </div>
            {effectiveSyriaMode === "ZAXON"
              ? renderDeclaration(
                  latestDocsByType,
                  "syria_declaration_date",
                  "syria_declaration_upload",
                  "Syria customs",
                )
              : null}
            {renderBoolDate("syria_arrived", "syria_arrived_date", "Arrived")}
            {renderBoolDate("syria_exit", "syria_exit_date", "Exit")}
            {renderBoolDate("syria_delivered", "syria_delivered_date", "Delivered")}
            <input
              name={fieldName(["syria_offload_location"])}
              value={values.syria_offload_location ?? ""}
              onChange={(event) => setValue("syria_offload_location", event.target.value)}
              placeholder="Offload location"
              disabled={disableForm}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </div>
        ) : null}

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
