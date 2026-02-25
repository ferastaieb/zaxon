"use client";

import { useMemo, useState } from "react";

import {
  jafzaRouteById,
  type JafzaCustomsBorderNode,
  type JafzaLandRouteId,
} from "@/lib/routes/jafzaLandRoutes";
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
  consigneeParties: Array<{ id: number; name: string }>;
  routeId?: JafzaLandRouteId;
  naseebModeLock?: "ZAXON" | "CLIENT";
};

type BrokerOption = { id: number; name: string };
type ConsigneeOption = { id: number; name: string };

type AddPartyState = {
  open: boolean;
  type: "CUSTOMS_BROKER" | "CUSTOMER";
  targetField?: string;
  targetPartyIdField?: string;
  targetNameField?: string;
};

const ALL_FIELDS = [
  "jebel_ali_agent_name",
  "sila_agent_name",
  "batha_agent_name",
  "omari_agent_name",
  "naseeb_agent_name",
  "naseeb_clearance_mode",
  "syria_consignee_party_id",
  "syria_consignee_name",
  "show_syria_consignee_to_client",
  "naseeb_client_final_choice",
  "batha_clearance_mode",
  "batha_consignee_party_id",
  "batha_consignee_name",
  "show_batha_consignee_to_client",
  "batha_client_final_choice",
  "mushtarakah_agent_name",
  "mushtarakah_consignee_party_id",
  "mushtarakah_consignee_name",
  "masnaa_clearance_mode",
  "masnaa_agent_name",
  "masnaa_consignee_party_id",
  "masnaa_consignee_name",
  "show_masnaa_consignee_to_client",
  "masnaa_client_final_choice",
] as const;

