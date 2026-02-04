"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import type { PartyRow } from "@/lib/data/parties";
import {
  FCL_IMPORT_CONTAINER_STEPS,
  FCL_IMPORT_OPERATIONS_STEPS,
  FCL_IMPORT_TRACKING_STEPS,
} from "@/lib/fclImport/constants";
import { CanvasBackdrop } from "./CanvasBackdrop";

type CreateFormProps = {
  customers: PartyRow[];
  action: (formData: FormData) => void;
  canWrite: boolean;
  error: string | null;
};

const SERVICE_TYPES = [
  { id: "FCL_IMPORT_CLEARANCE", label: "FCL Import Clearance" },
];

export function FclImportCreateForm({
  customers,
  action,
  canWrite,
  error,
}: CreateFormProps) {
  const [query, setQuery] = useState("");
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [containers, setContainers] = useState<string[]>([""]);
  const [jobIds, setJobIds] = useState("");
  const [serviceType, setServiceType] = useState(
    SERVICE_TYPES[0]?.id ?? "FCL_IMPORT_CLEARANCE",
  );
  const containerInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const serviceLabel =
    SERVICE_TYPES.find((option) => option.id === serviceType)?.label ??
    SERVICE_TYPES[0]?.label ??
    "FCL Import Clearance";

  const filteredCustomers = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(trimmed));
  }, [customers, query]);

  const toggleCustomer = (id: string) => {
    setSelectedCustomers((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  const updateContainer = (index: number, value: string) => {
    setContainers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const focusContainer = (index: number) => {
    const input = containerInputRefs.current[index];
    if (input) input.focus();
  };

  const addContainer = () => {
    const nextIndex = containers.length;
    setContainers((prev) => [...prev, ""]);
    setTimeout(() => focusContainer(nextIndex), 0);
  };

  const removeContainer = (index: number) => {
    setContainers((prev) => prev.filter((_, idx) => idx !== index));
  };

  return (
    <form
      action={action}
      className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-amber-50 p-6 shadow-lg"
    >
      <CanvasBackdrop className="absolute inset-0 -z-10 h-full w-full opacity-70" />
      <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Shipment profile
                </div>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">
                  Core details
                </h2>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                Service: {serviceLabel}
              </span>
            </div>

            {error ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                Please complete all required fields before creating the shipment.
              </div>
            ) : null}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <div className="mb-1 text-sm font-medium text-slate-700">
                  Service type
                </div>
                <select
                  name="serviceType"
                  value={serviceType}
                  onChange={(event) => setServiceType(event.target.value)}
                  disabled={!canWrite}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-100"
                  required
                >
                  {SERVICE_TYPES.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-sm font-medium text-slate-700">
                  Origin
                </div>
                <input
                  name="origin"
                  disabled={!canWrite}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-100"
                  placeholder="Origin port or city"
                  required
                />
              </label>
              <label className="block">
                <div className="mb-1 text-sm font-medium text-slate-700">
                  Destination
                </div>
                <input
                  name="destination"
                  disabled={!canWrite}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-100"
                  placeholder="Destination port or city"
                  required
                />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Clients
                </div>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">
                  Customer selection
                </h2>
              </div>
              <Link
                href="/parties/new?type=CUSTOMER"
                className={`rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 ${
                  !canWrite ? "pointer-events-none opacity-60" : ""
                }`}
              >
                New customer
              </Link>
            </div>

            <div className="mt-4">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search customers..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none"
              />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {filteredCustomers.map((customer) => {
                const id = String(customer.id);
                const checked = selectedCustomers.includes(id);
                return (
                  <label
                    key={customer.id}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                      checked
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="customerPartyIds"
                      value={id}
                      checked={checked}
                      onChange={() => toggleCustomer(id)}
                      disabled={!canWrite}
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                    <span className="truncate">{customer.name}</span>
                  </label>
                );
              })}
            </div>
            {selectedCustomers.length ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                {selectedCustomers.map((id) => {
                  const customer = customers.find((c) => String(c.id) === id);
                  return (
                    <span
                      key={id}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1"
                    >
                      {customer?.name ?? "Customer"}
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 text-xs text-slate-500">
                Select at least one customer to continue.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Containers
                </div>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">
                  Container numbers
                </h2>
              </div>
              <button
                type="button"
                onClick={addContainer}
                disabled={!canWrite}
                className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Add container
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {containers.map((value, index) => (
                <div
                  key={`container-${index}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                >
                  <div className="text-xs font-semibold text-slate-500">
                    #{String(index + 1).padStart(2, "0")}
                  </div>
                  <input
                    name="containerNumbers"
                    ref={(el) => {
                      containerInputRefs.current[index] = el;
                    }}
                    value={value}
                    onChange={(event) => updateContainer(index, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      if (index === containers.length - 1) {
                        addContainer();
                      }
                    }}
                    placeholder="Container number"
                    className="min-w-[200px] flex-1 bg-transparent text-sm text-slate-800 focus:outline-none"
                    required={false}
                    disabled={!canWrite}
                  />
                  <button
                    type="button"
                    onClick={() => removeContainer(index)}
                    disabled={containers.length === 1}
                    className="rounded-full border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-500">
              Tip: press Enter to add another container quickly.
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              References
            </div>
            <div className="mt-2 grid gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <div className="mb-1 text-sm font-medium text-slate-700">
                  Job numbers (optional)
                </div>
                <input
                  name="jobIds"
                  value={jobIds}
                  onChange={(event) => setJobIds(event.target.value)}
                  disabled={!canWrite}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-400 focus:outline-none disabled:bg-slate-100"
                  placeholder="e.g., JOB-234, JOB-235"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!canWrite}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Create shipment
            </button>
            <Link
              href="/shipments"
              className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
            >
              Cancel
            </Link>
            {!canWrite ? (
              <span className="text-sm text-slate-500">
                Finance role is view-only.
              </span>
            ) : null}
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-xl shadow-slate-900/30">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-300">
              Workflow preview
            </div>
            <h3 className="mt-2 text-lg font-semibold">FCL Clearance Journey</h3>
            <p className="mt-2 text-sm text-slate-300">
              A live preview of what will be generated once the shipment is created.
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Tracking
                </div>
                <ul className="mt-2 space-y-2">
                  {FCL_IMPORT_TRACKING_STEPS.map((step, index) => (
                    <li
                      key={step}
                      className="flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-800/60 px-3 py-2"
                    >
                      <span className="text-slate-100">
                        {index + 1}. {step}
                      </span>
                      <span className="text-xs text-slate-400">Client</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Operations
                </div>
                <ul className="mt-2 space-y-2">
                  {FCL_IMPORT_OPERATIONS_STEPS.map((step) => (
                    <li
                      key={step}
                      className="flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-800/60 px-3 py-2"
                    >
                      <span className="text-slate-100">{step}</span>
                      <span className="text-xs text-slate-400">Internal</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Container ops
                </div>
                <ul className="mt-2 space-y-2">
                  {FCL_IMPORT_CONTAINER_STEPS.map((step) => (
                    <li
                      key={step}
                      className="flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-800/60 px-3 py-2"
                    >
                      <span className="text-slate-100">{step}</span>
                      <span className="text-xs text-slate-400">Internal</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Shortcuts
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Add another container</span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
                  Enter
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Quick customer search</span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
                  Type
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Cancel</span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs">
                  Esc
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </form>
  );
}
