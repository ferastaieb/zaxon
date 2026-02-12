"use client";

import { type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Badge } from "@/components/ui/Badge";
import { stepStatusLabel } from "@/lib/domain";
import { StepFieldRenderer } from "./StepFieldRenderer";
import type { FtlDocumentMeta, FtlStepData } from "./types";

type Props = {
  step: FtlStepData;
  title?: string;
  description?: string;
  canEdit: boolean;
  latestDocsByType: Record<string, FtlDocumentMeta>;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  saveLabel?: string;
  disabled?: boolean;
  disabledMessage?: string;
  beforeForm?: ReactNode;
  afterForm?: ReactNode;
};

function statusTone(status: FtlStepData["status"]) {
  if (status === "DONE") return "green";
  if (status === "IN_PROGRESS") return "blue";
  if (status === "BLOCKED") return "red";
  return "zinc";
}

function SaveButton({
  disabled,
  saveLabel,
}: {
  disabled: boolean;
  saveLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
    >
      {pending ? "Saving..." : saveLabel}
    </button>
  );
}

export function StepEditorCard({
  step,
  title,
  description,
  canEdit,
  latestDocsByType,
  updateAction,
  returnTo,
  saveLabel = "Save step",
  disabled = false,
  disabledMessage,
  beforeForm,
  afterForm,
}: Props) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Step</div>
          <h3 className="mt-2 text-lg font-semibold text-zinc-900">
            {title ?? step.name}
          </h3>
          {description ? <p className="mt-1 text-sm text-zinc-600">{description}</p> : null}
        </div>
        <Badge tone={statusTone(step.status)}>{stepStatusLabel(step.status)}</Badge>
      </div>

      {beforeForm ? <div className="mt-4">{beforeForm}</div> : null}
      {disabledMessage ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {disabledMessage}
        </div>
      ) : null}

      <form action={updateAction} className="mt-4 space-y-4">
        <input type="hidden" name="stepId" value={step.id} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <StepFieldRenderer
          stepId={step.id}
          schema={step.schema}
          values={step.values}
          canEdit={canEdit && !disabled}
          latestDocsByType={latestDocsByType}
        />
        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Notes</div>
          <textarea
            name="notes"
            defaultValue={step.notes ?? ""}
            disabled={!canEdit || disabled}
            className="min-h-24 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500">
            Updates save this step and refresh workflow status automatically.
          </span>
          <SaveButton disabled={!canEdit || disabled} saveLabel={saveLabel} />
        </div>
      </form>

      {afterForm ? <div className="mt-4">{afterForm}</div> : null}
    </div>
  );
}

