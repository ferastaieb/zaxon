import { SubmitButton } from "@/components/ui/SubmitButton";
import { Badge } from "@/components/ui/Badge";
import {
  encodeFieldPath,
  parseStepFieldSchema,
  parseStepFieldValues,
  schemaFromLegacyFields,
  stepFieldDocType,
  type StepFieldDefinition,
  type StepFieldValues,
} from "@/lib/stepFields";
import {
  overallStatusLabel,
  stepStatusLabel,
  type StepStatus,
} from "@/lib/domain";
import type { TrackingShipment } from "@/lib/data/tracking";

type LegacyStep = {
  id: number;
  sort_order: number;
  name: string;
  status: StepStatus;
  started_at: string | null;
  completed_at: string | null;
  is_external: 0 | 1;
  field_schema_json: string;
  field_values_json: string;
  required_fields_json: string;
};

type LegacyDoc = {
  id: number;
  document_type: string;
  file_name: string;
  uploaded_at: string;
};

type LegacyRequest = {
  id: number;
  document_type: string;
  message: string | null;
  status: "OPEN" | "FULFILLED";
  requested_at: string;
  fulfilled_at: string | null;
};

type LegacyException = {
  id: number;
  status: "OPEN" | "RESOLVED";
  created_at: string;
  exception_name: string;
  default_risk: string;
  customer_message: string | null;
};

type LegacyTrackViewProps = {
  token: string;
  shipment: TrackingShipment;
  uploaded: boolean;
  steps: LegacyStep[];
  docs: LegacyDoc[];
  requests: LegacyRequest[];
  exceptions: LegacyException[];
  uploadRequestedDocAction: (requestId: number, formData: FormData) => Promise<void>;
};

type StepFieldRow = {
  label: string;
  value: string;
  docId?: number;
};

function readFriendlyDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function readFriendlyDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function stepTone(status: StepStatus) {
  if (status === "DONE") return "green";
  if (status === "IN_PROGRESS") return "blue";
  if (status === "BLOCKED") return "red";
  return "zinc";
}

