"use client";
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
import { ShipmentJourneyMap } from "./ShipmentJourneyMap";
import {
  Map as MapIcon,
  Truck,
  Clock,
  LogOut,
  Info,
  CalendarDays,
  Activity,
  FileText,
  Package,
} from "lucide-react";

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

function exceptionTone(risk: string) {
  if (risk === "BLOCKED") return "red";
  if (risk === "AT_RISK") return "yellow";
  return "zinc";
}

const MAIN_TABS: Array<{ id: FtlClientTrackingTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "Documents" },
  { id: "cargo", label: "Cargo Details" },
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

  return (
    <div className={`${bodyFont.className} min-h-screen pb-24 sm:pb-10 relative overflow-hidden bg-slate-50`}>
      {/* Decorative background blobs */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-200/20 blur-3xl pointer-events-none" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-200/20 blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-10 z-10">
        {activeTab === "overview" ? null : (
          <header className="rounded-[2rem] border border-white/60 bg-white/60 backdrop-blur-xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-7 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-blue-500" />
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-600 flex items-center gap-1.5 mb-1.5">
                  <Truck className="w-3.5 h-3.5" /> Shipment Tracking
                </p>
                <h1 className={`${headingFont.className} text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl`}>
                  {shipmentCode}
                </h1>
                <p className="mt-2 text-sm font-medium text-slate-600 flex items-center gap-1.5">
                  <MapIcon className="w-4 h-4 text-slate-400" /> {viewModel.route_label}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone="zinc">{viewModel.service_type_label}</Badge>
                  <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-900 focus:ring-offset-2">
                    <span className="mr-1.5 flex h-2 w-2 rounded-full bg-blue-500"></span>
                    {viewModel.shipment_status_label}
                  </div>
                </div>
              </div>
              <div className="grid w-full gap-3 grid-cols-2 md:w-auto md:max-w-md">
                <div className="rounded-2xl border border-white/40 bg-white/50 px-4 py-3 backdrop-blur-md shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Shipment date</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">{fmtDate(viewModel.shipment_date)}</div>
                </div>
                <div className="rounded-2xl border border-white/40 bg-white/50 px-4 py-3 backdrop-blur-md shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Last updated</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">{fmtDateTime(viewModel.last_updated_at)}</div>
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Sticky Bottom Navbar */}
        <div className="fixed bottom-0 left-0 right-0 z-50 sm:sticky sm:top-2 sm:bottom-auto px-4 pb-6 pt-2 sm:p-0 sm:pb-0 pointer-events-none mt-6 sm:mt-0">
          <div className="mx-auto max-w-md sm:max-w-none pointer-events-auto">
            <div className="rounded-[2rem] sm:rounded-2xl border border-slate-200/60 sm:border-slate-200 bg-white/80 p-2 shadow-[0_-8px_30px_rgb(0,0,0,0.08)] sm:shadow-sm backdrop-blur-xl">
              <div className="flex justify-around sm:justify-start gap-1 sm:gap-2">
                {MAIN_TABS.map((tab) => {
                  const active = activeTab === tab.id;
                  const Icon = tab.id === "overview" ? Activity : tab.id === "documents" ? FileText : Package;
                  return (
                    <Link
                      key={tab.id}
                      href={hrefFor({ tab: tab.id, trackingTab: "overview", region: null, truck: null })}
                      className={`flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-1 sm:gap-2 rounded-2xl sm:rounded-xl px-3 sm:px-4 py-2 text-[10px] sm:text-sm font-bold transition-all sm:flex-1 md:flex-none ${active
                        ? "bg-slate-900 text-white shadow-md scale-105 sm:scale-100"
                        : "text-slate-500 hover:bg-slate-100/50 hover:text-slate-900"
                        }`}
                    >
                      <Icon className={`w-5 h-5 sm:w-4 sm:h-4 ${active ? "text-emerald-400 sm:text-emerald-300" : ""}`} />
                      <span className="tracking-tight">{tab.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {activeTab === "overview" ? (
          <section className="mb-8">
            <ShipmentJourneyMap viewModel={viewModel} />
          </section>
        ) : null}

        {activeTab === "documents" ? (
          <section className="mt-8 space-y-6">
            <div className="rounded-[2rem] border border-white/60 bg-white/60 backdrop-blur-xl p-5 shadow-sm sm:p-7 relative overflow-hidden">
              <h2 className={`${headingFont.className} text-xl font-bold text-slate-900 mb-6 flex items-center gap-2`}><FileText className="w-5 h-5 text-emerald-500" /> Essential Documents</h2>

              <div className="space-y-6">
                {/* Warehouse Docs */}
                {viewModel.documents.warehouse.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 mb-3">Warehouse Documents</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {viewModel.documents.warehouse.map((doc) => (
                        <div key={doc.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                          <div className="flex justify-between items-start mb-2">
                            <div className="font-semibold text-slate-900">{doc.label}</div>
                            <Badge tone={availabilityTone(doc.status)}>{availabilityLabel(doc.status)}</Badge>
                          </div>
                          {doc.reason ? <div className="text-xs text-slate-500 mb-3">{doc.reason}</div> : null}
                          {doc.file ? (
                            <a href={`/api/track/${token}/documents/${doc.file.id}`} className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition">
                              Download File
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Export Invoice */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 mb-3">Export Invoice</h3>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md max-w-md">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-semibold text-slate-900">{viewModel.documents.export_invoice.label}</div>
                      <Badge tone={availabilityTone(viewModel.documents.export_invoice.status)}>{availabilityLabel(viewModel.documents.export_invoice.status)}</Badge>
                    </div>
                    {viewModel.documents.export_invoice.reason ? <div className="text-xs text-slate-500 mb-3">{viewModel.documents.export_invoice.reason}</div> : null}
                    {viewModel.documents.export_invoice.file ? (
                      <a href={`/api/track/${token}/documents/${viewModel.documents.export_invoice.file.id}`} className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition">
                        Download Invoice
                      </a>
                    ) : null}
                  </div>
                </div>

                {/* Customs Declarations */}
                {viewModel.documents.customs.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-slate-200/60">
                    <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 mb-3">Customs Declarations</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {viewModel.documents.customs.map((doc) => (
                        <div key={doc.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
                          <div className="flex justify-between items-start mb-2">
                            <div className="font-semibold text-slate-900">{doc.label}</div>
                            <Badge tone={availabilityTone(doc.status)}>{availabilityLabel(doc.status)}</Badge>
                          </div>
                          {doc.reason ? <div className="text-xs text-slate-500 mb-2">{doc.reason}</div> : null}
                          {doc.details.length ? (
                            <div className="mb-3 space-y-1 text-xs text-slate-600">
                              {doc.details.map((detail, index) => (
                                <div key={`${doc.id}-${index}`}>{detail}</div>
                              ))}
                            </div>
                          ) : null}
                          {doc.file ? (
                            <a href={`/api/track/${token}/documents/${doc.file.id}`} className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition">
                              Download File
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "cargo" ? (
          <section className="mt-8 space-y-6">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-[2rem] border border-white/60 bg-white/60 backdrop-blur-xl p-5 shadow-sm sm:p-7 relative overflow-hidden lg:col-span-2">
                <h2 className={`${headingFont.className} text-xl font-bold text-slate-900 mb-6 flex items-center gap-2`}><Package className="w-5 h-5 text-emerald-500" /> Cargo Details</h2>

                {/* Reference Import Shipment Details */}
                {viewModel.cargo.import_references.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 mb-3">Reference Import Shipment Details</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-3 font-semibold">Import Reference</th>
                            <th className="px-3 py-3 font-semibold">BOE</th>
                            <th className="px-3 py-3 font-semibold">Cargo Description</th>
                            <th className="px-3 py-3 font-semibold">Allocated Qty</th>
                            <th className="px-3 py-3 font-semibold text-right">Allocated Wgt</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {viewModel.cargo.import_references.map((row) => (
                            <tr key={`import-${row.index}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-3 py-4 font-medium text-slate-900 whitespace-nowrap">{row.import_reference}</td>
                              <td className="px-3 py-4 text-slate-600">{row.boe}</td>
                              <td className="px-3 py-4 text-slate-600">{row.cargo_description}</td>
                              <td className="px-3 py-4 text-slate-600 whitespace-nowrap">{row.allocated_quantity} {row.package_type}</td>
                              <td className="px-3 py-4 text-emerald-700 font-semibold text-right whitespace-nowrap">{row.allocated_weight} kg</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 mb-3">Cargo Allocation (Truck-wise)</h3>
                {viewModel.cargo.truck_allocations.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-3 font-semibold">Truck</th>
                          <th className="px-3 py-3 font-semibold">Loading Origin</th>
                          <th className="px-3 py-3 font-semibold">Quantity</th>
                          <th className="px-3 py-3 font-semibold text-right">Weight</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {viewModel.cargo.truck_allocations.map((row) => (
                          <tr key={`truck-allocation-${row.index}`} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-3 py-4 font-medium text-slate-900 whitespace-nowrap">{row.truck_reference}</td>
                            <td className="px-3 py-4 text-slate-600">{row.loading_origin}</td>
                            <td className="px-3 py-4 text-slate-600 whitespace-nowrap">{row.quantity_label}</td>
                            <td className="px-3 py-4 text-emerald-700 font-semibold text-right whitespace-nowrap">{row.weight_kg} kg</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 italic">No truck allocations available yet.</p>
                )}
              </div>
              <div className="rounded-[2rem] border border-emerald-900/5 bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-5 shadow-sm sm:p-7 h-fit">
                <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-800 mb-4">Total Cargo Summary</h3>
                <dl className="space-y-4">
                  <div className="bg-white/60 rounded-xl p-3 backdrop-blur-sm border border-white">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-600">Total Quantity</dt>
                    <dd className="mt-1 text-lg font-bold text-emerald-950">{viewModel.cargo.loaded_total_quantity_label || viewModel.cargo.total_quantity_label}</dd>
                  </div>
                  <div className="bg-white/60 rounded-xl p-3 backdrop-blur-sm border border-white">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-600">Total Weight</dt>
                    <dd className="mt-1 text-lg font-bold text-blue-950">{viewModel.cargo.loaded_total_weight_kg || viewModel.cargo.total_weight_kg} kg</dd>
                  </div>
                  <div className="pt-2">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Description</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-800">{viewModel.cargo.description}</dd>
                  </div>
                </dl>
              </div>
            </div>
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

        <div className="pb-8 pt-4 text-center">
          <form action={logoutTrackingAction}>
            <button type="submit" className="inline-flex items-center justify-center gap-1.5 text-xs font-bold tracking-wide text-slate-500 hover:text-slate-900 transition-colors bg-white/50 backdrop-blur px-4 py-2 rounded-full border border-slate-200/60 shadow-sm">
              <LogOut className="w-3.5 h-3.5" /> Not you? Sign out
            </button>
          </form>
          <div className="mt-4 text-[10px] font-medium text-slate-400 uppercase tracking-widest flex items-center justify-center gap-1">
            <Info className="w-3 h-3" /> Powered by <Link href="/" className="text-slate-500 hover:text-slate-900 transition-colors font-bold">Logistic</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
