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

type ActiveNode = BorderFieldKey | "naseeb" | null;

type BorderNode = {
  id: string;
  label: string;
  country: string;
  kind: "static" | "agent" | "naseeb";
  fieldKey?: BorderFieldKey;
  staticValue?: string;
};

const BASE_CHAIN: BorderNode[] = [
  {
    id: "warehouse",
    label: "Dubai Warehouse",
    country: "AE",
    kind: "static",
    staticValue: "Origin",
  },
  {
    id: "jebel_ali",
    label: "Jebel Ali FZ",
    country: "AE",
    kind: "agent",
    fieldKey: "jebel_ali_agent_name",
  },
  {
    id: "sila",
    label: "Sila Border",
    country: "AE",
    kind: "agent",
    fieldKey: "sila_agent_name",
  },
  {
    id: "batha",
    label: "Batha Border",
    country: "SA",
    kind: "agent",
    fieldKey: "batha_agent_name",
  },
  {
    id: "omari",
    label: "Omari Border",
    country: "JO",
    kind: "agent",
    fieldKey: "omari_agent_name",
  },
  {
    id: "naseeb",
    label: "Naseeb Border",
    country: "SY",
    kind: "naseeb",
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
  const [activeNode, setActiveNode] = useState<ActiveNode>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const activeInputRef = useRef<HTMLInputElement | null>(null);
  const activeSelectRef = useRef<HTMLSelectElement | null>(null);
  const chain = useMemo<BorderNode[]>(() => BASE_CHAIN, []);

  useEffect(() => {
    if (!activeNode) return;
    const focusTarget = activeInputRef.current ?? activeSelectRef.current;
    focusTarget?.focus();

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      setActiveNode(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [activeNode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveNode(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const setBorderAgent = (key: BorderFieldKey, value: string) => {
    setAgents((prev) => ({ ...prev, [key]: value }));
  };

  const setNaseebAgent = (value: string) => {
    setAgents((prev) => ({ ...prev, naseeb_agent_name: value }));
  };

  const isNaseebComplete =
    naseebMode === "ZAXON"
      ? !!agents.naseeb_agent_name.trim() &&
        !!syriaConsignee.trim() &&
        !!showConsignee.trim()
      : naseebMode === "CLIENT"
        ? !!clientFinalChoice.trim()
        : false;

  const naseebSummary =
    naseebMode === "ZAXON"
      ? `Zaxon${agents.naseeb_agent_name.trim() ? ` | ${agents.naseeb_agent_name}` : " | Agent required"}`
      : naseebMode === "CLIENT"
        ? `Client${clientFinalChoice.trim() ? ` | ${clientFinalChoice}` : " | Final choice required"}`
        : "Click to configure";

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input
        name={fieldName(["jebel_ali_agent_name"])}
        value={agents.jebel_ali_agent_name}
        readOnly
        hidden
      />
      <input
        name={fieldName(["sila_agent_name"])}
        value={agents.sila_agent_name}
        readOnly
        hidden
      />
      <input
        name={fieldName(["batha_agent_name"])}
        value={agents.batha_agent_name}
        readOnly
        hidden
      />
      <input
        name={fieldName(["omari_agent_name"])}
        value={agents.omari_agent_name}
        readOnly
        hidden
      />
      <input
        name={fieldName(["naseeb_agent_name"])}
        value={agents.naseeb_agent_name}
        readOnly
        hidden
      />
      <input
        name={fieldName(["naseeb_clearance_mode"])}
        value={naseebMode}
        readOnly
        hidden
      />
      <input
        name={fieldName(["syria_consignee_name"])}
        value={syriaConsignee}
        readOnly
        hidden
      />
      <input
        name={fieldName(["show_syria_consignee_to_client"])}
        value={showConsignee}
        readOnly
        hidden
      />
      <input
        name={fieldName(["naseeb_client_final_choice"])}
        value={clientFinalChoice}
        readOnly
        hidden
      />

      <SectionFrame
        title="Customs Agents Allocation"
        description="Assign clearing agents by clicking each border checkpoint on the journey map."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        saveLabel="Save customs allocation"
        lockOnDone={false}
      >
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Border chain
          </div>
          <div className="overflow-x-auto">
            <div className="flex min-w-max items-end gap-2 px-1 pt-24 pb-1">
              {chain.map((node, index) => {
                const isEditable = node.kind !== "static";
                const agentName =
                  node.kind === "agent" && node.fieldKey
                    ? agents[node.fieldKey]
                    : node.kind === "naseeb"
                      ? naseebSummary
                      : node.staticValue || "";
                const complete =
                  node.kind === "naseeb" ? isNaseebComplete : !!agentName.trim();
                const isAgentActive =
                  node.kind === "agent" &&
                  !!node.fieldKey &&
                  activeNode === node.fieldKey;

                return (
                  <div key={node.id} className="relative flex items-center gap-2">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          if (node.kind === "agent" && node.fieldKey) {
                            setActiveNode(node.fieldKey);
                            return;
                          }
                          if (node.kind === "naseeb") {
                            setActiveNode("naseeb");
                          }
                        }}
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

                      {isAgentActive && node.fieldKey ? (
                        <div
                          ref={panelRef}
                          className="absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl"
                        >
                          <div className="mb-2 text-xs font-medium text-zinc-600">
                            {node.label} agent
                          </div>
                          <input
                            ref={activeInputRef}
                            type="text"
                            value={agents[node.fieldKey]}
                            onChange={(event) =>
                              setBorderAgent(node.fieldKey!, event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                setActiveNode(null);
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

        {activeNode === "naseeb" ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Close Naseeb modal"
              onClick={() => setActiveNode(null)}
              className="absolute inset-0 bg-black/40"
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              className="relative z-10 w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                    Naseeb Border
                  </div>
                  <h4 className="mt-1 text-sm font-semibold text-zinc-900">
                    Border details
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNode(null)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <div className="mb-1 text-[11px] font-medium text-zinc-500">
                    Clearance mode *
                  </div>
                  <select
                    ref={activeSelectRef}
                    value={naseebMode}
                    onChange={(event) => setNaseebMode(event.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                    disabled={!canEdit}
                  >
                    <option value="">Select mode</option>
                    <option value="ZAXON">Zaxon</option>
                    <option value="CLIENT">Client</option>
                  </select>
                </label>

                {naseebMode === "ZAXON" ? (
                  <>
                    <label className="block">
                      <div className="mb-1 text-[11px] font-medium text-zinc-500">
                        Clearing agent name *
                      </div>
                      <input
                        ref={activeInputRef}
                        type="text"
                        value={agents.naseeb_agent_name}
                        onChange={(event) => setNaseebAgent(event.target.value)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                        placeholder="Type agent name"
                        disabled={!canEdit}
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-[11px] font-medium text-zinc-500">
                        Syria consignee name *
                      </div>
                      <input
                        type="text"
                        value={syriaConsignee}
                        onChange={(event) => setSyriaConsignee(event.target.value)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                        placeholder="Type consignee name"
                        disabled={!canEdit}
                      />
                    </label>
                    <label className="block">
                      <div className="mb-1 text-[11px] font-medium text-zinc-500">
                        Show consignee to client? *
                      </div>
                      <select
                        value={showConsignee}
                        onChange={(event) => setShowConsignee(event.target.value)}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                        disabled={!canEdit}
                      >
                        <option value="">Select option</option>
                        <option value="YES">Yes</option>
                        <option value="NO">No</option>
                      </select>
                    </label>
                  </>
                ) : null}

                {naseebMode === "CLIENT" ? (
                  <label className="block">
                    <div className="mb-1 text-[11px] font-medium text-zinc-500">
                      Client final choice *
                    </div>
                    <input
                      ref={activeInputRef}
                      type="text"
                      value={clientFinalChoice}
                      onChange={(event) => setClientFinalChoice(event.target.value)}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                      placeholder="Type final choice"
                      disabled={!canEdit}
                    />
                  </label>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

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
