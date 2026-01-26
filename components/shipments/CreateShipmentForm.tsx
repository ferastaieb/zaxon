"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import type { PartyRow } from "@/lib/data/parties";
import type { WorkflowTemplateRow } from "@/lib/data/workflows";
import { TransportModes } from "@/lib/domain";

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
  const [customerOptions, setCustomerOptions] = useState(customers);
  const [customerPartyIds, setCustomerPartyIds] = useState<string[]>([]);
  const [transportMode, setTransportMode] = useState("SEA");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [jobIds, setJobIds] = useState("");

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [customerSubmitting, setCustomerSubmitting] = useState(false);

  const openCustomerModal = () => {
    if (!canWrite) return;
    setCustomerError(null);
    setCustomerForm({
      name: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
    });
    setShowCustomerModal(true);
  };

  const closeCustomerModal = () => {
    if (customerSubmitting) return;
    setShowCustomerModal(false);
  };

  const updateCustomerForm = (key: keyof typeof customerForm, value: string) => {
    setCustomerForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite) return;

    const name = customerForm.name.trim();
    if (!name) {
      setCustomerError("Name is required.");
      return;
    }

    setCustomerSubmitting(true);
    setCustomerError(null);

    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "CUSTOMER",
          name,
          phone: customerForm.phone.trim() || null,
          email: customerForm.email.trim() || null,
          address: customerForm.address.trim() || null,
          notes: customerForm.notes.trim() || null,
        }),
      });

      if (!res.ok) {
        let errorMessage = "Unable to create customer.";
        if (res.status === 401) {
          errorMessage = "Session expired. Please sign in again.";
        } else if (res.status === 403) {
          errorMessage = "You do not have permission to create customers.";
        } else {
          const payload = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          if (payload?.error === "invalid") {
            errorMessage = "Please provide a customer name.";
          }
        }
        setCustomerError(errorMessage);
        return;
      }

      const payload = (await res.json()) as { party?: PartyRow };
      if (payload.party) {
        setCustomerOptions((prev) => {
          const next = [...prev, payload.party as PartyRow];
          next.sort((a, b) => a.name.localeCompare(b.name));
          return next;
        });
        setCustomerPartyIds((prev) => {
          const id = String(payload.party?.id ?? "");
          if (!id || prev.includes(id)) return prev;
          return [...prev, id];
        });
      }

      setShowCustomerModal(false);
    } catch {
      setCustomerError("Unable to create customer.");
    } finally {
      setCustomerSubmitting(false);
    }
  };

  return (
    <>
      <form action={action} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <div className="mb-1 flex items-center justify-between gap-2 text-sm font-medium text-zinc-800">
            <span>Customers</span>
            <button
              type="button"
              onClick={openCustomerModal}
              disabled={!canWrite}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
            >
              New customer
            </button>
          </div>
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
            {customerOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="mt-1 text-xs text-zinc-500">
            Hold Ctrl or Cmd to select multiple customers.
          </div>
          {customerOptions.length === 0 ? (
            <div className="mt-2 text-xs text-red-700">
              No customers yet. Use "New customer" to add one quickly.
            </div>
          ) : null}
        </label>

        <label className="block">
          <div className="mb-1 text-sm font-medium text-zinc-800">Service Type</div>
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
          <div className="mt-1 text-xs text-zinc-500">
            This section will be used to display the specific workflow.
          </div>
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

        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Job IDs</h2>
          <div className="mt-4">
            <label className="block">
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

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={
              !canWrite || customerOptions.length === 0 || templates.length === 0
            }
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
            <span className="text-sm text-zinc-500">
              Finance role is view-only.
            </span>
          ) : null}
        </div>
      </form>

      {showCustomerModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeCustomerModal}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  New customer
                </h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Add a customer without leaving this form.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCustomerModal}
                disabled={customerSubmitting}
                className="rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="mt-4 space-y-3">
              <label className="block">
                <div className="mb-1 text-sm font-medium text-zinc-800">
                  Name
                </div>
                <input
                  value={customerForm.name}
                  onChange={(e) => updateCustomerForm("name", e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  required
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <div className="mb-1 text-sm font-medium text-zinc-800">
                    Phone
                  </div>
                  <input
                    value={customerForm.phone}
                    onChange={(e) => updateCustomerForm("phone", e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <div className="mb-1 text-sm font-medium text-zinc-800">
                    Email
                  </div>
                  <input
                    value={customerForm.email}
                    onChange={(e) => updateCustomerForm("email", e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block">
                <div className="mb-1 text-sm font-medium text-zinc-800">
                  Address
                </div>
                <input
                  value={customerForm.address}
                  onChange={(e) => updateCustomerForm("address", e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <div className="mb-1 text-sm font-medium text-zinc-800">
                  Notes
                </div>
                <textarea
                  value={customerForm.notes}
                  onChange={(e) => updateCustomerForm("notes", e.target.value)}
                  className="min-h-24 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>

              {customerError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {customerError}
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={customerSubmitting}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                >
                  {customerSubmitting ? "Creating..." : "Create customer"}
                </button>
                <button
                  type="button"
                  onClick={closeCustomerModal}
                  disabled={customerSubmitting}
                  className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
