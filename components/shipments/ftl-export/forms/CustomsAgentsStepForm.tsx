"use client";

import { useState } from "react";

import type { FtlStepData } from "../types";
import { fieldName, stringValue } from "../fieldNames";
import { SectionFrame } from "./SectionFrame";

type Props = {
  step: FtlStepData;
  updateAction: (formData: FormData) => void;
  returnTo: string;
  canEdit: boolean;
};

export function CustomsAgentsStepForm({
  step,
  updateAction,
  returnTo,
  canEdit,
}: Props) {
  const [jebelAliAgent, setJebelAliAgent] = useState(
    stringValue(step.values.jebel_ali_agent_name),
  );
  const [silaAgent, setSilaAgent] = useState(stringValue(step.values.sila_agent_name));
  const [bathaAgent, setBathaAgent] = useState(stringValue(step.values.batha_agent_name));
  const [omariAgent, setOmariAgent] = useState(stringValue(step.values.omari_agent_name));
  const [naseebMode, setNaseebMode] = useState(
    stringValue(step.values.naseeb_clearance_mode).toUpperCase(),
  );
  const [naseebAgent, setNaseebAgent] = useState(stringValue(step.values.naseeb_agent_name));
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

  return (
    <form action={updateAction}>
      <input type="hidden" name="stepId" value={step.id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <SectionFrame
        title="Customs Agents Allocation"
        description="Allocate mandatory clearing agents for each border before shipment tracking starts."
        status={step.status}
        canEdit={canEdit}
        saveLabel="Save customs allocation"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            name={fieldName(["jebel_ali_agent_name"])}
            value={jebelAliAgent}
            onChange={(event) => setJebelAliAgent(event.target.value)}
            placeholder="Jebel Ali FZ agent *"
            required
            disabled={!canEdit}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
          <input
            name={fieldName(["sila_agent_name"])}
            value={silaAgent}
            onChange={(event) => setSilaAgent(event.target.value)}
            placeholder="Sila border agent *"
            required
            disabled={!canEdit}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
          <input
            name={fieldName(["batha_agent_name"])}
            value={bathaAgent}
            onChange={(event) => setBathaAgent(event.target.value)}
            placeholder="Batha border agent *"
            required
            disabled={!canEdit}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
          <input
            name={fieldName(["omari_agent_name"])}
            value={omariAgent}
            onChange={(event) => setOmariAgent(event.target.value)}
            placeholder="Omari border agent *"
            required
            disabled={!canEdit}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
          />
        </div>

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
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <input
                name={fieldName(["naseeb_agent_name"])}
                value={naseebAgent}
                onChange={(event) => setNaseebAgent(event.target.value)}
                placeholder="Naseeb agent name *"
                required
                disabled={!canEdit}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
              />
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

