"use client";

import { useMemo, useState } from "react";

import type {
  StepFieldChoice,
  StepFieldChoiceOption,
  StepFieldDefinition,
  StepFieldGroup,
  StepFieldSchema,
  StepFieldType,
} from "@/lib/stepFields";
import type { WorkflowGlobalVariable } from "@/lib/workflowGlobals";
import { collectBooleanFieldOptions } from "@/lib/stepFields";

const fieldTypes: Array<{ value: StepFieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean (checkbox)" },
  { value: "file", label: "File" },
  { value: "group", label: "Group" },
  { value: "choice", label: "Choice" },
  { value: "shipment_goods", label: "Shipment goods" },
];

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createField(type: StepFieldType = "text"): StepFieldDefinition {
  const base = {
    id: createId("field"),
    label: "",
    required: false,
  };
  if (type === "group") {
    return { ...base, type, repeatable: false, fields: [] };
  }
  if (type === "choice") {
    return { ...base, type, options: [] };
  }
  return { ...base, type };
}

function createOption(): StepFieldChoiceOption {
  return {
    id: createId("opt"),
    label: "",
    fields: [],
    customer_message: "",
    customer_message_visible: false,
  };
}

function setFieldType(field: StepFieldDefinition, type: StepFieldType): StepFieldDefinition {
  const base = {
    id: field.id,
    label: field.label,
    required: field.required,
  };
  if (type === "group") {
    return { ...base, type, repeatable: false, fields: [] };
  }
  if (type === "choice") {
    return { ...base, type, options: [] };
  }
  if (type === "date" || type === "number") {
    return {
      ...base,
      type,
      linkToGlobal: "linkToGlobal" in field ? field.linkToGlobal ?? null : null,
      stopCountdownPath:
        "stopCountdownPath" in field ? field.stopCountdownPath ?? null : null,
    };
  }
  return { ...base, type };
}

function isGroup(field: StepFieldDefinition): field is StepFieldGroup {
  return field.type === "group";
}

function isChoice(field: StepFieldDefinition): field is StepFieldChoice {
  return field.type === "choice";
}

export function StepFieldBuilder({
  name,
  initialSchema,
  globalVariables,
  externalBooleanOptions,
}: {
  name: string;
  initialSchema: StepFieldSchema;
  globalVariables?: WorkflowGlobalVariable[];
  externalBooleanOptions?: Array<{ label: string; value: string }>;
}) {
  const [schema, setSchema] = useState<StepFieldSchema>(initialSchema);
  const globals = globalVariables ?? [];
  const dateGlobals = useMemo(
    () => globals.filter((g) => g.type === "date"),
    [globals],
  );
  const booleanOptions = useMemo(
    () => collectBooleanFieldOptions(schema.fields, [], [], false),
    [schema.fields],
  );
  const mergedBooleanOptions = useMemo(() => {
    const localOptions = booleanOptions.map((option) => ({
      label: option.label ? `This step / ${option.label}` : "This step / (checkbox)",
      value: option.encodedPath,
    }));
    return [...localOptions, ...(externalBooleanOptions ?? [])];
  }, [booleanOptions, externalBooleanOptions]);

  return (
    <div className="space-y-3">
      <FieldListEditor
        fields={schema.fields}
        onChange={(fields) => setSchema({ version: 1, fields })}
        dateGlobals={dateGlobals}
        booleanOptions={mergedBooleanOptions}
      />
      <input type="hidden" name={name} value={JSON.stringify(schema)} />
    </div>
  );
}

