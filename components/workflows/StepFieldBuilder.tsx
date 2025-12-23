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

const fieldTypes: Array<{ value: StepFieldType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "file", label: "File" },
  { value: "group", label: "Group" },
  { value: "choice", label: "Choice" },
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
  if (type === "date") {
    return { ...base, type, linkToGlobal: "linkToGlobal" in field ? field.linkToGlobal ?? null : null };
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
}: {
  name: string;
  initialSchema: StepFieldSchema;
  globalVariables?: WorkflowGlobalVariable[];
}) {
  const [schema, setSchema] = useState<StepFieldSchema>(initialSchema);
  const globals = globalVariables ?? [];
  const dateGlobals = useMemo(
    () => globals.filter((g) => g.type === "date"),
    [globals],
  );

  return (
    <div className="space-y-3">
      <FieldListEditor
        fields={schema.fields}
        onChange={(fields) => setSchema({ version: 1, fields })}
        dateGlobals={dateGlobals}
      />
      <input type="hidden" name={name} value={JSON.stringify(schema)} />
    </div>
  );
}

function FieldListEditor({
  fields,
  onChange,
  dateGlobals,
}: {
  fields: StepFieldDefinition[];
  onChange: (next: StepFieldDefinition[]) => void;
  dateGlobals: WorkflowGlobalVariable[];
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
                  Link to global date
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
}: {
  options: StepFieldChoiceOption[];
  onChange: (next: StepFieldChoiceOption[]) => void;
  dateGlobals: WorkflowGlobalVariable[];
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
    const next = options.map((opt, idx) => ({
      ...opt,
      is_final: idx === index ? isFinal : false,
    }));
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
              className="md:col-span-6 rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            <label className="md:col-span-3 flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={!!option.is_final}
                onChange={(e) => markFinal(index, e.target.checked)}
              />
              Final option
            </label>
            <button
              type="button"
              onClick={() => removeOption(index)}
              className="md:col-span-3 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Remove option
            </button>
          </div>

          <div className="mt-3">
            <FieldListEditor
              fields={option.fields}
              onChange={(nextFields) =>
                updateOption(index, { ...option, fields: nextFields })
              }
              dateGlobals={dateGlobals}
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