function dedupeByName<T extends { id: number; name: string }>(items: T[]) {
  const byName = new Map<string, T>();
  for (const item of items) {
    const name = item.name.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (byName.has(key)) continue;
    byName.set(key, { ...item, name } as T);
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function withCurrent(options: BrokerOption[], currentValue: string): BrokerOption[] {
  const trimmed = currentValue.trim();
  if (!trimmed) return options;
  const exists = options.some((option) => option.name.toLowerCase() === trimmed.toLowerCase());
  if (exists) return options;
  return [{ id: -1, name: trimmed }, ...options];
}

function nodeMode(values: Record<string, string>, node: JafzaCustomsBorderNode) {
  if (!node.clearanceModeField) return "";
  return (values[node.clearanceModeField] ?? "").toUpperCase();
}

function nodeSummary(values: Record<string, string>, node: JafzaCustomsBorderNode) {
  if (node.kind === "agent") {
    const agent = node.agentField ? values[node.agentField] ?? "" : "";
    const consignee = node.consigneeNameField ? values[node.consigneeNameField] ?? "" : "";
    if (agent && consignee) return `${agent} | ${consignee}`;
    if (agent) return agent;
    if (consignee) return consignee;
    return "Click to configure";
  }
  const mode = nodeMode(values, node);
  if (!mode) return "Click to configure";
  if (mode === "CLIENT") {
    const finalChoice = node.clientFinalChoiceField ? values[node.clientFinalChoiceField] ?? "" : "";
    return `Client${finalChoice ? ` | ${finalChoice}` : " | Final choice required"}`;
  }
  const agent = node.agentField ? values[node.agentField] ?? "" : "";
  return `Zaxon${agent ? ` | ${agent}` : " | Agent required"}`;
}

function nodeDone(values: Record<string, string>, node: JafzaCustomsBorderNode) {
  if (node.kind === "agent") {
    const agent = !!(node.agentField ? values[node.agentField]?.trim() : "");
    const consignee = node.consigneeNameField ? !!values[node.consigneeNameField]?.trim() : true;
    return agent && consignee;
  }
  const mode = nodeMode(values, node);
  if (mode === "CLIENT") {
    return !!(node.clientFinalChoiceField ? values[node.clientFinalChoiceField]?.trim() : "");
  }
  if (mode === "ZAXON") {
    const agent = !!(node.agentField ? values[node.agentField]?.trim() : "");
    const consignee = !!(node.consigneeNameField ? values[node.consigneeNameField]?.trim() : "");
    const show = !!(node.showConsigneeField ? values[node.showConsigneeField]?.trim() : "");
    return agent && consignee && show;
  }
  return false;
}

export function CustomsAgentsStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
  isAdmin,
  brokers,
  consigneeParties,
  routeId = "JAFZA_TO_SYRIA",
  naseebModeLock,
}: Props) {
  const route = jafzaRouteById(routeId);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    for (const key of ALL_FIELDS) next[key] = stringValue(step.values[key]);
    if (naseebModeLock) next.naseeb_clearance_mode = naseebModeLock;
    return next;
  });
  const [notes, setNotes] = useState(step.notes ?? "");
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [brokersList, setBrokersList] = useState<BrokerOption[]>(() => dedupeByName(brokers));
  const [consigneesList, setConsigneesList] = useState<ConsigneeOption[]>(() =>
    dedupeByName(consigneeParties),
  );

  const [addParty, setAddParty] = useState<AddPartyState>({
    open: false,
    type: "CUSTOMS_BROKER",
  });
  const [partyName, setPartyName] = useState("");
  const [partyError, setPartyError] = useState<string | null>(null);
  const [partySubmitting, setPartySubmitting] = useState(false);

  const chain = useMemo(
    () => [
      { id: "warehouse", label: "Dubai Warehouse", country: "AE", kind: "static" as const },
      ...route.customsChain,
    ],
    [route.customsChain],
  );

  const activeNode = route.customsChain.find((node) => node.id === activeNodeId) ?? null;

  const setField = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const pickConsignee = (partyIdField: string, nameField: string, partyId: string) => {
    const id = Number(partyId);
    const party = consigneesList.find((option) => option.id === id);
    setValues((prev) => ({
      ...prev,
      [partyIdField]: partyId,
      [nameField]: party?.name ?? "",
    }));
  };

  const openAddBroker = (targetField: string) => {
    if (!canEdit) return;
    setPartyName("");
    setPartyError(null);
    setAddParty({ open: true, type: "CUSTOMS_BROKER", targetField });
  };

  const openAddConsignee = (targetPartyIdField: string, targetNameField: string) => {
    if (!canEdit) return;
    setPartyName("");
    setPartyError(null);
    setAddParty({
      open: true,
      type: "CUSTOMER",
      targetPartyIdField,
      targetNameField,
    });
  };

  const createParty = async () => {
    const name = partyName.trim();
    if (!name || partySubmitting) {
      if (!name) setPartyError("Name is required.");
      return;
    }
    setPartySubmitting(true);
    setPartyError(null);

    try {
      const response = await fetch("/api/parties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: addParty.type,
          name,
        }),
      });
      if (!response.ok) {
        setPartyError("Unable to create party.");
        return;
      }
      const payload = (await response.json()) as { party?: { id: number; name: string } };
      const created = payload.party;
      if (!created?.name) {
        setPartyError("Unable to create party.");
        return;
      }

      if (addParty.type === "CUSTOMS_BROKER") {
        setBrokersList((prev) => dedupeByName([...prev, { id: created.id, name: created.name }]));
        if (addParty.targetField) setField(addParty.targetField, created.name.trim());
      } else {
        setConsigneesList((prev) => dedupeByName([...prev, { id: created.id, name: created.name }]));
        if (addParty.targetPartyIdField && addParty.targetNameField) {
          setValues((prev) => ({
            ...prev,
            [addParty.targetPartyIdField!]: String(created.id),
            [addParty.targetNameField!]: created.name.trim(),
          }));
        }
      }

      setAddParty((prev) => ({ ...prev, open: false }));
    } catch {
      setPartyError("Unable to create party.");
    } finally {
      setPartySubmitting(false);
    }
  };

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {ALL_FIELDS.map((fieldKey) => (
        <input
          key={`hidden-${fieldKey}`}
          name={fieldName([fieldKey])}
          value={values[fieldKey] ?? ""}
          readOnly
          hidden
        />
      ))}

      <SectionFrame
        title="Customs Agents Allocation"
        description="Assign route-specific customs points by selecting each border checkpoint."
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
            <div className="inline-flex w-max min-w-full flex-nowrap items-end gap-1 px-1 pr-2 pt-8">
              {chain.map((node, index) => {
                const isStatic = node.kind === "static";
                const summary = isStatic ? "Origin" : nodeSummary(values, node as JafzaCustomsBorderNode);
                const done = isStatic ? true : nodeDone(values, node as JafzaCustomsBorderNode);
                return (
                  <div key={node.id} className="relative flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isStatic && canEdit) setActiveNodeId(node.id);
                      }}
                      disabled={isStatic || !canEdit}
                      className={`w-36 shrink-0 rounded-lg border px-3 py-2 text-left transition ${
                        done
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                          : "border-zinc-300 bg-white text-zinc-700"
                      } ${
                        isStatic
                          ? "cursor-default opacity-90"
                          : "disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                      }`}
                    >
                      <div className="whitespace-nowrap text-[11px] uppercase tracking-[0.14em] opacity-80">
                        {node.country}
                      </div>
                      <div className="mt-1 whitespace-nowrap text-xs font-semibold">{node.label}</div>
                      <div className="mt-1 min-h-4 truncate whitespace-nowrap text-[11px]">{summary}</div>
                    </button>
                    {index < chain.length - 1 ? <div className="h-[3px] w-5 rounded-full bg-zinc-300" /> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {activeNode ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Close border modal"
              onClick={() => setActiveNodeId(null)}
              className="absolute inset-0 bg-black/40"
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative z-10 w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">{activeNode.label}</div>
                  <h4 className="mt-1 text-sm font-semibold text-zinc-900">Border details</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNodeId(null)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                >
                  Save
                </button>
              </div>

              <div className="space-y-3">
                {activeNode.kind === "clearance_mode" ? (
                  <>
                    <label className="block">
                      <div className="mb-1 text-[11px] font-medium text-zinc-500">Clearance mode *</div>
                      <select
                        value={activeNode.clearanceModeField ? values[activeNode.clearanceModeField] ?? "" : ""}
                        onChange={(event) => {
                          if (!activeNode.clearanceModeField) return;
                          if (
                            activeNode.id === "naseeb" &&
                            naseebModeLock &&
                            event.target.value !== naseebModeLock
                          ) {
                            return;
                          }
                          setField(activeNode.clearanceModeField, event.target.value);
                        }}
                        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                        disabled={!canEdit || (activeNode.id === "naseeb" && !!naseebModeLock)}
                      >
                        <option value="">Select mode</option>
                        {activeNode.id === "naseeb" && naseebModeLock ? (
                          <option value={naseebModeLock}>{naseebModeLock === "ZAXON" ? "Zaxon" : "Client"}</option>
                        ) : (
                          <>
                            <option value="ZAXON">Zaxon</option>
                            <option value="CLIENT">Client</option>
                          </>
                        )}
                      </select>
                    </label>

                    {nodeMode(values, activeNode) === "ZAXON" ? (
                      <>
                        {activeNode.agentField ? (
                          <label className="block">
                            <div className="mb-1 text-[11px] font-medium text-zinc-500">Clearing agent *</div>
                            <select
                              value={values[activeNode.agentField] ?? ""}
                              onChange={(event) => setField(activeNode.agentField!, event.target.value)}
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                              disabled={!canEdit}
                            >
                              <option value="">Select broker</option>
                              {withCurrent(brokersList, values[activeNode.agentField] ?? "").map((option) => (
                                <option key={`${activeNode.id}-${option.id}-${option.name}`} value={option.name}>
                                  {option.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => openAddBroker(activeNode.agentField!)}
                              disabled={!canEdit}
                              className="mt-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                            >
                              New broker
                            </button>
                          </label>
                        ) : null}

                        {activeNode.consigneePartyIdField && activeNode.consigneeNameField ? (
                          <label className="block">
                            <div className="mb-1 text-[11px] font-medium text-zinc-500">Consignee *</div>
                            <select
                              value={values[activeNode.consigneePartyIdField] ?? ""}
                              onChange={(event) =>
                                pickConsignee(
                                  activeNode.consigneePartyIdField!,
                                  activeNode.consigneeNameField!,
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                              disabled={!canEdit}
                            >
                              <option value="">Select consignee</option>
                              {consigneesList.map((option) => (
                                <option key={option.id} value={String(option.id)}>
                                  {option.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => openAddConsignee(activeNode.consigneePartyIdField!, activeNode.consigneeNameField!)}
                              disabled={!canEdit}
                              className="mt-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                            >
                              New consignee
                            </button>
                          </label>
                        ) : null}

                        {activeNode.showConsigneeField ? (
                          <label className="block">
                            <div className="mb-1 text-[11px] font-medium text-zinc-500">Show consignee to client *</div>
                            <select
                              value={values[activeNode.showConsigneeField] ?? ""}
                              onChange={(event) => setField(activeNode.showConsigneeField!, event.target.value)}
                              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                              disabled={!canEdit}
                            >
                              <option value="">Select option</option>
                              <option value="YES">Yes</option>
                              <option value="NO">No</option>
                            </select>
                          </label>
                        ) : null}
                      </>
                    ) : null}

                    {nodeMode(values, activeNode) === "CLIENT" && activeNode.clientFinalChoiceField ? (
                      <label className="block">
                        <div className="mb-1 text-[11px] font-medium text-zinc-500">Client final choice *</div>
                        <input
                          type="text"
                          value={values[activeNode.clientFinalChoiceField] ?? ""}
                          onChange={(event) => setField(activeNode.clientFinalChoiceField!, event.target.value)}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                          disabled={!canEdit}
                        />
                      </label>
                    ) : null}
                  </>
                ) : (
                  <>
                    {activeNode.agentField ? (
                      <label className="block">
                        <div className="mb-1 text-[11px] font-medium text-zinc-500">Clearing agent *</div>
                        <select
                          value={values[activeNode.agentField] ?? ""}
                          onChange={(event) => setField(activeNode.agentField!, event.target.value)}
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                          disabled={!canEdit}
                        >
                          <option value="">Select broker</option>
                          {withCurrent(brokersList, values[activeNode.agentField] ?? "").map((option) => (
                            <option key={`${activeNode.id}-${option.id}-${option.name}`} value={option.name}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => openAddBroker(activeNode.agentField!)}
                          disabled={!canEdit}
                          className="mt-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                        >
                          New broker
                        </button>
                      </label>
                    ) : null}

                    {activeNode.consigneePartyIdField && activeNode.consigneeNameField ? (
                      <label className="block">
                        <div className="mb-1 text-[11px] font-medium text-zinc-500">Consignee *</div>
                        <select
                          value={values[activeNode.consigneePartyIdField] ?? ""}
                          onChange={(event) =>
                            pickConsignee(
                              activeNode.consigneePartyIdField!,
                              activeNode.consigneeNameField!,
                              event.target.value,
                            )
                          }
                          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                          disabled={!canEdit}
                        >
                          <option value="">Select consignee</option>
                          {consigneesList.map((option) => (
                            <option key={option.id} value={String(option.id)}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => openAddConsignee(activeNode.consigneePartyIdField!, activeNode.consigneeNameField!)}
                          disabled={!canEdit}
                          className="mt-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
                        >
                          New consignee
                        </button>
                      </label>
                    ) : null}
                  </>
                )}
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

      {addParty.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close party modal"
            onClick={() => setAddParty((prev) => ({ ...prev, open: false }))}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                  {addParty.type === "CUSTOMS_BROKER" ? "Customs broker" : "Consignee"}
                </div>
                <h4 className="mt-1 text-sm font-semibold text-zinc-900">Quick add</h4>
              </div>
              <button
                type="button"
                onClick={() => setAddParty((prev) => ({ ...prev, open: false }))}
                disabled={partySubmitting}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                Close
              </button>
            </div>

            <label className="block">
              <div className="mb-1 text-[11px] font-medium text-zinc-500">Name *</div>
              <input
                value={partyName}
                onChange={(event) => setPartyName(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                disabled={partySubmitting}
              />
            </label>

            {partyError ? (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {partyError}
              </div>
            ) : null}

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={createParty}
                disabled={partySubmitting}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300"
              >
                {partySubmitting ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => setAddParty((prev) => ({ ...prev, open: false }))}
                disabled={partySubmitting}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
