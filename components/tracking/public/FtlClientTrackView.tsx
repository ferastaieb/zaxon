import Link from "next/link";
import {
  CalendarRange,
  Clock3,
  FileImage,
  FileText,
  MapPin,
  Route,
  Truck,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import type {
  FtlClientTrackingAvailability,
  FtlClientTrackingProgressState,
  FtlClientTrackingTab,
  FtlClientTrackingViewModel,
} from "@/lib/ftlExport/clientTrackingView";

type PublicRequest = {
  id: number;
  document_type: string;
  message: string | null;
  status: "OPEN" | "FULFILLED";
};

type PublicException = {
  id: number;
  status: "OPEN" | "RESOLVED";
  created_at: string;
  exception_name: string;
  default_risk: string;
  customer_message: string | null;
};

type Props = {
  token: string;
  shipmentId: number;
  uploaded: boolean;
  activeTab: FtlClientTrackingTab;
  viewModel: FtlClientTrackingViewModel;
  exceptions: PublicException[];
  requests: PublicRequest[];
  uploadRequestedDocAction: (requestId: number, formData: FormData) => Promise<void>;
};

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function progressTone(state: FtlClientTrackingProgressState): "zinc" | "blue" | "green" {
  if (state === "DONE") return "green";
  if (state === "IN_PROGRESS") return "blue";
  return "zinc";
}

function progressLabel(state: FtlClientTrackingProgressState) {
  if (state === "DONE") return "Done";
  if (state === "IN_PROGRESS") return "In progress";
  return "Pending";
}

function availabilityTone(status: FtlClientTrackingAvailability): "green" | "yellow" | "zinc" {
  if (status === "AVAILABLE") return "green";
  if (status === "UNAVAILABLE") return "zinc";
  return "yellow";
}

function availabilityLabel(status: FtlClientTrackingAvailability) {
  if (status === "AVAILABLE") return "Available";
  if (status === "UNAVAILABLE") return "Unavailable";
  return "Pending";
}

function exceptionTone(risk: string) {
  if (risk === "BLOCKED") return "red";
  if (risk === "AT_RISK") return "yellow";
  return "zinc";
}

function hrefFor(token: string, shipmentId: number, tab: FtlClientTrackingTab) {
  return `/track/${token}?shipment=${shipmentId}&tab=${tab}`;
}

function sectionClassName() {
  return "rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm sm:p-6";
}

function documentCardClassName(status: FtlClientTrackingAvailability) {
  if (status === "AVAILABLE") {
    return "border-emerald-200 bg-emerald-50/70";
  }
  if (status === "UNAVAILABLE") {
    return "border-stone-200 bg-stone-100 text-stone-500";
  }
  return "border-stone-200 bg-stone-50";
}

export function FtlClientTrackView({
  token,
  shipmentId,
  uploaded,
  activeTab,
  viewModel,
  exceptions,
  requests,
  uploadRequestedDocAction,
}: Props) {
  const openRequests = requests.filter((request) => request.status === "OPEN");

  return (
    <div className="space-y-5">
      <section className={sectionClassName()}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
              Full Truck Export
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
              {viewModel.shipment_code}
            </h2>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-stone-600">
              <span className="inline-flex items-center gap-2">
                <Route className="h-4 w-4 text-stone-400" />
                {viewModel.route_label}
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-stone-400" />
                Updated {fmtDateTime(viewModel.last_updated_at)}
              </span>
            </div>
          </div>
          <div className="space-y-2 text-right">
            <Badge tone="blue">{viewModel.shipment_status_label}</Badge>
            <div className="text-xs text-stone-500">Started {fmtDate(viewModel.shipment_date)}</div>
          </div>
        </div>

        {uploaded ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Document uploaded successfully.
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              Delivered To
            </div>
            <div className="mt-2 text-sm text-stone-900">{viewModel.final_delivery.delivered_to}</div>
          </div>
          <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              Planned Loading
            </div>
            <div className="mt-2 text-sm text-stone-900">{fmtDate(viewModel.plan.loading_date)}</div>
          </div>
          <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              Confirmed Trucks
            </div>
            <div className="mt-2 text-sm text-stone-900">{viewModel.confirmed_trucks.length}</div>
          </div>
          <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              Loaded Trucks
            </div>
            <div className="mt-2 text-sm text-stone-900">{viewModel.cargo_loaded_details.length}</div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-stone-200 bg-white p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {([
            { id: "overview", label: "Overview" },
            { id: "trucks", label: "Trucks" },
            { id: "documents", label: "Documents" },
            { id: "tracking", label: "Tracking" },
          ] as Array<{ id: FtlClientTrackingTab; label: string }>).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                href={hrefFor(token, shipmentId, tab.id)}
                className={`rounded-[1.3rem] px-4 py-3 text-center text-sm font-semibold transition ${
                  active
                    ? "bg-stone-950 text-white"
                    : "bg-stone-50 text-stone-600 hover:bg-teal-50 hover:text-teal-800"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </section>

      {activeTab === "overview" ? (
        <div className="space-y-5">
          <section className={sectionClassName()}>
            <div className="flex items-center gap-2">
              <CalendarRange className="h-5 w-5 text-teal-700" />
              <h3 className="text-lg font-semibold text-stone-950">Date Timeline</h3>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {viewModel.timeline.map((milestone) => (
                <div
                  key={milestone.id}
                  className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-stone-950">{milestone.label}</div>
                    <Badge tone={progressTone(milestone.state)}>
                      {progressLabel(milestone.state)}
                    </Badge>
                  </div>
                  <div className="mt-3 text-sm text-stone-700">{fmtDate(milestone.date)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={sectionClassName()}>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-teal-700" />
              <h3 className="text-lg font-semibold text-stone-950">Plan</h3>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[260px_1fr]">
              <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Loading Date
                </div>
                <div className="mt-2 text-lg font-semibold text-stone-950">
                  {fmtDate(viewModel.plan.loading_date)}
                </div>
                <div className="mt-3 text-sm text-stone-600">
                  Planned trucks: {viewModel.plan.total_trucks_planned || 0}
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Planned Trailer Details
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {viewModel.plan.planned_trailers.map((row) => (
                    <div
                      key={`planned-trailer-${row.index}`}
                      className="rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-900"
                    >
                      Trailer {row.index + 1}: {row.trailer_type}
                    </div>
                  ))}
                  {viewModel.plan.planned_trailers.length === 0 ? (
                    <div className="text-sm text-stone-500">No planned trailer details yet.</div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {exceptions.length ? (
            <section className={sectionClassName()}>
              <h3 className="text-lg font-semibold text-stone-950">Latest Updates</h3>
              <div className="mt-4 space-y-3">
                {exceptions.map((exception) => (
                  <div
                    key={exception.id}
                    className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-stone-950">
                          {exception.exception_name}
                        </div>
                        <div className="mt-1 text-xs text-stone-500">
                          {fmtDateTime(exception.created_at)}
                        </div>
                      </div>
                      <Badge tone={exceptionTone(exception.default_risk)}>
                        {exception.default_risk === "BLOCKED" ? "Blocked" : "At risk"}
                      </Badge>
                    </div>
                    <div className="mt-3 text-sm text-stone-700">
                      {exception.customer_message ?? "Our team is working on this update."}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {activeTab === "trucks" ? (
        <div className="space-y-5">
          <section className={sectionClassName()}>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-teal-700" />
              <h3 className="text-lg font-semibold text-stone-950">Confirmed Trucks</h3>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {viewModel.confirmed_trucks.map((truck) => (
                <div
                  key={`confirmed-${truck.index}`}
                  className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4"
                >
                  <div className="text-sm font-semibold text-stone-950">
                    {truck.truck_number}
                  </div>
                  <div className="mt-2 space-y-2 text-sm text-stone-700">
                    <div>Truck type: {truck.trailer_type}</div>
                    <div className="inline-flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-stone-400" />
                      {truck.driver_name}
                    </div>
                  </div>
                </div>
              ))}
              {viewModel.confirmed_trucks.length === 0 ? (
                <div className="text-sm text-stone-500">No trucks have been confirmed yet.</div>
              ) : null}
            </div>
          </section>

          <section className={sectionClassName()}>
            <div className="flex items-center gap-2">
              <FileImage className="h-5 w-5 text-teal-700" />
              <h3 className="text-lg font-semibold text-stone-950">Cargo Loaded Details</h3>
            </div>
            <div className="mt-4 space-y-3">
              {viewModel.cargo_loaded_details.map((row) => (
                <div
                  key={`cargo-loaded-${row.index}`}
                  className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-stone-950">
                        {row.truck_number} / {row.truck_type}
                      </div>
                      <div className="mt-1 inline-flex items-center gap-2 text-sm text-stone-600">
                        <MapPin className="h-4 w-4 text-stone-400" />
                        {row.loading_place}
                      </div>
                    </div>
                    <Badge tone="green">Loaded</Badge>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-900">
                      Actual loading date: {fmtDate(row.actual_loading_date)}
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-900">
                      Total qty & type: {row.total_quantity_label}
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-900">
                      Total weight: {row.total_weight_kg} kg
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm text-stone-900 sm:col-span-2 xl:col-span-3">
                      Cargo description: {row.cargo_description}
                    </div>
                    {row.photo ? (
                      <a
                        href={`/api/track/${token}/documents/${row.photo.id}`}
                        className="rounded-2xl border border-stone-200 bg-white px-3 py-3 text-sm font-medium text-teal-800 hover:underline sm:col-span-2 xl:col-span-1"
                      >
                        Loading photo: {row.photo.file_name}
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
              {viewModel.cargo_loaded_details.length === 0 ? (
                <div className="text-sm text-stone-500">No loaded truck details shared yet.</div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "documents" ? (
        <div className="space-y-5">
          <section className={sectionClassName()}>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-teal-700" />
              <h3 className="text-lg font-semibold text-stone-950">All Documents</h3>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div
                className={`rounded-[1.5rem] border p-4 ${documentCardClassName(
                  viewModel.document_sections.export_invoice.status,
                )}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">Export Invoice (Zaxon)</div>
                  <Badge tone={availabilityTone(viewModel.document_sections.export_invoice.status)}>
                    {availabilityLabel(viewModel.document_sections.export_invoice.status)}
                  </Badge>
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <div>Number: {viewModel.document_sections.export_invoice.number ?? "-"}</div>
                  <div>Date: {fmtDate(viewModel.document_sections.export_invoice.date)}</div>
                  {viewModel.document_sections.export_invoice.file ? (
                    <a
                      href={`/api/track/${token}/documents/${viewModel.document_sections.export_invoice.file.id}`}
                      className="inline-block font-medium text-teal-800 hover:underline"
                    >
                      {viewModel.document_sections.export_invoice.file.file_name}
                    </a>
                  ) : (
                    <div className="text-stone-500">File not shared yet.</div>
                  )}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 p-4">
                <div className="text-sm font-semibold text-stone-950">Loading Sheets</div>
                <div className="mt-3 space-y-2">
                  {viewModel.document_sections.loading_sheets.map((row) => (
                    <div
                      key={row.id}
                      className={`rounded-2xl border px-3 py-3 text-sm ${documentCardClassName(
                        row.status,
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>{row.label}</div>
                        <Badge tone={availabilityTone(row.status)}>
                          {availabilityLabel(row.status)}
                        </Badge>
                      </div>
                      {row.file ? (
                        <a
                          href={`/api/track/${token}/documents/${row.file.id}`}
                          className="mt-2 inline-block font-medium text-teal-800 hover:underline"
                        >
                          {row.file.file_name}
                        </a>
                      ) : (
                        <div className="mt-2 text-stone-500">{row.reason ?? "Pending"}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 p-4">
                <div className="text-sm font-semibold text-stone-950">
                  Export & Transit Declarations
                </div>
                <div className="mt-3 space-y-2">
                  {viewModel.document_sections.export_transit_declarations.map((row) => (
                    <div
                      key={row.id}
                      className={`rounded-2xl border px-3 py-3 text-sm ${documentCardClassName(
                        row.status,
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>{row.label}</div>
                        <Badge tone={availabilityTone(row.status)}>
                          {availabilityLabel(row.status)}
                        </Badge>
                      </div>
                      <div className="mt-2 text-stone-600">Date: {fmtDate(row.date)}</div>
                      {row.file ? (
                        <a
                          href={`/api/track/${token}/documents/${row.file.id}`}
                          className="mt-2 inline-block font-medium text-teal-800 hover:underline"
                        >
                          {row.file.file_name}
                        </a>
                      ) : (
                        <div className="mt-2 text-stone-500">{row.reason ?? "Pending"}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 p-4">
                <div className="text-sm font-semibold text-stone-950">
                  Entry Declarations
                </div>
                <div className="mt-3 space-y-2">
                  {viewModel.document_sections.entry_declarations.map((row) => (
                    <div
                      key={row.id}
                      className={`rounded-2xl border px-3 py-3 text-sm ${documentCardClassName(
                        row.status,
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>{row.label}</div>
                        <Badge tone={availabilityTone(row.status)}>
                          {availabilityLabel(row.status)}
                        </Badge>
                      </div>
                      <div className="mt-2 text-stone-600">Date: {fmtDate(row.date)}</div>
                      {row.file ? (
                        <a
                          href={`/api/track/${token}/documents/${row.file.id}`}
                          className="mt-2 inline-block font-medium text-teal-800 hover:underline"
                        >
                          {row.file.file_name}
                        </a>
                      ) : (
                        <div className="mt-2 text-stone-500">{row.reason ?? "Pending"}</div>
                      )}
                    </div>
                  ))}
                  {viewModel.document_sections.entry_declarations.length === 0 ? (
                    <div className="text-sm text-stone-500">
                      No entry declarations apply to this shipment.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {openRequests.length ? (
            <section className={sectionClassName()}>
              <h3 className="text-lg font-semibold text-stone-950">Requested Documents</h3>
              <div className="mt-4 space-y-3">
                {openRequests.map((request) => (
                  <div
                    key={request.id}
                    className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4"
                  >
                    <div className="text-sm font-semibold text-stone-950">
                      {request.document_type}
                    </div>
                    {request.message ? (
                      <div className="mt-1 text-sm text-stone-600">{request.message}</div>
                    ) : null}

                    <form
                      action={uploadRequestedDocAction.bind(null, request.id)}
                      className="mt-4 flex flex-wrap gap-2"
                    >
                      <input
                        name="file"
                        type="file"
                        className="w-full rounded-2xl border border-stone-300 bg-white px-3 py-2 text-sm"
                        required
                      />
                      <SubmitButton
                        pendingLabel="Uploading..."
                        className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
                      >
                        Upload
                      </SubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {activeTab === "tracking" ? (
        <div className="space-y-5">
          <section className={sectionClassName()}>
            <div className="flex items-center gap-2">
              <Route className="h-5 w-5 text-teal-700" />
              <h3 className="text-lg font-semibold text-stone-950">Shipment Tracking</h3>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {viewModel.tracking_groups.map((group) => (
                <div
                  key={group.id}
                  className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4"
                >
                  <div className="text-sm font-semibold text-stone-950">{group.label}</div>
                  <div className="mt-3 space-y-2">
                    {group.checkpoints.map((checkpoint) => (
                      <div
                        key={checkpoint.id}
                        className="rounded-2xl border border-stone-200 bg-white px-3 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm text-stone-900">{checkpoint.label}</div>
                          <Badge tone={progressTone(checkpoint.state)}>
                            {progressLabel(checkpoint.state)}
                          </Badge>
                        </div>
                        <div className="mt-2 text-sm text-stone-600">
                          {fmtDate(checkpoint.date)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={sectionClassName()}>
            <h3 className="text-lg font-semibold text-stone-950">Final Delivery</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Delivered To
                </div>
                <div className="mt-2 text-sm text-stone-900">
                  {viewModel.final_delivery.delivered_to}
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50 px-4 py-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                  Delivery Date
                </div>
                <div className="mt-2 text-sm text-stone-900">
                  {fmtDate(viewModel.final_delivery.date)}
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
