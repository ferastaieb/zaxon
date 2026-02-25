import Link from "next/link";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import { Badge } from "@/components/ui/Badge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import type {
  FtlClientTrackingAvailability,
  FtlClientTrackingProgressState,
  FtlClientTrackingSubTab,
  FtlClientTrackingTab,
  FtlClientTrackingViewModel,
} from "@/lib/ftlExport/clientTrackingView";
import type { TrackingConnectedShipment } from "@/lib/data/tracking";
import { overallStatusLabel } from "@/lib/domain";
import type { TrackingRegion } from "@/components/shipments/ftl-export/forms/trackingTimelineConfig";

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
  shipmentCode: string;
  uploaded: boolean;
  activeTab: FtlClientTrackingTab;
  activeTrackingTab: FtlClientTrackingSubTab;
  activeRegion: TrackingRegion | null;
  activeTruck: number | null;
  viewModel: FtlClientTrackingViewModel;
  connectedShipments: TrackingConnectedShipment[];
  exceptions: PublicException[];
  requests: PublicRequest[];
  uploadRequestedDocAction: (requestId: number, formData: FormData) => Promise<void>;
  logoutTrackingAction: () => Promise<void>;
};

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

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
  if (status === "UNAVAILABLE") return "yellow";
  return "zinc";
}

function availabilityLabel(status: FtlClientTrackingAvailability) {
  if (status === "AVAILABLE") return "Available";
  if (status === "UNAVAILABLE") return "Unavailable by rule";
  return "Not available";
}

function laneTone(tone: "past" | "current" | "future") {
  if (tone === "current") return "border-emerald-500 bg-emerald-500 text-white";
  if (tone === "past") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-zinc-200 bg-zinc-50 text-zinc-500";
}

function exceptionTone(risk: string) {
  if (risk === "BLOCKED") return "red";
  if (risk === "AT_RISK") return "yellow";
  return "zinc";
}

const MAIN_TABS: Array<{ id: FtlClientTrackingTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "tracking", label: "Tracking" },
  { id: "documents", label: "Documents & Photos" },
  { id: "cargo", label: "Cargo Details" },
];

const TRACKING_TABS: Array<{ id: FtlClientTrackingSubTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "loading", label: "Tracking Loading" },
  { id: "international", label: "International Timeline" },
];

