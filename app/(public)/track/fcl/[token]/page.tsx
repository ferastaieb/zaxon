import { notFound } from "next/navigation";
import { IBM_Plex_Sans, Space_Grotesk } from "next/font/google";

import { Badge } from "@/components/ui/Badge";
import { getTrackingShipment } from "@/lib/data/tracking";
import { listShipmentSteps } from "@/lib/data/shipments";
import { overallStatusLabel, stepStatusLabel, type StepStatus } from "@/lib/domain";
import { parseStepFieldValues } from "@/lib/stepFields";
import { FCL_IMPORT_STEP_NAMES } from "@/lib/fclImport/constants";
import {
  extractContainerNumbers,
  normalizeContainerNumbers,
  normalizeContainerRows,
} from "@/lib/fclImport/helpers";

const headingFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

type TrackPageProps = {
  params: Promise<{ token: string }>;
};

function statusTone(status: StepStatus) {
  if (status === "DONE") return "green";
  if (status === "IN_PROGRESS") return "blue";
  if (status === "BLOCKED") return "red";
  return "zinc";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

export default async function FclTrackingPage({ params }: TrackPageProps) {
  const { token } = await params;
  const shipment = await getTrackingShipment(token);
  if (!shipment) notFound();

  const steps = await listShipmentSteps(shipment.id);
  const stepByName = new Map(steps.map((step) => [step.name, step]));

  const creationStep = stepByName.get(FCL_IMPORT_STEP_NAMES.shipmentCreation);
  let containerNumbers = extractContainerNumbers(
    parseStepFieldValues(creationStep?.field_values_json),
  );
  containerNumbers = normalizeContainerNumbers(containerNumbers);

  const vesselStep = stepByName.get(FCL_IMPORT_STEP_NAMES.vesselTracking);
  const dischargeStep = stepByName.get(FCL_IMPORT_STEP_NAMES.containersDischarge);
  const pullOutStep = stepByName.get(FCL_IMPORT_STEP_NAMES.containerPullOut);
  const deliveryStep = stepByName.get(FCL_IMPORT_STEP_NAMES.containerDelivery);

  const vesselValues = parseStepFieldValues(vesselStep?.field_values_json);
  const dischargeRows = normalizeContainerRows(
    containerNumbers,
    parseStepFieldValues(dischargeStep?.field_values_json),
  );
  const pullOutRows = normalizeContainerRows(
    containerNumbers,
    parseStepFieldValues(pullOutStep?.field_values_json),
  );
  const deliveryRows = normalizeContainerRows(
    containerNumbers,
    parseStepFieldValues(deliveryStep?.field_values_json),
  );

  const vesselEta = typeof vesselValues.eta === "string" ? vesselValues.eta : "";
  const vesselAta = typeof vesselValues.ata === "string" ? vesselValues.ata : "";
  const vesselLabel = vesselAta
    ? "Vessel arrived"
    : vesselEta
      ? "Vessel sailing"
      : "ETA pending";

  return (
    <div className={`${bodyFont.className} min-h-screen bg-slate-50`}>
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Shipment tracking
          </div>
          <h1
            className={`${headingFont.className} mt-2 text-3xl font-semibold text-slate-900`}
          >
            {shipment.shipment_code}
          </h1>
          <div className="mt-2 text-sm text-slate-600">
            {shipment.origin} to {shipment.destination}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Badge tone="zinc">{overallStatusLabel(shipment.overall_status)}</Badge>
            <span className="text-xs text-slate-400">
              Updated {new Date(shipment.last_update_at).toLocaleString()}
            </span>
          </div>
        </header>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className={`${headingFont.className} text-2xl font-semibold text-slate-900`}>
              Tracking milestones
            </h2>
            <span className="text-sm text-slate-500">Client view</span>
          </div>

          <div className="grid gap-4">
            {vesselStep ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Step 1
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      Vessel tracking
                    </div>
                    <div className="mt-1 text-sm text-slate-600">{vesselLabel}</div>
                  </div>
                  <Badge tone={statusTone(vesselStep.status)}>
                    {stepStatusLabel(vesselStep.status)}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    ETA: {formatDate(vesselEta)}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    ATA: {formatDate(vesselAta)}
                  </div>
                </div>
              </div>
            ) : null}

            {dischargeStep ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Step 2
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      Containers discharge
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Summary of discharged containers and port free days.
                    </div>
                  </div>
                  <Badge tone={statusTone(dischargeStep.status)}>
                    {stepStatusLabel(dischargeStep.status)}
                  </Badge>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-sm text-slate-700">
                    <thead className="bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Container</th>
                        <th className="px-3 py-2">Discharge date</th>
                        <th className="px-3 py-2">Last port free day</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dischargeRows.map((row, index) => (
                        <tr key={`discharge-row-${index}`} className="border-t border-slate-200">
                          <td className="px-3 py-2 font-medium text-slate-900">
                            {row.container_number || `#${index + 1}`}
                          </td>
                          <td className="px-3 py-2">
                            {formatDate(row.container_discharged_date)}
                          </td>
                          <td className="px-3 py-2">
                            {formatDate(row.last_port_free_day)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {pullOutStep ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Step 3
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      Container pull-out from port
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Pull-out updates appear once BOE is confirmed.
                    </div>
                  </div>
                  <Badge tone={statusTone(pullOutStep.status)}>
                    {stepStatusLabel(pullOutStep.status)}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3">
                  {pullOutRows.map((row, index) => (
                    <div
                      key={`pullout-row-${index}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
                    >
                      <div className="font-medium text-slate-900">
                        {row.container_number || `#${index + 1}`}
                      </div>
                      <div className="mt-1">
                        Pull-out date: {formatDate(row.pull_out_date)}
                      </div>
                      <div>Destination: {row.pull_out_destination || "N/A"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {deliveryStep ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Step 4
                    </div>
                    <div className="mt-2 text-lg font-semibold text-slate-900">
                      Container delivered or offloaded
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Track delivery, offload, and empty returns.
                    </div>
                  </div>
                  <Badge tone={statusTone(deliveryStep.status)}>
                    {stepStatusLabel(deliveryStep.status)}
                  </Badge>
                </div>
                <div className="mt-4 grid gap-3">
                  {deliveryRows.map((row, index) => (
                    <div
                      key={`delivery-row-${index}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"
                    >
                      <div className="font-medium text-slate-900">
                        {row.container_number || `#${index + 1}`}
                      </div>
                      <div className="mt-1">
                        Offload or delivery date: {formatDate(row.delivered_offloaded_date)}
                      </div>
                      <div>Empty return date: {formatDate(row.empty_returned_date)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
