"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { FtlStepData } from "../types";
import { fieldName, stringValue } from "../fieldNames";
import { SectionFrame } from "./SectionFrame";

type Props = {
  step: FtlStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
  isAdmin: boolean;
};

type BorderFieldKey =
  | "jebel_ali_agent_name"
  | "sila_agent_name"
  | "batha_agent_name"
  | "omari_agent_name"
  | "naseeb_agent_name";

type BorderNode = {
  id: string;
  label: string;
  country: string;
  fieldKey?: BorderFieldKey;
  staticValue?: string;
};

const BASE_CHAIN: BorderNode[] = [
  {
    id: "warehouse",
    label: "Dubai Warehouse",
    country: "AE",
    staticValue: "Origin",
  },
  {
    id: "jebel_ali",
    label: "Jebel Ali FZ",
    country: "AE",
    fieldKey: "jebel_ali_agent_name",
  },
  {
    id: "sila",
    label: "Sila Border",
    country: "AE",
    fieldKey: "sila_agent_name",
  },
  {
    id: "batha",
    label: "Batha Border",
    country: "SA",
    fieldKey: "batha_agent_name",
  },
  {
    id: "omari",
    label: "Omari Border",
    country: "JO",
    fieldKey: "omari_agent_name",
  },
];

export function CustomsAgentsStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  isAdmin,
}: Props) {
  const [agents, setAgents] = useState<Record<BorderFieldKey, string>>({
    jebel_ali_agent_name: stringValue(step.values.jebel_ali_agent_name),
    sila_agent_name: stringValue(step.values.sila_agent_name),
    batha_agent_name: stringValue(step.values.batha_agent_name),
    omari_agent_name: stringValue(step.values.omari_agent_name),
    naseeb_agent_name: stringValue(step.values.naseeb_agent_name),
  });
  const [naseebMode, setNaseebMode] = useState(
    stringValue(step.values.naseeb_clearance_mode).toUpperCase(),
  );
  const [syriaConsignee, setSyriaConsignee] = useState(
    stringValue(step.values.syria_consignee_name),
  );
  const [showConsignee, setShowConsignee] = useState(
    stringValue(step.values.show_syria_consignee_to_client).toUpperCase(),
  );
  const [clientFinalChoice, setClientFinalChoice] = useState(
    stringValue(step.values.naseeb_client_final_choice),
  );
  const [notes, setNotes] = useState(step.notes ?? "");
  const [activeBorder, setActiveBorder] = useState<BorderFieldKey | null>(null);

  const popoverRef = useRef<HTMLDivElement | null>(null);
  const activeInputRef = useRef<HTMLInputElement | null>(null);

  const chain = useMemo<BorderNode[]>(() => {
    const naseebNode: BorderNode =
      naseebMode === "ZAXON"
        ? {
            id: "naseeb",
            label: "Naseeb Border",
            country: "SY",
            fieldKey: "naseeb_agent_name",
          }
        : {
            id: "naseeb",
            label: "Naseeb Border",
            country: "SY",
            staticValue: "Client clearance",
          };
    return [...BASE_CHAIN, naseebNode];
  }, [naseebMode]);

  useEffect(() => {
    if (!activeBorder) return;
    activeInputRef.current?.focus();
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target)) return;
      setActiveBorder(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [activeBorder]);

  const missingMandatory =
    !agents.jebel_ali_agent_name.trim() ||
    !agents.sila_agent_name.trim() ||
    !agents.batha_agent_name.trim() ||
    !agents.omari_agent_name.trim() ||
    (naseebMode === "ZAXON" && !agents.naseeb_agent_name.trim());

  const setAgent = (key: BorderFieldKey, value: string) => {
    setAgents((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input name={fieldName(["jebel_ali_agent_name"])} value={agents.jebel_ali_agent_name} readOnly hidden />
      <input name={fieldName(["sila_agent_name"])} value={agents.sila_agent_name} readOnly hidden />
      <input name={fieldName(["batha_agent_name"])} value={agents.batha_agent_name} readOnly hidden />
      <input name={fieldName(["omari_agent_name"])} value={agents.omari_agent_name} readOnly hidden />
      <input name={fieldName(["naseeb_agent_name"])} value={agents.naseeb_agent_name} readOnly hidden />

      <SectionFrame
        title="Customs Agents Allocation"
        description="Assign clearing agents by clicking each border checkpoint on the journey map."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        saveLabel="Save customs allocation"
      >
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Border chain
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max items-center gap-2">
              {chain.map((node, index) => {
                const isEditable = !!node.fieldKey;
                const agentName = node.fieldKey ? agents[node.fieldKey] : node.staticValue || "";
                const complete = !!agentName.trim();
                const isActive = node.fieldKey && activeBorder === node.fieldKey;

                return (
                  <div key={node.id} className="relative flex items-center gap-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => node.fieldKey && setActiveBorder(node.fieldKey)}
                        disabled={!canEdit || !isEditable}
                        className={`w-36 rounded-lg border px-3 py-2 text-left transition ${
                          complete
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-zinc-300 bg-white text-zinc-700"
                        } ${!isEditable ? "cursor-default" : ""} disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500`}
                      >
                        <div className="text-[11px] uppercase tracking-[0.14em] opacity-80">
                          {node.country}
                        </div>
                        <div className="mt-1 text-xs font-semibold">{node.label}</div>
                        <div className="mt-1 text-[11px] min-h-4">
                          {agentName || (isEditable ? "Click to assign agent" : " ")}
                        </div>
                      </button>

                      {isActive && node.fieldKey ? (
                        <div
                          ref={popoverRef}
                          className="absolute -top-28 left-1/2 z-20 w-56 -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl"
                        >
                          <div className="mb-2 text-xs font-medium text-zinc-600">
                            {node.label} agent
                          </div>
                          <input
                            ref={activeInputRef}
                            type="text"
                            value={agents[node.fieldKey]}
                            onChange={(event) => setAgent(node.fieldKey!, event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                setActiveBorder(null);
                              }
                            }}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                            placeholder="Type agent name"
                            disabled={!canEdit}
                          />
                        </div>
                      ) : null}
                    </div>
                    {index < chain.length - 1 ? (
                      <div className="h-[3px] w-7 rounded-full bg-zinc-300" />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {missingMandatory ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Complete all mandatory border agents before saving.
          </div>
        ) : null}

        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Naseeb border
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              name={fieldName(["naseeb_clearance_mode"])}
              value={naseebMode}
              onChange={(event) => setNaseebMode(event.target.value)}
              required
              disabled={!canEdit}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            >
              <option value="">Select clearance mode *</option>
              <option value="ZAXON">Zaxon</option>
              <option value="CLIENT">Client</option>
            </select>
          </div>

          {naseebMode === "ZAXON" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                name={fieldName(["syria_consignee_name"])}
                value={syriaConsignee}
                onChange={(event) => setSyriaConsignee(event.target.value)}
                placeholder="Syria consignee name *"
                required
                disabled={!canEdit}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
              />
              <select
                name={fieldName(["show_syria_consignee_to_client"])}
                value={showConsignee}
                onChange={(event) => setShowConsignee(event.target.value)}
                required
                disabled={!canEdit}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
              >
                <option value="">Show consignee to client? *</option>
                <option value="YES">Yes</option>
                <option value="NO">No</option>
              </select>
            </div>
          ) : null}

          {naseebMode === "CLIENT" ? (
            <div className="mt-3">
              <input
                name={fieldName(["naseeb_client_final_choice"])}
                value={clientFinalChoice}
                onChange={(event) => setClientFinalChoice(event.target.value)}
                placeholder="Client final choice *"
                required
                disabled={!canEdit}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
              />
            </div>
          ) : null}
        </div>

        <label className="block">
          <div className="mb-1 text-xs font-medium text-zinc-600">Notes</div>
          <textarea
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={!canEdit}
            className="min-h-20 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
        </label>
      </SectionFrame>
    </form>
  );
}
