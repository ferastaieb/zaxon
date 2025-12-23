"use client";

import { useState } from "react";

import type { WorkflowGlobalVariable, WorkflowGlobalVariableType } from "@/lib/workflowGlobals";

const types: Array<{ value: WorkflowGlobalVariableType; label: string }> = [
  { value: "text", label: "Text" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
];

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function createVariable(): WorkflowGlobalVariable {
  return {
    id: createId("var"),
    label: "",
    type: "text",
  };
}

export function GlobalVariablesBuilder({
  name,
  initialVariables,
}: {
  name: string;
  initialVariables: WorkflowGlobalVariable[];
}) {
  const [variables, setVariables] = useState<WorkflowGlobalVariable[]>(
    initialVariables,
  );

  const addVariable = () => {
    setVariables((prev) => [...prev, createVariable()]);
  };

  const updateVariable = (index: number, next: WorkflowGlobalVariable) => {
    setVariables((prev) => prev.map((v, idx) => (idx === index ? next : v)));
  };

  const removeVariable = (index: number) => {
    setVariables((prev) => prev.filter((_, idx) => idx !== index));
  };

  return (
    <div className="space-y-3">
      {variables.map((variable, index) => (
        <div
          key={variable.id}
          className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-3 md:grid-cols-12"
        >
          <input
            value={variable.label}
            onChange={(e) =>
              updateVariable(index, { ...variable, label: e.target.value })
            }
            placeholder="Variable label"
            className="md:col-span-6 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <select
            value={variable.type}
            onChange={(e) =>
              updateVariable(index, {
                ...variable,
                type: e.target.value as WorkflowGlobalVariableType,
              })
            }
            className="md:col-span-3 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            {types.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => removeVariable(index)}
            className="md:col-span-3 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            Remove
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addVariable}
        className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Add variable
      </button>

      <input type="hidden" name={name} value={JSON.stringify(variables)} />
    </div>
  );
}
