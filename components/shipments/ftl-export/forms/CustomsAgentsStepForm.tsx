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
  brokers: Array<{ id: number; name: string }>;
  naseebModeLock?: "ZAXON" | "CLIENT";
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

type BrokerOption = {
  id: number;
  name: string;
};

function normalizeBrokerOptions(input: BrokerOption[]) {
  const byName = new Map<string, BrokerOption>();
  for (const broker of input) {
    const name = broker.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (byName.has(key)) continue;
    byName.set(key, {
      id: broker.id,
      name,
    });
  }
  return Array.from(byName.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function brokerOptionsWithCurrent(
  options: BrokerOption[],
  currentValue: string,
): BrokerOption[] {
  const trimmed = currentValue.trim();
  if (!trimmed) return options;
  const exists = options.some(
    (option) => option.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (exists) return options;
  return [{ id: -1, name: trimmed }, ...options];
}

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
  brokers,
  naseebModeLock,
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
  const [brokerOptions, setBrokerOptions] = useState<BrokerOption[]>(() =>
    normalizeBrokerOptions(brokers),
  );
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [brokerTargetKey, setBrokerTargetKey] = useState<BorderFieldKey | null>(
    null,
  );
  const [brokerForm, setBrokerForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });
  const [brokerError, setBrokerError] = useState<string | null>(null);
  const [brokerSubmitting, setBrokerSubmitting] = useState(false);
  const [notes, setNotes] = useState(step.notes ?? "");
  const [activeNode, setActiveNode] = useState<ActiveNode>(null);
  const effectiveNaseebMode = naseebModeLock ?? naseebMode;

  const panelRef = useRef<HTMLDivElement | null>(null);
  const activeInputRef = useRef<HTMLInputElement | null>(null);
  const activeSelectRef = useRef<HTMLSelectElement | null>(null);
  const chain = useMemo<BorderNode[]>(() => BASE_CHAIN, []);

  useEffect(() => {
    if (!activeNode) return;
    if (showBrokerModal) return;
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
  }, [activeNode, showBrokerModal]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showBrokerModal) {
          if (!brokerSubmitting) {
            setShowBrokerModal(false);
          }
          return;
        }
        setActiveNode(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showBrokerModal, brokerSubmitting]);

  const setBorderAgent = (key: BorderFieldKey, value: string) => {
    setAgents((prev) => ({ ...prev, [key]: value }));
  };

  const openBrokerModal = (targetKey: BorderFieldKey) => {
    if (!canEdit) return;
    setBrokerTargetKey(targetKey);
    setBrokerError(null);
    setBrokerForm({
      name: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
    });
    setShowBrokerModal(true);
  };

  const closeBrokerModal = () => {
    if (brokerSubmitting) return;
    setShowBrokerModal(false);
    setBrokerError(null);
  };

  const updateBrokerForm = (
    key: keyof typeof brokerForm,
    value: string,
  ) => {
    setBrokerForm((prev) => ({ ...prev, [key]: value }));
  };

  const createBroker = async () => {
    if (!canEdit || brokerSubmitting) return;
    const name = brokerForm.name.trim();
    if (!name) {
      setBrokerError("Broker name is required.");
      return;
    }

    setBrokerSubmitting(true);
    setBrokerError(null);

    try {
      const response = await fetch("/api/parties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "CUSTOMS_BROKER",
          name,
          phone: brokerForm.phone.trim() || null,
          email: brokerForm.email.trim() || null,
          address: brokerForm.address.trim() || null,
          notes: brokerForm.notes.trim() || null,
        }),
      });

      if (!response.ok) {
        if (response.status === 401) {
          setBrokerError("Session expired. Please sign in again.");
        } else if (response.status === 403) {
          setBrokerError("You do not have permission to create brokers.");
        } else {
          setBrokerError("Unable to create broker.");
        }
        return;
      }

      const payload = (await response.json()) as {
        party?: { id: number; name: string };
      };
      const created = payload.party;
      if (!created || !created.name.trim()) {
        setBrokerError("Unable to create broker.");
        return;
      }

      setBrokerOptions((prev) =>
        normalizeBrokerOptions([
          ...prev,
          {
            id: created.id,
            name: created.name,
          },
        ]),
      );

      if (brokerTargetKey) {
        setBorderAgent(brokerTargetKey, created.name.trim());
      }

      setShowBrokerModal(false);
      setBrokerError(null);
    } catch {
      setBrokerError("Unable to create broker.");
    } finally {
      setBrokerSubmitting(false);
    }
  };

  const isNaseebComplete =
    effectiveNaseebMode === "ZAXON"
      ? !!agents.naseeb_agent_name.trim() &&
        !!syriaConsignee.trim() &&
        !!showConsignee.trim()
      : effectiveNaseebMode === "CLIENT"
        ? !!clientFinalChoice.trim()
        : false;

  const naseebSummary =
    effectiveNaseebMode === "ZAXON"
      ? `Zaxon${agents.naseeb_agent_name.trim() ? ` | ${agents.naseeb_agent_name}` : " | Agent required"}`
      : effectiveNaseebMode === "CLIENT"
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
        value={effectiveNaseebMode}
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
        value={effectiveNaseebMode === "CLIENT" ? clientFinalChoice : ""}
        readOnly
        hidden
      />

      <SectionFrame
        title="Customs Agents Allocation"
        description="Assign clearing agents from customs brokers by clicking each border checkpoint on the journey map."
        status={step.status}
        canEdit={canEdit}
        isAdmin={isAdmin}
        saveLabel="Save customs allocation"
        lockOnDone={false}
      >
        <div className="max-w-full rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Border chain
          </div>
          <div className="w-full overflow-x-auto overflow-y-visible pb-1">
            <div className="inline-flex w-max min-w-full flex-nowrap items-end gap-1 px-1 pr-2 pt-24">
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
                  <div key={node.id} className="relative flex shrink-0 items-center gap-1">
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
                        className={`w-32 shrink-0 rounded-lg border px-3 py-2 text-left transition ${
                          complete
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-zinc-300 bg-white text-zinc-700"
                        } ${!isEditable ? "cursor-default" : ""} disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500`}
                      >
                        <div className="whitespace-nowrap text-[11px] uppercase tracking-[0.14em] opacity-80">
                          {node.country}
                        </div>
                        <div className="mt-1 whitespace-nowrap text-xs font-semibold">
                          {node.label}
                        </div>
                        <div className="mt-1 min-h-4 truncate whitespace-nowrap text-[11px]">
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
                          <select
                            ref={activeSelectRef}
                            value={agents[node.fieldKey]}
                            onChange={(event) =>
                              setBorderAgent(node.fieldKey!, event.target.value)
                            }
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                            disabled={!canEdit}
                          >
                            <option value="">Select broker</option>
                            {brokerOptionsWithCurrent(
                              brokerOptions,
                              agents[node.fieldKey],
                            ).map((broker) => (
                              <option
                                key={`${node.fieldKey}-${broker.id}-${broker.name}`}
                                value={broker.name}
                              >
                                {broker.name}
                              </option>
                            ))}
                          </select>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => openBrokerModal(node.fieldKey!)}
                              disabled={!canEdit}
                              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                            >
                              New broker
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveNode(null)}
                              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    {index < chain.length - 1 ? (
                      <div className="h-[3px] w-5 rounded-full bg-zinc-300" />
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
                  Save
                </button>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <div className="mb-1 text-[11px] font-medium text-zinc-500">
                    Clearance mode *
                  </div>
                  <select
                    ref={activeSelectRef}
                    value={effectiveNaseebMode}
                    onChange={(event) => setNaseebMode(event.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                    disabled={!canEdit || !!naseebModeLock}
                  >
                    {naseebModeLock ? (
                      <option value={naseebModeLock}>
                        {naseebModeLock === "ZAXON" ? "Zaxon" : "Client"}
                      </option>
                    ) : (
                      <>
                        <option value="">Select mode</option>
                        <option value="ZAXON">Zaxon</option>
                        <option value="CLIENT">Client</option>
                      </>
                    )}
                  </select>
                </label>

                {effectiveNaseebMode === "ZAXON" ? (
                  <>
                    <label className="block">
                      <div className="mb-1 text-[11px] font-medium text-zinc-500">
                        Clearing agent name *
                      </div>
                      <select
                        ref={activeSelectRef}
                        value={agents.naseeb_agent_name}
                        onChange={(event) =>
                          setBorderAgent("naseeb_agent_name", event.target.value)
                        }
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                        disabled={!canEdit}
                      >
                        <option value="">Select broker</option>
                        {brokerOptionsWithCurrent(
                          brokerOptions,
                          agents.naseeb_agent_name,
                        ).map((broker) => (
                          <option
                            key={`naseeb-${broker.id}-${broker.name}`}
                            value={broker.name}
                          >
                            {broker.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => openBrokerModal("naseeb_agent_name")}
                        disabled={!canEdit}
                        className="mt-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                      >
                        New broker
                      </button>
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

                {effectiveNaseebMode === "CLIENT" ? (
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

      {showBrokerModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close broker modal"
            onClick={closeBrokerModal}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                  Customs broker
                </div>
                <h4 className="mt-1 text-sm font-semibold text-zinc-900">
                  Quick add
                </h4>
              </div>
              <button
                type="button"
                onClick={closeBrokerModal}
                disabled={brokerSubmitting}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <div className="mb-1 text-[11px] font-medium text-zinc-500">
                  Broker name *
                </div>
                <input
                  value={brokerForm.name}
                  onChange={(event) => updateBrokerForm("name", event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  disabled={brokerSubmitting}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <div className="mb-1 text-[11px] font-medium text-zinc-500">
                    Phone
                  </div>
                  <input
                    value={brokerForm.phone}
                    onChange={(event) => updateBrokerForm("phone", event.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                    disabled={brokerSubmitting}
                  />
                </label>
                <label className="block">
                  <div className="mb-1 text-[11px] font-medium text-zinc-500">
                    Email
                  </div>
                  <input
                    value={brokerForm.email}
                    onChange={(event) => updateBrokerForm("email", event.target.value)}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                    disabled={brokerSubmitting}
                  />
                </label>
              </div>

              <label className="block">
                <div className="mb-1 text-[11px] font-medium text-zinc-500">
                  Address
                </div>
                <input
                  value={brokerForm.address}
                  onChange={(event) => updateBrokerForm("address", event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  disabled={brokerSubmitting}
                />
              </label>

              <label className="block">
                <div className="mb-1 text-[11px] font-medium text-zinc-500">
                  Notes
                </div>
                <textarea
                  value={brokerForm.notes}
                  onChange={(event) => updateBrokerForm("notes", event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                  disabled={brokerSubmitting}
                />
              </label>

              {brokerError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {brokerError}
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={createBroker}
                  disabled={brokerSubmitting}
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
                >
                  {brokerSubmitting ? "Creating..." : "Create broker"}
                </button>
                <button
                  type="button"
                  onClick={closeBrokerModal}
                  disabled={brokerSubmitting}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