function exceptionTone(risk: string) {
  if (risk === "BLOCKED") return "red";
  if (risk === "AT_RISK") return "yellow";
  return "zinc";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function isStringValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTruthyBooleanValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function formatFieldValue(type: "text" | "number" | "date", value: string) {
  if (type !== "date") return value;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function parseLegacyFields(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function getStepFieldSchema(step: {
  field_schema_json: string;
  required_fields_json: string;
}) {
  const schema = parseStepFieldSchema(step.field_schema_json);
  if (schema.fields.length > 0) return schema;
  const legacyFields = parseLegacyFields(step.required_fields_json);
  if (legacyFields.length > 0) return schemaFromLegacyFields(legacyFields);
  return schema;
}

function collectStepFieldRows(input: {
  fields: StepFieldDefinition[];
  values: StepFieldValues;
  labelPath: string[];
  valuePath: string[];
  stepId: number;
  docByType: Map<string, { id: number; file_name: string }>;
}): StepFieldRow[] {
  const rows: StepFieldRow[] = [];

  for (const field of input.fields) {
    const labels = [...input.labelPath, field.label];
    const path = [...input.valuePath, field.id];
    const fieldValue = input.values[field.id];

    if (field.type === "text" || field.type === "number" || field.type === "date") {
      if (isStringValue(fieldValue)) {
        rows.push({
          label: labels.join(" / "),
          value: formatFieldValue(field.type, fieldValue.trim()),
        });
      }
      continue;
    }

    if (field.type === "boolean") {
      if (isTruthyBooleanValue(fieldValue)) {
        rows.push({
          label: labels.join(" / "),
          value: "Yes",
        });
      }
      continue;
    }

    if (field.type === "file") {
      const docType = stepFieldDocType(input.stepId, encodeFieldPath(path));
      const doc = input.docByType.get(docType);
      if (doc) {
        rows.push({
          label: labels.join(" / "),
          value: doc.file_name,
          docId: doc.id,
        });
      }
      continue;
    }

    if (field.type === "shipment_goods") {
      const entries = isPlainObject(fieldValue) ? Object.values(fieldValue) : [];
      if (entries.some(isStringValue)) {
        rows.push({
          label: labels.join(" / "),
          value: "Allocated",
        });
      }
      continue;
    }

    if (field.type === "group") {
      if (field.repeatable) {
        const items = Array.isArray(fieldValue) ? fieldValue : [];
        items.forEach((item, index) => {
          if (!isPlainObject(item)) return;
          rows.push(
            ...collectStepFieldRows({
              fields: field.fields,
              values: item as StepFieldValues,
              labelPath: [...labels, `Item ${index + 1}`],
              valuePath: [...path, String(index)],
              stepId: input.stepId,
              docByType: input.docByType,
            }),
          );
        });
      } else if (isPlainObject(fieldValue)) {
        rows.push(
          ...collectStepFieldRows({
            fields: field.fields,
            values: fieldValue as StepFieldValues,
            labelPath: labels,
            valuePath: path,
            stepId: input.stepId,
            docByType: input.docByType,
          }),
        );
      }
      continue;
    }

    if (field.type === "choice") {
      const choiceValues = isPlainObject(fieldValue) ? fieldValue : {};
      for (const option of field.options) {
        const optionValue = choiceValues[option.id];
        const optionRows = collectStepFieldRows({
          fields: option.fields,
          values: isPlainObject(optionValue) ? (optionValue as StepFieldValues) : {},
          labelPath: [...labels, option.label],
          valuePath: [...path, option.id],
          stepId: input.stepId,
          docByType: input.docByType,
        });
        if (optionRows.length) {
          rows.push(...optionRows);
        }
      }
    }
  }

  return rows;
}

function sectionCardClassName() {
  return "rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm sm:p-6";
}

function renderStepSection(input: {
  token: string;
  title: string;
  emptyLabel: string;
  steps: LegacyStep[];
  docByType: Map<string, { id: number; file_name: string }>;
}) {
  return (
    <section className={sectionCardClassName()}>
      <h2 className="text-lg font-semibold text-stone-950">{input.title}</h2>
      <div className="mt-4 space-y-3">
        {input.steps.map((step) => {
          const fieldSchema = getStepFieldSchema(step);
          const fieldValues = parseStepFieldValues(step.field_values_json);
          const rows = collectStepFieldRows({
            fields: fieldSchema.fields,
            values: fieldValues,
            labelPath: [],
            valuePath: [],
            stepId: step.id,
            docByType: input.docByType,
          });

          return (
            <div
              key={step.id}
              className="rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-stone-950">
                    {step.sort_order}. {step.name}
                  </div>
                  <div className="mt-1 text-xs text-stone-500">
                    Updated {readFriendlyDateTime(step.completed_at ?? step.started_at)}
                  </div>
                </div>
                <Badge tone={stepTone(step.status)}>{stepStatusLabel(step.status)}</Badge>
              </div>

              {rows.length ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {rows.map((row, index) => (
                    <div
                      key={`${step.id}-row-${index}`}
                      className="rounded-2xl border border-stone-200 bg-white px-3 py-3"
                    >
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
                        {row.label}
                      </div>
                      {row.docId ? (
                        <a
                          href={`/api/track/${input.token}/documents/${row.docId}`}
                          className="mt-1 block text-sm font-medium text-teal-800 hover:underline"
                        >
                          {row.value}
                        </a>
                      ) : (
                        <div className="mt-1 text-sm text-stone-900">{row.value}</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 text-sm text-stone-500">No details shared yet.</div>
              )}
            </div>
          );
        })}

        {input.steps.length === 0 ? (
          <div className="text-sm text-stone-500">{input.emptyLabel}</div>
        ) : null}
      </div>
    </section>
  );
}

export function LegacyTrackView({
  token,
  shipment,
  uploaded,
  steps,
  docs,
  requests,
  exceptions,
  uploadRequestedDocAction,
}: LegacyTrackViewProps) {
  const timelineSteps = steps.filter((step) => !step.is_external);
  const trackingSteps = steps.filter((step) => step.is_external);
  const openRequests = requests.filter((request) => request.status === "OPEN");

  const docByType = new Map<string, { id: number; file_name: string }>();
  for (const doc of docs) {
    if (!docByType.has(doc.document_type)) {
      docByType.set(doc.document_type, { id: doc.id, file_name: doc.file_name });
    }
  }

  return (
    <div className="space-y-5">
      <section className={sectionCardClassName()}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              Shipment Overview
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">
              {shipment.shipment_code}
            </h2>
            <div className="mt-2 text-sm text-stone-600">
              {shipment.origin} - {shipment.destination}
            </div>
          </div>
          <Badge tone="zinc">{overallStatusLabel(shipment.overall_status)}</Badge>
        </div>

        {uploaded ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Document uploaded successfully.
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.4rem] border border-stone-200 bg-stone-50 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
              Last Update
            </div>
            <div className="mt-1 text-sm text-stone-900">
              {readFriendlyDateTime(shipment.last_update_at)}
            </div>
          </div>
          <div className="rounded-[1.4rem] border border-stone-200 bg-stone-50 px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
              ETA / ETD
            </div>
            <div className="mt-1 text-sm text-stone-900">
              {readFriendlyDate(shipment.etd)} / {readFriendlyDate(shipment.eta)}
            </div>
          </div>
        </div>
      </section>

      {exceptions.length ? (
        <section className={sectionCardClassName()}>
          <h2 className="text-lg font-semibold text-stone-950">Updates</h2>
          <div className="mt-4 space-y-3">
            {exceptions.map((exception) => (
              <div
                key={exception.id}
                className="rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-stone-950">
                      {exception.exception_name}
                    </div>
                    <div className="mt-1 text-xs text-stone-500">
                      {readFriendlyDateTime(exception.created_at)}
                    </div>
                  </div>
                  <Badge tone={exceptionTone(exception.default_risk)}>
                    {exception.default_risk === "BLOCKED" ? "Blocked" : "At risk"}
                  </Badge>
                </div>
                <div className="mt-3 text-sm text-stone-700">
                  {exception.customer_message ??
                    "An issue occurred and our team is working on it."}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {renderStepSection({
        token,
        title: "Timeline",
        emptyLabel: "No timeline available.",
        steps: timelineSteps,
        docByType,
      })}

      {renderStepSection({
        token,
        title: "Tracking",
        emptyLabel: "No tracking steps yet.",
        steps: trackingSteps,
        docByType,
      })}

      <section className={sectionCardClassName()}>
        <h2 className="text-lg font-semibold text-stone-950">Documents</h2>
        <div className="mt-4 space-y-3">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-4"
            >
              <div>
                <div className="text-sm font-semibold text-stone-950">{doc.document_type}</div>
                <div className="mt-1 text-xs text-stone-500">{doc.file_name}</div>
              </div>
              <a
                href={`/api/track/${token}/documents/${doc.id}`}
                className="rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
              >
                Download
              </a>
            </div>
          ))}

          {docs.length === 0 ? (
            <div className="text-sm text-stone-500">No documents shared yet.</div>
          ) : null}
        </div>
      </section>

      {openRequests.length ? (
        <section className={sectionCardClassName()}>
          <h2 className="text-lg font-semibold text-stone-950">Requested Documents</h2>
          <div className="mt-4 space-y-3">
            {openRequests.map((request) => (
              <div
                key={request.id}
                className="rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-4"
              >
                <div className="text-sm font-semibold text-stone-950">
                  {request.document_type}
                </div>
                {request.message ? (
                  <div className="mt-1 text-sm text-stone-600">{request.message}</div>
                ) : null}

                <form
                  action={uploadRequestedDocAction.bind(null, request.id)}
                  className="mt-4 flex flex-wrap items-center gap-2"
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
  );
}