export function FtlClientTrackView({
  token,
  shipmentCode,
  uploaded,
  activeTab,
  activeTrackingTab,
  activeRegion,
  activeTruck,
  viewModel,
  connectedShipments,
  exceptions,
  requests,
  uploadRequestedDocAction,
  logoutTrackingAction,
}: Props) {
  const openRequests = requests.filter((request) => request.status === "OPEN");
  const hasConnected = connectedShipments.length > 0;
  const hasUpdates = exceptions.length > 0;
  const hasRequests = openRequests.length > 0;

  const hrefFor = (input: {
    tab?: FtlClientTrackingTab;
    trackingTab?: FtlClientTrackingSubTab;
    region?: TrackingRegion | null;
    truck?: number | null;
  }) => {
    const params = new URLSearchParams();
    const tab = input.tab ?? activeTab;
    params.set("tab", tab);
    if (tab === "tracking") {
      params.set("trackingTab", input.trackingTab ?? activeTrackingTab);
      const region = input.region === undefined ? activeRegion : input.region;
      if (region) params.set("region", region);
    }
    if (tab === "cargo") {
      const truck = input.truck === undefined ? activeTruck : input.truck;
      if (typeof truck === "number" && Number.isFinite(truck) && truck >= 0) {
        params.set("truck", String(truck));
      }
    }
    return `/track/${token}?${params.toString()}`;
  };

  const previousStepHref = (() => {
    if (activeTab === "tracking" && activeTrackingTab === "international") {
      return hrefFor({ tab: "tracking", trackingTab: "loading", region: null });
    }
    if (activeTab === "tracking" && activeTrackingTab === "loading") {
      return hrefFor({ tab: "tracking", trackingTab: "overview", region: null });
    }
    if (activeTab === "tracking") {
      return hrefFor({ tab: "overview", trackingTab: "overview", region: null, truck: null });
    }
    if (activeTab === "documents") {
      return hrefFor({ tab: "tracking", trackingTab: "overview", region: null, truck: null });
    }
    if (activeTab === "cargo") {
      return hrefFor({ tab: "documents", trackingTab: "overview", region: null, truck: null });
    }
    return null;
  })();

  return (
    <div className={`${bodyFont.className} min-h-screen bg-slate-50`}>
      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 sm:py-10">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Shipment tracking</p>
              <h1 className={`${headingFont.className} mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl`}>
                {shipmentCode}
              </h1>
              <p className="mt-2 text-sm text-slate-600">{viewModel.route_label}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="zinc">{viewModel.service_type_label}</Badge>
                <Badge tone="blue">{viewModel.shipment_status_label}</Badge>
              </div>
            </div>
            <div className="grid w-full max-w-sm gap-3 sm:grid-cols-2 md:w-auto md:max-w-md">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Shipment date</div>
                <div className="mt-1 text-sm font-medium text-slate-900">{fmtDate(viewModel.shipment_date)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Last updated</div>
                <div className="mt-1 text-sm font-medium text-slate-900">{fmtDateTime(viewModel.last_updated_at)}</div>
              </div>
            </div>
          </div>
        </header>

        {uploaded ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Document uploaded successfully.
          </div>
        ) : null}

        <div className="sticky top-2 z-20 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {MAIN_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <Link
                  key={tab.id}
                  href={hrefFor({ tab: tab.id, trackingTab: "overview", region: null, truck: null })}
                  className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
          {activeTab === "tracking" ? (
            <div className="mt-2 flex gap-2 overflow-x-auto border-t border-slate-200 pt-2">
              {TRACKING_TABS.map((tab) => {
                const active = activeTrackingTab === tab.id;
                return (
                  <Link
                    key={tab.id}
                    href={hrefFor({ tab: "tracking", trackingTab: tab.id, region: tab.id === "international" ? activeRegion : null })}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                      active
                        ? "bg-emerald-100 text-emerald-900"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
        {previousStepHref ? (
          <Link
            href={previousStepHref}
            className="fixed bottom-4 right-4 z-40 inline-flex rounded-full border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 sm:hidden"
          >
            Back
          </Link>
        ) : null}
        {activeTab === "overview" ? (
          <section className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className={`${headingFont.className} text-xl font-semibold text-slate-900`}>Route timeline</h2>
                <div className="text-xs text-slate-500">Tap any region for detailed checkpoints</div>
              </div>
              <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
                {viewModel.region_lanes.map((lane, index) => (
                  <div key={lane.id} className="flex items-center gap-2">
                    <Link
                      href={`${hrefFor({ tab: "tracking", trackingTab: "international", region: lane.id })}#region-${lane.id}`}
                      className={`min-w-28 rounded-2xl border px-3 py-2 text-left text-xs font-semibold shadow-sm transition hover:brightness-95 ${laneTone(
                        lane.tone,
                      )}`}
                    >
                      <div>{lane.label}</div>
                      <div className="mt-1 text-[11px] opacity-80">{lane.latest_timestamp ? fmtDate(lane.latest_timestamp) : "Pending"}</div>
                    </Link>
                    {index < viewModel.region_lanes.length - 1 ? <span className="text-slate-300">&gt;</span> : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2 sm:p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Shipment checkpoints</h3>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {viewModel.compact_checkpoints.map((checkpoint) => (
                    <div key={checkpoint.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-xs font-semibold text-slate-700">{checkpoint.label}</div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                        <Badge tone={progressTone(checkpoint.state)}>{progressLabel(checkpoint.state)}</Badge>
                        <span>{checkpoint.timestamp ? fmtDateTime(checkpoint.timestamp) : "-"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Cargo summary</h3>
                <dl className="mt-3 space-y-3 text-sm">
                  <div>
                    <dt className="text-slate-500">Description</dt>
                    <dd className="font-medium text-slate-900">{viewModel.cargo.description}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Total weight</dt>
                    <dd className="font-medium text-slate-900">{viewModel.cargo.total_weight_kg} kg</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Total packages</dt>
                    <dd className="font-medium text-slate-900">{viewModel.cargo.total_quantity_label}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "tracking" && activeTrackingTab === "overview" ? (
          <section className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className={`${headingFont.className} text-xl font-semibold text-slate-900`}>Shipment status</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {viewModel.status_chips.map((chip) => (
                  <div key={chip.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs font-semibold text-slate-700">{chip.label}</div>
                    <div className="mt-1">
                      <Badge tone={progressTone(chip.state)}>{progressLabel(chip.state)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className={`${headingFont.className} text-lg font-semibold text-slate-900`}>Trucks details</h3>
                  <Badge tone="zinc">{viewModel.trucks_overview.length} truck(s)</Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Truck</th>
                        <th className="px-2 py-2">Trailer</th>
                        <th className="px-2 py-2">Driver</th>
                        <th className="px-2 py-2">Booking</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewModel.trucks_overview.map((row) => (
                        <tr key={row.index} className="border-t border-slate-200">
                          <td className="px-2 py-2 font-medium text-slate-900">{row.truck_number}</td>
                          <td className="px-2 py-2 text-slate-700">{row.trailer_type}</td>
                          <td className="px-2 py-2 text-slate-700">{row.driver_summary}</td>
                          <td className="px-2 py-2 text-slate-700">{row.booking_status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Expected loading date</h3>
                  <p className="mt-2 text-sm font-medium text-slate-900">{viewModel.expected_loading_date_label ?? "Pending"}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Actual loading date</h3>
                  <p className="mt-2 text-sm font-medium text-slate-900">{viewModel.actual_loading_date_label ?? "Pending"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h3 className={`${headingFont.className} text-lg font-semibold text-slate-900`}>
                Current timeline
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {viewModel.compact_checkpoints.map((checkpoint) => (
                  <div key={`tracking-overview-${checkpoint.id}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs font-semibold text-slate-700">{checkpoint.label}</div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <Badge tone={progressTone(checkpoint.state)}>{progressLabel(checkpoint.state)}</Badge>
                      <div className="text-xs text-slate-500">
                        {checkpoint.timestamp ? fmtDateTime(checkpoint.timestamp) : "-"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "tracking" && activeTrackingTab === "loading" ? (
          <section className="grid gap-4 md:grid-cols-2">
            {viewModel.loading_cards.map((truck) => (
              <article key={truck.index} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className={`${headingFont.className} text-lg font-semibold text-slate-900`}>{truck.truck_reference}</h3>
                    <p className="text-sm text-slate-600">Truck: {truck.truck_number} - {truck.trailer_type}</p>
                  </div>
                  <Badge tone={truck.status === "Loaded" ? "green" : "zinc"}>{truck.status}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-slate-500">Loading origin</dt>
                    <dd className="font-medium text-slate-900">{truck.loading_origin}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Actual loading date</dt>
                    <dd className="font-medium text-slate-900">{fmtDate(truck.actual_loading_date)}</dd>
                  </div>
                  {truck.supplier_name ? (
                    <div className="col-span-2">
                      <dt className="text-slate-500">Supplier</dt>
                      <dd className="font-medium text-slate-900">{truck.supplier_name}</dd>
                    </div>
                  ) : null}
                  {truck.supplier_location ? (
                    <div className="col-span-2">
                      <dt className="text-slate-500">Supplier location</dt>
                      <dd className="font-medium text-slate-900">{truck.supplier_location}</dd>
                    </div>
                  ) : null}
                </dl>
                <Link
                  href={`${hrefFor({ tab: "cargo", truck: truck.index })}#truck-${truck.index}`}
                  className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  View loading details
                </Link>
              </article>
            ))}
          </section>
        ) : null}
        {activeTab === "tracking" && activeTrackingTab === "international" ? (
          <section className="space-y-4">
            {viewModel.international_regions.map((region) => {
              const highlighted = activeRegion === region.id;
              return (
                <article
                  key={region.id}
                  id={`region-${region.id}`}
                  className={`scroll-mt-[35vh] rounded-3xl border bg-white p-4 shadow-sm sm:p-5 ${
                    highlighted ? "border-emerald-300 ring-2 ring-emerald-100" : "border-slate-200"
                  }`}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className={`${headingFont.className} text-lg font-semibold text-slate-900`}>{region.label} ({region.code})</h3>
                    <Badge tone={progressTone(region.state)}>{progressLabel(region.state)}</Badge>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        <tr>
                          <th className="px-2 py-2">Checkpoint</th>
                          <th className="px-2 py-2">Location</th>
                          <th className="px-2 py-2">Status</th>
                          <th className="px-2 py-2">Timestamp</th>
                          <th className="px-2 py-2">File</th>
                        </tr>
                      </thead>
                      <tbody>
                        {region.events.map((event) => (
                          <tr key={`${region.id}-${event.id}`} className="border-t border-slate-200">
                            <td className="px-2 py-2 font-medium text-slate-900">{event.label}</td>
                            <td className="px-2 py-2 text-slate-700">{event.location}</td>
                            <td className="px-2 py-2"><Badge tone={progressTone(event.state)}>{progressLabel(event.state)}</Badge></td>
                            <td className="px-2 py-2 text-slate-700">{fmtDateTime(event.timestamp)}</td>
                            <td className="px-2 py-2 text-slate-700">
                              {event.file ? (
                                <a href={`/api/track/${token}/documents/${event.file.id}`} className="font-medium text-slate-700 hover:underline">Download</a>
                              ) : (
                                "-"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}

        {activeTab === "documents" ? (
          <section className="space-y-4">
            <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className={`${headingFont.className} text-xl font-semibold text-slate-900`}>Warehouse</h2>
              <div className="mt-3 space-y-2">
                {viewModel.documents.warehouse.map((doc) => (
                  <div key={doc.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{doc.label}</div>
                        {doc.reason ? <div className="mt-1 text-xs text-slate-500">{doc.reason}</div> : null}
                      </div>
                      <Badge tone={availabilityTone(doc.status)}>{availabilityLabel(doc.status)}</Badge>
                    </div>
                    {doc.file ? (
                      <a href={`/api/track/${token}/documents/${doc.file.id}`} className="mt-2 inline-flex text-xs font-semibold text-slate-700 underline-offset-4 hover:underline">
                        Download {doc.file.file_name}
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className={`${headingFont.className} text-xl font-semibold text-slate-900`}>Export Invoice</h2>
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{viewModel.documents.export_invoice.label}</div>
                    {viewModel.documents.export_invoice.reason ? (
                      <div className="mt-1 text-xs text-slate-500">{viewModel.documents.export_invoice.reason}</div>
                    ) : null}
                  </div>
                  <Badge tone={availabilityTone(viewModel.documents.export_invoice.status)}>{availabilityLabel(viewModel.documents.export_invoice.status)}</Badge>
                </div>
                {viewModel.documents.export_invoice.file ? (
                  <a href={`/api/track/${token}/documents/${viewModel.documents.export_invoice.file.id}`} className="mt-2 inline-flex text-xs font-semibold text-slate-700 underline-offset-4 hover:underline">
                    Download {viewModel.documents.export_invoice.file.file_name}
                  </a>
                ) : null}
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className={`${headingFont.className} text-xl font-semibold text-slate-900`}>Customs Declaration</h2>
              <div className="mt-3 space-y-2">
                {viewModel.documents.customs.map((doc) => (
                  <div key={doc.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{doc.label}</div>
                        {doc.reason ? <div className="mt-1 text-xs text-slate-500">{doc.reason}</div> : null}
                      </div>
                      <Badge tone={availabilityTone(doc.status)}>{availabilityLabel(doc.status)}</Badge>
                    </div>
                    {doc.details.length ? (
                      <div className="mt-2 space-y-1 text-xs text-slate-600">
                        {doc.details.map((detail, index) => (
                          <div key={`${doc.id}-${index}`}>{detail}</div>
                        ))}
                      </div>
                    ) : null}
                    {doc.file ? (
                      <a href={`/api/track/${token}/documents/${doc.file.id}`} className="mt-2 inline-flex text-xs font-semibold text-slate-700 underline-offset-4 hover:underline">
                        Download {doc.file.file_name}
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "cargo" ? (
          <section className="space-y-4">
            <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className={`${headingFont.className} text-xl font-semibold text-slate-900`}>Reference import shipment details</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Import reference</th>
                      <th className="px-2 py-2">BOE</th>
                      <th className="px-2 py-2">Cargo description</th>
                      <th className="px-2 py-2">Allocated quantity</th>
                      <th className="px-2 py-2">Allocated weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModel.cargo.import_references.map((row) => (
                      <tr key={`import-${row.index}`} className="border-t border-slate-200">
                        <td className="px-2 py-2 font-medium text-slate-900">{row.import_reference}</td>
                        <td className="px-2 py-2 text-slate-700">{row.boe}</td>
                        <td className="px-2 py-2 text-slate-700">{row.cargo_description}</td>
                        <td className="px-2 py-2 text-slate-700">{row.allocated_quantity} {row.package_type}</td>
                        <td className="px-2 py-2 text-slate-700">{row.allocated_weight} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className={`${headingFont.className} text-xl font-semibold text-slate-900`}>Cargo allocation (truck-wise)</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Truck</th>
                      <th className="px-2 py-2">Loading origin</th>
                      <th className="px-2 py-2">Quantity</th>
                      <th className="px-2 py-2">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModel.cargo.truck_allocations.map((row) => (
                      <tr id={`truck-${row.index}`} key={`truck-allocation-${row.index}`} className={`scroll-mt-[35vh] border-t border-slate-200 ${activeTruck === row.index ? "bg-emerald-50" : ""}`}>
                        <td className="px-2 py-2 font-medium text-slate-900">{row.truck_reference}</td>
                        <td className="px-2 py-2 text-slate-700">{row.loading_origin}</td>
                        <td className="px-2 py-2 text-slate-700">{row.quantity_label}</td>
                        <td className="px-2 py-2 text-slate-700">{row.weight_kg} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <h2 className={`${headingFont.className} text-xl font-semibold text-slate-900`}>Totals</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total loaded quantity</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{viewModel.cargo.loaded_total_quantity_label}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total loaded weight</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{viewModel.cargo.loaded_total_weight_kg} kg</div>
                </div>
              </div>
            </article>
          </section>
        ) : null}

        {hasConnected || hasUpdates || hasRequests ? (
          <section className="space-y-3">
            {hasConnected ? (
              <details className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                  Connected shipments ({connectedShipments.length})
                </summary>
                <div className="mt-3 space-y-2 text-sm">
                  {connectedShipments.map((connected) => (
                    <div key={connected.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div>
                        <div className="font-medium text-slate-900">{connected.shipment_code}</div>
                        <div className="text-xs text-slate-500">{connected.origin} - {connected.destination}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone="zinc">{overallStatusLabel(connected.overall_status)}</Badge>
                        {connected.tracking_token ? <Link href={`/track/${connected.tracking_token}`} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Open</Link> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            {hasUpdates ? (
              <details className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                  Updates ({exceptions.length})
                </summary>
                <div className="mt-3 space-y-2">
                  {exceptions.map((exception) => (
                    <div key={exception.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-slate-900">{exception.exception_name}</div>
                        <Badge tone={exceptionTone(exception.default_risk)}>{exception.default_risk === "BLOCKED" ? "Blocked" : "At risk"}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{fmtDateTime(exception.created_at)}</div>
                      <div className="mt-1 text-sm text-slate-700">{exception.customer_message ?? "Our team is working on this update."}</div>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}

            {hasRequests ? (
              <details className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                  Requested documents ({openRequests.length})
                </summary>
                <div className="mt-3 space-y-3">
                  {openRequests.map((request) => (
                    <div key={request.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-sm font-medium text-slate-900">{request.document_type}</div>
                      {request.message ? <div className="mt-1 text-sm text-slate-600">{request.message}</div> : null}
                      <form action={uploadRequestedDocAction.bind(null, request.id)} className="mt-3 flex flex-wrap gap-2">
                        <input name="file" type="file" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" required />
                        <SubmitButton pendingLabel="Uploading..." className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">Upload</SubmitButton>
                      </form>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </section>
        ) : null}

        <div className="pb-4 text-center text-xs text-slate-500">
          <form action={logoutTrackingAction}>
            <button type="submit" className="font-medium text-slate-600 hover:underline">Not you? Re-verify</button>
          </form>
          <div className="mt-2">Powered by Logistic - <Link href="/" className="hover:underline">Staff login</Link></div>
        </div>
      </div>
    </div>
  );
}
