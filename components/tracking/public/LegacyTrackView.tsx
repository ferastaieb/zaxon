import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  encodeFieldPath,
  parseStepFieldSchema,
  parseStepFieldValues,
  schemaFromLegacyFields,
  stepFieldDocType,
  type StepFieldDefinition,
  type StepFieldValues,
} from "@/lib/stepFields";
import { overallStatusLabel, stepStatusLabel, type StepStatus } from "@/lib/domain";
import type {
  TrackingConnectedShipment,
  TrackingShipment,
} from "@/lib/data/tracking";

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
  connectedShipments: TrackingConnectedShipment[];
  uploadRequestedDocAction: (requestId: number, formData: FormData) => Promise<void>;
  logoutTrackingAction: () => Promise<void>;
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

type StepFieldRow = {
  label: string;
  value: string;
  docId?: number;
};

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
      const hasValue = entries.some(isStringValue);
      if (hasValue) {
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

function hasAnyFieldValue(input: {
  fields: StepFieldDefinition[];
  values: StepFieldValues;
  stepId: number;
  docByType: Map<string, { id: number; file_name: string }>;
  valuePath: string[];
}): boolean {
  const container = isPlainObject(input.values) ? input.values : {};
  for (const field of input.fields) {
    const path = [...input.valuePath, field.id];
    const fieldValue = container[field.id];

    if (field.type === "text" || field.type === "number" || field.type === "date") {
      if (isStringValue(fieldValue)) return true;
      continue;
    }

    if (field.type === "boolean") {
      if (isTruthyBooleanValue(fieldValue)) return true;
      continue;
    }

    if (field.type === "file") {
      const docType = stepFieldDocType(input.stepId, encodeFieldPath(path));
      if (input.docByType.has(docType)) return true;
      continue;
    }

    if (field.type === "shipment_goods") {
      const entries = isPlainObject(fieldValue) ? Object.values(fieldValue) : [];
      if (entries.some(isStringValue)) return true;
      continue;
    }

    if (field.type === "group") {
      if (field.repeatable) {
        const items = Array.isArray(fieldValue) ? fieldValue : [];
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          if (!isPlainObject(item)) continue;
          if (
            hasAnyFieldValue({
              fields: field.fields,
              values: item as StepFieldValues,
              stepId: input.stepId,
              docByType: input.docByType,
              valuePath: [...path, String(index)],
            })
          ) {
            return true;
          }
        }
      } else if (isPlainObject(fieldValue)) {
        if (
          hasAnyFieldValue({
            fields: field.fields,
            values: fieldValue as StepFieldValues,
            stepId: input.stepId,
            docByType: input.docByType,
            valuePath: path,
          })
        ) {
          return true;
        }
      }
      continue;
    }

    if (field.type === "choice") {
      const choiceValues = isPlainObject(fieldValue) ? fieldValue : {};
      for (const option of field.options) {
        const optionValue = choiceValues[option.id];
        if (
          isPlainObject(optionValue) &&
          hasAnyFieldValue({
            fields: option.fields,
            values: optionValue as StepFieldValues,
            stepId: input.stepId,
            docByType: input.docByType,
            valuePath: [...path, option.id],
          })
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function collectChoiceMessages(input: {
  fields: StepFieldDefinition[];
  values: StepFieldValues;
  stepId: number;
  docByType: Map<string, { id: number; file_name: string }>;
  labelPath: string[];
  valuePath: string[];
}): string[] {
  const messages: string[] = [];

  for (const field of input.fields) {
    const labels = [...input.labelPath, field.label];
    const path = [...input.valuePath, field.id];
    const fieldValue = input.values[field.id];

    if (field.type === "group") {
      if (field.repeatable) {
        const items = Array.isArray(fieldValue) ? fieldValue : [];
        items.forEach((item, index) => {
          if (!isPlainObject(item)) return;
          messages.push(
            ...collectChoiceMessages({
              fields: field.fields,
              values: item as StepFieldValues,
              stepId: input.stepId,
              docByType: input.docByType,
              labelPath: [...labels, `Item ${index + 1}`],
              valuePath: [...path, String(index)],
            }),
          );
        });
      } else if (isPlainObject(fieldValue)) {
        messages.push(
          ...collectChoiceMessages({
            fields: field.fields,
            values: fieldValue as StepFieldValues,
            stepId: input.stepId,
            docByType: input.docByType,
            labelPath: labels,
            valuePath: path,
          }),
        );
      }
      continue;
    }

    if (field.type === "choice") {
      const choiceValues = isPlainObject(fieldValue) ? fieldValue : {};
      const finalOptions = field.options.filter((opt) => opt.is_final);
      const finalHasValue = finalOptions.some((option) => {
        const optionValue = choiceValues[option.id];
        return (
          isPlainObject(optionValue) &&
          hasAnyFieldValue({
            fields: option.fields,
            values: optionValue as StepFieldValues,
            stepId: input.stepId,
            docByType: input.docByType,
            valuePath: [...path, option.id],
          })
        );
      });

      for (const option of field.options) {
        if (finalHasValue && !option.is_final) continue;
        const optionValue = choiceValues[option.id];
        const optionValues = isPlainObject(optionValue)
          ? (optionValue as StepFieldValues)
          : {};
        const optionHasValue = hasAnyFieldValue({
          fields: option.fields,
          values: optionValues,
          stepId: input.stepId,
          docByType: input.docByType,
          valuePath: [...path, option.id],
        });

        const message =
          option.customer_message_visible && option.customer_message
            ? String(option.customer_message).trim()
            : "";
        if (optionHasValue && message) {
          messages.push(`${labels.join(" / ")} - ${message}`);
        }

        if (isPlainObject(optionValue)) {
          messages.push(
            ...collectChoiceMessages({
              fields: option.fields,
              values: optionValues,
              stepId: input.stepId,
              docByType: input.docByType,
              labelPath: [...labels, option.label],
              valuePath: [...path, option.id],
            }),
          );
        }
      }
    }
  }

  return messages;
}

export function LegacyTrackView({
  token,
  shipment,
  uploaded,
  steps,
  docs,
  requests,
  exceptions,
  connectedShipments,
  uploadRequestedDocAction,
  logoutTrackingAction,
}: LegacyTrackViewProps) {
  const timelineSteps = steps.filter((s) => !s.is_external);
  const trackingSteps = steps.filter((s) => s.is_external);
  const openRequests = requests.filter((r) => r.status === "OPEN");

  const docByType = new Map<string, { id: number; file_name: string }>();
  for (const doc of docs) {
    if (!docByType.has(doc.document_type)) {
      docByType.set(doc.document_type, { id: doc.id, file_name: doc.file_name });
    }
  }

  return (
    <>
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-zinc-500">Tracking shipment</div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
                {shipment.shipment_code}
              </h1>
              <div className="mt-2 text-sm text-zinc-600">
                {shipment.origin} - {shipment.destination}
              </div>
            </div>
            <Badge tone="zinc">{overallStatusLabel(shipment.overall_status)}</Badge>
          </div>

          {uploaded ? (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              Document uploaded successfully. Thank you!
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 p-4">
              <div className="text-xs font-medium text-zinc-500">Last update</div>
              <div className="mt-1 text-sm text-zinc-900">{readFriendlyDateTime(shipment.last_update_at)}</div>
            </div>
            <div className="rounded-xl border border-zinc-200 p-4">
              <div className="text-xs font-medium text-zinc-500">ETA / ETD</div>
              <div className="mt-1 text-sm text-zinc-900">
                <span className="text-zinc-500">{readFriendlyDate(shipment.etd)}</span> /{" "}
                <span className="text-zinc-500">{readFriendlyDate(shipment.eta)}</span>
              </div>
            </div>
          </div>

          {connectedShipments.length ? (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-zinc-900">Connected shipments</h2>
              <div className="mt-3 space-y-2">
                {connectedShipments.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-zinc-900">{s.shipment_code}</div>
                        <Badge tone="zinc">{overallStatusLabel(s.overall_status)}</Badge>
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {s.origin} - {s.destination}
                      </div>
                      {(s.shipment_label || s.connected_label) ? (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600">
                          {s.shipment_label ? (
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-700">
                              This: {s.shipment_label}
                            </span>
                          ) : null}
                          {s.connected_label ? (
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-zinc-700">
                              Connected: {s.connected_label}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {s.tracking_token ? (
                      <Link
                        href={`/track/${s.tracking_token}`}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Open tracking
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {exceptions.length ? (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-zinc-900">Updates</h2>
              <div className="mt-3 space-y-2">
                {exceptions.map((e) => (
                  <div key={e.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="text-sm font-medium text-zinc-900">{e.exception_name}</div>
                      <Badge tone={exceptionTone(e.default_risk)}>
                        {e.default_risk === "BLOCKED" ? "Blocked" : "At risk"}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">{readFriendlyDateTime(e.created_at)}</div>
                    <div className="mt-2 text-sm text-zinc-700">
                      {e.customer_message ??
                        "An issue occurred and our team is working on it. We will update you soon."}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-8">
            <h2 className="text-sm font-semibold text-zinc-900">Timeline</h2>
            <div className="mt-3 space-y-2">
              {timelineSteps.map((s) => {
                const fieldSchema = getStepFieldSchema(s);
                const fieldValues = parseStepFieldValues(s.field_values_json);
                const rows = collectStepFieldRows({
                  fields: fieldSchema.fields,
                  values: fieldValues,
                  labelPath: [],
                  valuePath: [],
                  stepId: s.id,
                  docByType,
                });
                const messages = collectChoiceMessages({
                  fields: fieldSchema.fields,
                  values: fieldValues,
                  labelPath: [],
                  valuePath: [],
                  stepId: s.id,
                  docByType,
                });

                return (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-900">
                        {s.sort_order}. {s.name}
                      </div>
                      {rows.length || messages.length ? (
                        <div className="mt-2 space-y-2 text-xs text-zinc-600">
                          {rows.map((row, index) => (
                            <div
                              key={`${s.id}-timeline-${index}`}
                              className="flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="font-medium text-zinc-700">{row.label}</div>
                              {row.docId ? (
                                <a
                                  href={`/api/track/${token}/documents/${row.docId}`}
                                  className="text-zinc-600 hover:underline"
                                >
                                  {row.value}
                                </a>
                              ) : (
                                <div className="text-zinc-900">{row.value}</div>
                              )}
                            </div>
                          ))}
                          {messages.length ? (
                            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
                              {messages.map((message, index) => (
                                <div key={`${s.id}-timeline-msg-${index}`}>{message}</div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <Badge tone={stepTone(s.status)}>{stepStatusLabel(s.status)}</Badge>
                  </div>
                );
              })}
              {timelineSteps.length === 0 ? (
                <div className="text-sm text-zinc-500">No timeline available.</div>
              ) : null}
            </div>
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-zinc-900">Tracking</h2>
            <div className="mt-3 space-y-2">
              {trackingSteps.map((s) => {
                const fieldSchema = getStepFieldSchema(s);
                const fieldValues = parseStepFieldValues(s.field_values_json);
                const rows = collectStepFieldRows({
                  fields: fieldSchema.fields,
                  values: fieldValues,
                  labelPath: [],
                  valuePath: [],
                  stepId: s.id,
                  docByType,
                });
                const messages = collectChoiceMessages({
                  fields: fieldSchema.fields,
                  values: fieldValues,
                  labelPath: [],
                  valuePath: [],
                  stepId: s.id,
                  docByType,
                });

                return (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-900">
                        {s.sort_order}. {s.name}
                      </div>
                      {rows.length || messages.length ? (
                        <div className="mt-2 space-y-2 text-xs text-zinc-600">
                          {rows.map((row, index) => (
                            <div
                              key={`${s.id}-tracking-${index}`}
                              className="flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="font-medium text-zinc-700">{row.label}</div>
                              {row.docId ? (
                                <a
                                  href={`/api/track/${token}/documents/${row.docId}`}
                                  className="text-zinc-600 hover:underline"
                                >
                                  {row.value}
                                </a>
                              ) : (
                                <div className="text-zinc-900">{row.value}</div>
                              )}
                            </div>
                          ))}
                          {messages.length ? (
                            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-900">
                              {messages.map((message, index) => (
                                <div key={`${s.id}-tracking-msg-${index}`}>{message}</div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <Badge tone={stepTone(s.status)}>{stepStatusLabel(s.status)}</Badge>
                  </div>
                );
              })}
              {trackingSteps.length === 0 ? (
                <div className="text-sm text-zinc-500">No tracking steps yet.</div>
              ) : null}
            </div>
          </div>

          <div className="mt-8">
            <h2 className="text-sm font-semibold text-zinc-900">Documents</h2>
            <div className="mt-3 space-y-2">
              {docs.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-900">{d.document_type}</div>
                    <div className="mt-1 text-xs text-zinc-500">{d.file_name}</div>
                  </div>
                  <a
                    href={`/api/track/${token}/documents/${d.id}`}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Download
                  </a>
                </div>
              ))}
              {docs.length === 0 ? (
                <div className="text-sm text-zinc-500">No documents shared yet.</div>
              ) : null}
            </div>
          </div>

          {openRequests.length ? (
            <div className="mt-8">
              <h2 className="text-sm font-semibold text-zinc-900">Requested documents</h2>
              <div className="mt-3 space-y-3">
                {openRequests.map((r) => (
                  <div key={r.id} className="rounded-xl border border-zinc-200 p-4">
                    <div className="text-sm font-medium text-zinc-900">{r.document_type}</div>
                    {r.message ? <div className="mt-1 text-sm text-zinc-600">{r.message}</div> : null}

                    <form action={uploadRequestedDocAction.bind(null, r.id)} className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        name="file"
                        type="file"
                        className="w-full max-w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                        required
                      />
                      <SubmitButton
                        pendingLabel="Uploading..."
                        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                      >
                        Upload
                      </SubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-8 text-xs text-zinc-500">
            If you have questions, reply to your logistics contact.
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3 text-center text-xs text-zinc-500">
          <form action={logoutTrackingAction}>
            <button type="submit" className="hover:underline">
              Not you? Re-verify
            </button>
          </form>
          <div>
            Powered by Logistic -{" "}
            <Link href="/" className="hover:underline">
              Staff login
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
