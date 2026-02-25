"use client";

import { type ReactNode, useMemo, useState } from "react";

import {
  encodeFieldPath,
  fieldInputName,
  fieldRemovalName,
  stepFieldDocType,
  type StepFieldDefinition,
  type StepFieldSchema,
  type StepFieldValues,
} from "@/lib/stepFields";
import { FTL_EXPORT_CARGO_UNIT_TYPES } from "@/lib/ftlExport/constants";
import { DatePickerInput } from "@/components/ui/DatePickerInput";
import type { FtlDocumentMeta } from "./types";

type Props = {
  stepId: number;
  schema: StepFieldSchema;
  values: StepFieldValues;
  canEdit: boolean;
  latestDocsByType: Record<string, FtlDocumentMeta>;
};

const TEXT_SELECT_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  booking_status: [
    { value: "PENDING", label: "Pending" },
    { value: "BOOKED", label: "Booked" },
    { value: "CANCELLED", label: "Cancelled" },
  ],
  loading_origin: [
    { value: "ZAXON_WAREHOUSE", label: "Zaxon Warehouse" },
    { value: "EXTERNAL_SUPPLIER", label: "External Supplier Location" },
    { value: "MIXED", label: "Mixed" },
  ],
  cargo_unit_type: [
    ...FTL_EXPORT_CARGO_UNIT_TYPES.map((value) => ({ value, label: value })),
  ],
  naseeb_clearance_mode: [
    { value: "ZAXON", label: "Zaxon" },
    { value: "CLIENT", label: "Client" },
  ],
  batha_clearance_mode: [
    { value: "ZAXON", label: "Zaxon" },
    { value: "CLIENT", label: "Client" },
  ],
  masnaa_clearance_mode: [
    { value: "ZAXON", label: "Zaxon" },
    { value: "CLIENT", label: "Client" },
  ],
  show_syria_consignee_to_client: [
    { value: "YES", label: "Yes" },
    { value: "NO", label: "No" },
  ],
  show_batha_consignee_to_client: [
    { value: "YES", label: "Yes" },
    { value: "NO", label: "No" },
  ],
  show_masnaa_consignee_to_client: [
    { value: "YES", label: "Yes" },
    { value: "NO", label: "No" },
  ],
  syria_clearance_mode: [
    { value: "ZAXON", label: "Zaxon" },
    { value: "CLIENT", label: "Client" },
  ],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function toRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function toStringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function isChecked(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function StepFieldRenderer({
  stepId,
  schema,
  values,
  canEdit,
  latestDocsByType,
}: Props) {
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const [groupRemovals, setGroupRemovals] = useState<Record<string, number[]>>({});
  const [choiceSelections, setChoiceSelections] = useState<Record<string, string>>({});

  const selectOptionsMap = useMemo(() => TEXT_SELECT_OPTIONS, []);

  const addGroupItem = (groupKey: string, currentCount: number) => {
    setGroupCounts((prev) => ({ ...prev, [groupKey]: currentCount + 1 }));
  };

  const removeGroupItem = (groupKey: string, index: number) => {
    setGroupRemovals((prev) => {
      const existing = new Set(prev[groupKey] ?? []);
      existing.add(index);
      return { ...prev, [groupKey]: Array.from(existing).sort((a, b) => a - b) };
    });
  };

  const renderFields = (
    fields: StepFieldDefinition[],
    basePath: string[],
    valuesObj: StepFieldValues,
    disabled: boolean,
  ): ReactNode[] => {
    return fields.map((field) => {
      const fieldPath = [...basePath, field.id];
      const fieldValues = toRecord(valuesObj);
      const fieldValue = fieldValues[field.id];
      const encodedPath = encodeFieldPath(fieldPath);
      const fieldKey = encodedPath;

      if (field.type === "text" || field.type === "number" || field.type === "date") {
        const selectOptions = field.type === "text" ? selectOptionsMap[field.id] : undefined;
        const value = toStringValue(fieldValue);

        if (selectOptions?.length) {
          return (
            <label key={fieldKey} className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">{field.label}</div>
              <select
                name={fieldInputName(fieldPath)}
                defaultValue={value}
                disabled={!canEdit || disabled}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
              >
                <option value="">Select...</option>
                {selectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (field.type === "date") {
          return (
            <label key={fieldKey} className="block">
              <div className="mb-1 text-xs font-medium text-zinc-600">{field.label}</div>
              <DatePickerInput
                name={fieldInputName(fieldPath)}
                defaultValue={value}
                disabled={!canEdit || disabled}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
              />
            </label>
          );
        }

        const inputType = field.type === "number" ? "number" : "text";

        return (
          <label key={fieldKey} className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">{field.label}</div>
            <input
              type={inputType}
              name={fieldInputName(fieldPath)}
              defaultValue={value}
              disabled={!canEdit || disabled}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            />
          </label>
        );
      }

      if (field.type === "boolean") {
        return (
          <label
            key={fieldKey}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
          >
            <input type="hidden" name={fieldInputName(fieldPath)} value="" />
            <input
              type="checkbox"
              name={fieldInputName(fieldPath)}
              value="1"
              defaultChecked={isChecked(fieldValue)}
              disabled={!canEdit || disabled}
              className="h-4 w-4 rounded border-zinc-300"
            />
            <span>{field.label}</span>
          </label>
        );
      }

      if (field.type === "file") {
        const docType = stepFieldDocType(stepId, encodedPath);
        const latestDoc = latestDocsByType[docType];
        return (
          <div key={fieldKey} className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="text-xs font-medium text-zinc-700">{field.label}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                type="file"
                name={fieldInputName(fieldPath)}
                disabled={!canEdit || disabled}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs disabled:bg-zinc-100"
              />
              <div className="text-xs text-zinc-500">
                {latestDoc ? (
                  <a
                    href={`/api/documents/${latestDoc.id}`}
                    className="text-zinc-700 hover:underline"
                  >
                    Download latest
                  </a>
                ) : (
                  <span>No file uploaded</span>
                )}
              </div>
            </div>
          </div>
        );
      }

      if (field.type === "group") {
        const groupValue = fieldValues[field.id];
        const groupKey = encodedPath;
        const removed = new Set(groupRemovals[groupKey] ?? []);

        if (field.repeatable) {
          const items = Array.isArray(groupValue) ? groupValue : [];
          const count = Math.max(items.length, groupCounts[groupKey] ?? 0);
          return (
            <div key={fieldKey} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-zinc-700">{field.label}</div>
                {canEdit && !disabled ? (
                  <button
                    type="button"
                    onClick={() => addGroupItem(groupKey, count)}
                    className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Add item
                  </button>
                ) : null}
              </div>
              <div className="mt-3 space-y-3">
                {Array.from({ length: count }).map((_, index) => {
                  if (removed.has(index)) return null;
                  const item = isPlainObject(items[index]) ? items[index] : {};
                  const itemPath = [...fieldPath, String(index)];
                  return (
                    <div
                      key={`${fieldKey}-${index}`}
                      className="rounded-lg border border-zinc-200 bg-white p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-xs font-medium text-zinc-700">
                          Item {index + 1}
                        </div>
                        {canEdit && !disabled ? (
                          <button
                            type="button"
                            onClick={() => removeGroupItem(groupKey, index)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {renderFields(field.fields, itemPath, item as StepFieldValues, disabled)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {(groupRemovals[groupKey] ?? []).map((index) => (
                <input
                  key={`${fieldKey}-remove-${index}`}
                  type="hidden"
                  name={fieldRemovalName([...fieldPath, String(index)])}
                  value="1"
                />
              ))}
            </div>
          );
        }

        const groupValues = isPlainObject(groupValue) ? (groupValue as StepFieldValues) : {};
        return (
          <div key={fieldKey} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-medium text-zinc-700">{field.label}</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {renderFields(field.fields, fieldPath, groupValues, disabled)}
            </div>
          </div>
        );
      }

      if (field.type === "choice") {
        const choiceValue = toRecord(fieldValue);
        const selectedFromValue = getChoiceSelected(field, choiceValue);
        const selected =
          choiceSelections[encodedPath] ?? selectedFromValue ?? field.options[0]?.id ?? "";
        const selectedOption = field.options.find((option) => option.id === selected);
        const selectedValues = selectedOption
          ? (toRecord(choiceValue[selectedOption.id]) as StepFieldValues)
          : {};

        return (
          <div key={fieldKey} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-medium text-zinc-700">{field.label}</div>
            <div className="mt-2 space-y-3">
              <select
                value={selected}
                onChange={(event) =>
                  setChoiceSelections((prev) => ({
                    ...prev,
                    [encodedPath]: event.target.value,
                  }))
                }
                disabled={!canEdit || disabled}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
              >
                {field.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                type="hidden"
                name={fieldInputName([...fieldPath, "__selected"])}
                value={selected}
              />
              {selectedOption ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {renderFields(
                    selectedOption.fields,
                    [...fieldPath, selectedOption.id],
                    selectedValues,
                    disabled,
                  )}
                </div>
              ) : null}
            </div>
          </div>
        );
      }

      return null;
    });
  };

  return <div className="space-y-3">{renderFields(schema.fields, [], values, false)}</div>;
}

function getChoiceSelected(
  field: Extract<StepFieldDefinition, { type: "choice" }>,
  choiceValue: Record<string, unknown>,
) {
  const selected = choiceValue.__selected;
  if (typeof selected === "string" && selected) return selected;
  for (const option of field.options) {
    if (toRecord(choiceValue[option.id]) && Object.keys(toRecord(choiceValue[option.id])).length) {
      return option.id;
    }
  }
  return undefined;
}
