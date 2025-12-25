"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type { PartyRow } from "@/lib/data/parties";
import type { WorkflowTemplateRow } from "@/lib/data/workflows";
import { ShipmentTypes, TransportModes } from "@/lib/domain";

type SuggestedTemplate = { id: number; name: string } | null;

export function CreateShipmentForm({
  customers,
  templates,
  action,
  canWrite,
}: {
  customers: PartyRow[];
  templates: WorkflowTemplateRow[];
  action: (formData: FormData) => void;
  canWrite: boolean;
}) {
  const [customerPartyIds, setCustomerPartyIds] = useState<string[]>([]);
  const [transportMode, setTransportMode] = useState("SEA");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [shipmentType, setShipmentType] = useState("FCL");
  const [cargoDescription, setCargoDescription] = useState("");
  const [packagesCount, setPackagesCount] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [containerNumber, setContainerNumber] = useState("");
  const [blNumber, setBlNumber] = useState("");
  const [jobIds, setJobIds] = useState("");
  const [etd, setEtd] = useState("");
  const [eta, setEta] = useState("");

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [manualTemplate, setManualTemplate] = useState(false);
  const [suggested, setSuggested] = useState<SuggestedTemplate>(null);
  const [suggesting, setSuggesting] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const primaryCustomerId = customerPartyIds[0] ?? "";
  const shouldSuggest = useMemo(() => {
    return (
      !!primaryCustomerId &&
      !!transportMode &&
      origin.trim().length > 0 &&
      destination.trim().length > 0 &&
      !!shipmentType
    );
  }, [primaryCustomerId, transportMode, origin, destination, shipmentType]);

  useEffect(() => {
    if (!TransportModes.includes(transportMode as never)) return;
    if (transportMode === "LAND" && shipmentType !== "LAND") {
      setShipmentType("LAND");
    }
    if ((transportMode === "SEA" || transportMode === "SEA_LAND") && shipmentType === "LAND") {
      setShipmentType("FCL");
    }
  }, [transportMode, shipmentType]);

  useEffect(() => {
    if (!shouldSuggest) {
      setSuggested(null);
      if (!manualTemplate) setSelectedTemplateId("");
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setSuggesting(true);
      try {
        const res = await fetch("/api/workflows/suggest", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            transportMode,
            origin,
            destination,
            shipmentType,
            customerPartyId: Number(primaryCustomerId),
          }),
          signal: ctrl.signal,
        });
        const json = (await res.json()) as { template: SuggestedTemplate };
        const tmpl = json.template ?? null;
        setSuggested(tmpl);
        if (tmpl && !manualTemplate) setSelectedTemplateId(String(tmpl.id));
        if (!tmpl && !manualTemplate) setSelectedTemplateId("");
      } catch {
        // ignore
      } finally {
        setSuggesting(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [
    customerPartyIds,
    transportMode,
    origin,
    destination,
    shipmentType,
    manualTemplate,
    shouldSuggest,
  ]);

  const customerHint =
    customerPartyIds.length > 1
      ? "Template suggestion uses the first selected customer."
      : "Fill mode + route + type + customer to get a suggestion.";
  const templateHint = suggested
    ? `Suggested: ${suggested.name}`
    : shouldSuggest && !suggesting
      ? "No matching rule (select manually)."
      : customerHint;

  const requiredTemplates = templates.length > 0;

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-sm font-medium text-zinc-800">Customers</div>
          <select
            name="customerPartyIds"
            multiple
            value={customerPartyIds}
            onChange={(e) =>
              setCustomerPartyIds(
                Array.from(e.target.selectedOptions).map((opt) => opt.value),
              )
            }
            disabled={!canWrite}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            required
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="mt-1 text-xs text-zinc-500">
            Hold Ctrl or Cmd to select multiple customers.
          </div>
          {customers.length === 0 ? (
            <div className="mt-2 text-xs text-red-700">
              No customers yet. Create a customer in Parties first.
            </div>
          ) : null}
        </label>

        <label className="block">
          <div className="mb-1 text-sm font-medium text-zinc-800">
            Transport mode
          </div>
          <select
            name="transportMode"
            value={transportMode}
            onChange={(e) => setTransportMode(e.target.value)}
            disabled={!canWrite}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            required
          >
            {TransportModes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <div className="mb-1 text-sm font-medium text-zinc-800">From</div>
          <input
            name="origin"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            disabled={!canWrite}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
            placeholder="Origin (city/port)"
            required
          />
        </label>

        <label className="block">
          <div className="mb-1 text-sm font-medium text-zinc-800">To</div>
          <input
            name="destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            disabled={!canWrite}
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
            placeholder="Destination (city/port)"
            required
          />
        </label>

        <label className="block">
          <div className="mb-1 text-sm font-medium text-zinc-800">
            Shipment type
          </div>
          <select
            name="shipmentType"
            value={shipmentType}
            onChange={(e) => setShipmentType(e.target.value)}
            disabled={!canWrite}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            required
          >
            {ShipmentTypes.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <div className="mb-1 text-sm font-medium text-zinc-800">
            Workflow template
          </div>
          <select
            name="workflowTemplateId"
            value={selectedTemplateId}
            onChange={(e) => {
              setSelectedTemplateId(e.target.value);
              setManualTemplate(true);
            }}
            disabled={!canWrite || !requiredTemplates}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            required
          >
            <option value="" disabled>
              {requiredTemplates ? "Select template..." : "No templates yet"}
            </option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>{suggesting ? "Suggesting..." : templateHint}</span>
            {suggested && manualTemplate ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedTemplateId(String(suggested.id));
                  setManualTemplate(false);
                }}
                className="rounded-md border border-zinc-200 bg-white px-2 py-1 font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Use suggested
              </button>
            ) : null}
          </div>
        </label>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Cargo</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              Description
            </div>
            <input
              name="cargoDescription"
              value={cargoDescription}
              onChange={(e) => setCargoDescription(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
              placeholder="e.g., Spare parts, furniture..."
              required
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              Packages (optional)
            </div>
            <input
              name="packagesCount"
              type="number"
              min={0}
              value={packagesCount}
              onChange={(e) => setPackagesCount(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
              placeholder="0"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              Weight (kg, optional)
            </div>
            <input
              name="weightKg"
              type="number"
              min={0}
              step="0.01"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>
          <label className="block md:col-span-2">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              Dimensions (optional)
            </div>
            <input
              name="dimensions"
              value={dimensions}
              onChange={(e) => setDimensions(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
              placeholder="e.g., 2 pallets (120x80x150cm)"
            />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Identifiers</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              Container number (optional)
            </div>
            <input
              name="containerNumber"
              value={containerNumber}
              onChange={(e) => setContainerNumber(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
              placeholder="MSCU1234567"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              B/L number (optional)
            </div>
            <input
              name="blNumber"
              value={blNumber}
              onChange={(e) => setBlNumber(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
              placeholder="BL-..."
            />
          </label>
          <label className="block md:col-span-2">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              Job IDs (optional)
            </div>
            <input
              name="jobIds"
              value={jobIds}
              onChange={(e) => setJobIds(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
              placeholder="e.g., JOB-123, JOB-124"
            />
            <div className="mt-1 text-xs text-zinc-500">
              Separate multiple IDs with commas.
            </div>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Estimated dates</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              ETD (optional)
            </div>
            <input
              name="etd"
              type="date"
              value={etd}
              onChange={(e) => setEtd(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium text-zinc-800">
              ETA (optional)
            </div>
            <input
              name="eta"
              type="date"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              disabled={!canWrite}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canWrite || customers.length === 0 || templates.length === 0}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          Create shipment
        </button>
        <Link
          href="/shipments"
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </Link>
        {!canWrite ? (
          <span className="text-sm text-zinc-500">Finance role is view-only.</span>
        ) : null}
      </div>
    </form>
  );
}