function FieldListEditor({
  fields,
  onChange,
  dateGlobals,
  booleanOptions,
}: {
  fields: StepFieldDefinition[];
  onChange: (next: StepFieldDefinition[]) => void;
  dateGlobals: WorkflowGlobalVariable[];
  booleanOptions: Array<{ label: string; value: string }>;
}) {
  const updateField = (index: number, nextField: StepFieldDefinition) => {
    const next = fields.map((field, idx) => (idx === index ? nextField : field));
    onChange(next);
  };

  const removeField = (index: number) => {
    const next = fields.filter((_, idx) => idx !== index);
    onChange(next);
  };

  const addField = () => {
    onChange([...fields, createField("text")]);
  };

  return (
    <div className="space-y-3">
      {fields.map((field, index) => {
        return (
          <div
            key={field.id}
            className="rounded-lg border border-zinc-200 bg-white p-3"
          >
            <div className="grid gap-2 md:grid-cols-12">
              <input
                value={field.label}
                onChange={(e) =>
                  updateField(index, { ...field, label: e.target.value })
                }
                placeholder="Field label"
                className="md:col-span-5 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <select
                value={field.type}
                onChange={(e) =>
                  updateField(index, setFieldType(field, e.target.value as StepFieldType))
                }
                className="md:col-span-3 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              >
                {fieldTypes.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <label className="md:col-span-2 flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={!!field.required}
                  onChange={(e) =>
                    updateField(index, { ...field, required: e.target.checked })
                  }
                />
                Required
              </label>
              <button
                type="button"
                onClick={() => removeField(index)}
                className="md:col-span-2 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Remove
              </button>
            </div>

            {field.type === "date" && dateGlobals.length > 0 ? (
              <div className="mt-2">
                <label className="block text-xs font-medium text-zinc-600">
                  Set global date variable
                </label>
                <select
                  value={field.linkToGlobal ?? ""}
                  onChange={(e) =>
                    updateField(index, {
                      ...field,
                      linkToGlobal: e.target.value || null,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {dateGlobals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {field.type === "number" && dateGlobals.length > 0 ? (
              <div className="mt-2 space-y-2">
                <label className="block text-xs font-medium text-zinc-600">
                  Countdown from global date
                </label>
                <select
                  value={field.linkToGlobal ?? ""}
                  onChange={(e) =>
                    updateField(index, {
                      ...field,
                      linkToGlobal: e.target.value || null,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {dateGlobals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>

                <label className="block text-xs font-medium text-zinc-600">
                  Stop countdown when this checkbox is set
                  <select
                    value={field.stopCountdownPath ?? ""}
                    onChange={(e) =>
                      updateField(index, {
                        ...field,
                        stopCountdownPath: e.target.value || null,
                      })
                    }
                    disabled={!booleanOptions.length}
                    className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
                  >
                    <option value="">
                      {booleanOptions.length
                        ? "Select checkbox..."
                        : "Add a checkbox field to enable"}
                    </option>
                    {booleanOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {!booleanOptions.length ? (
                  <div className="text-[11px] text-zinc-500">
                    Tip: add a Boolean (checkbox) field in this or another step.
                  </div>
                ) : null}
              </div>
            ) : null}

            {field.type === "boolean" ? (
              <div className="mt-2 text-[11px] text-zinc-500">
                Tip: use this checkbox in a number field to stop a countdown.
              </div>
            ) : null}

            {isGroup(field) ? (
              <div className="mt-3 space-y-3 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3">
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={!!field.repeatable}
                    onChange={(e) =>
                      updateField(index, {
                        ...field,
                        repeatable: e.target.checked,
                      })
                    }
                  />
                  Repeatable group
                </label>
                <FieldListEditor
                  fields={field.fields}
                  onChange={(nextFields) =>
                    updateField(index, { ...field, fields: nextFields })
                  }
                  dateGlobals={dateGlobals}
                  booleanOptions={booleanOptions}
                />
              </div>
            ) : null}

            {isChoice(field) ? (
              <div className="mt-3 space-y-3 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-3">
                <ChoiceOptionsEditor
                  options={field.options}
                  onChange={(nextOptions) =>
                    updateField(index, { ...field, options: nextOptions })
                  }
                  dateGlobals={dateGlobals}
                  booleanOptions={booleanOptions}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addField}
        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Add field
      </button>
    </div>
  );
}

function ChoiceOptionsEditor({
  options,
  onChange,
  dateGlobals,
  booleanOptions,
}: {
  options: StepFieldChoiceOption[];
  onChange: (next: StepFieldChoiceOption[]) => void;
  dateGlobals: WorkflowGlobalVariable[];
  booleanOptions: Array<{ label: string; value: string }>;
}) {
  const addOption = () => {
    onChange([...options, createOption()]);
  };

  const removeOption = (index: number) => {
    onChange(options.filter((_, idx) => idx !== index));
  };

  const updateOption = (index: number, nextOption: StepFieldChoiceOption) => {
    const next = options.map((opt, idx) => (idx === index ? nextOption : opt));
    onChange(next);
  };

  const markFinal = (index: number, isFinal: boolean) => {
    const next = options.map((opt, idx) =>
      idx === index ? { ...opt, is_final: isFinal } : opt,
    );
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {options.map((option, index) => (
        <div key={option.id} className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="grid gap-2 md:grid-cols-12">
            <input
              value={option.label}
              onChange={(e) =>
                updateOption(index, { ...option, label: e.target.value })
              }
              placeholder="Option label"
              className="md:col-span-5 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <label className="md:col-span-3 flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={!!option.is_final}
                onChange={(e) => markFinal(index, e.target.checked)}
              />
              Final option(s)
            </label>
            <label className="md:col-span-2 flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={!!option.customer_message_visible}
                onChange={(e) =>
                  updateOption(index, {
                    ...option,
                    customer_message_visible: e.target.checked,
                  })
                }
              />
              Customer msg
            </label>
            <button
              type="button"
              onClick={() => removeOption(index)}
              className="md:col-span-2 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Remove option
            </button>
          </div>

          {option.customer_message_visible ? (
            <label className="mt-2 block">
              <div className="mb-1 text-xs font-medium text-zinc-600">
                Customer message
              </div>
              <input
                value={option.customer_message ?? ""}
                onChange={(e) =>
                  updateOption(index, {
                    ...option,
                    customer_message: e.target.value,
                  })
                }
                placeholder="e.g., We need the original invoice to proceed."
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>
          ) : null}

          <div className="mt-3">
            <FieldListEditor
              fields={option.fields}
              onChange={(nextFields) =>
                updateOption(index, { ...option, fields: nextFields })
              }
              dateGlobals={dateGlobals}
              booleanOptions={booleanOptions}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addOption}
        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Add option
      </button>
    </div>
  );
}
