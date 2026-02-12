"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Badge } from "@/components/ui/Badge";
import { stepStatusLabel, type StepStatus } from "@/lib/domain";

function statusTone(status: StepStatus) {
  if (status === "DONE") return "green";
  if (status === "IN_PROGRESS") return "blue";
  if (status === "BLOCKED") return "red";
  return "zinc";
}

function SaveButton({
  disabled,
  label,
}: {
  disabled: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
    >
      {pending ? "Saving..." : label}
    </button>
  );
}

type Props = {
  title: string;
  description?: string;
  status: StepStatus;
  before?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  disabled?: boolean;
  saveLabel?: string;
  canEdit: boolean;
  disabledMessage?: string;
};

export function SectionFrame({
  title,
  description,
  status,
  before,
  children,
  footer,
  disabled = false,
  saveLabel = "Save",
  canEdit,
  disabledMessage,
}: Props) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Step</div>
          <h3 className="mt-2 text-lg font-semibold text-zinc-900">{title}</h3>
          {description ? <p className="mt-1 text-sm text-zinc-600">{description}</p> : null}
        </div>
        <Badge tone={statusTone(status)}>{stepStatusLabel(status)}</Badge>
      </div>
      {before ? <div className="mt-4">{before}</div> : null}
      {disabledMessage ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {disabledMessage}
        </div>
      ) : null}
      <div className="mt-4 space-y-4">{children}</div>
      <div className="mt-4 flex items-center justify-between gap-3">
        {footer ?? <span className="text-xs text-zinc-500" />}
        <SaveButton disabled={!canEdit || disabled} label={saveLabel} />
      </div>
    </div>
  );
}

