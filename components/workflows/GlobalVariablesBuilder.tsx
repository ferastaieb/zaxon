"use client";

import { useState } from "react";

import type { WorkflowGlobalVariable } from "@/lib/workflowGlobals";

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
    type: "date",
  };
}

export function GlobalVariablesBuilder({
  name,
  initialVariables,
  onChange,
}: {
  name: string;
  initialVariables: WorkflowGlobalVariable[];
  onChange?: (variables: WorkflowGlobalVariable[]) => void;
}) {
  const [variables, setVariables] = useState<WorkflowGlobalVariable[]>(
    initialVariables,
  );

  const updateVariables = (
    updater: (prev: WorkflowGlobalVariable[]) => WorkflowGlobalVariable[],
  ) => {
    setVariables((prev) => {
      const next = updater(prev);
      onChange?.(next);
      return next;
    });
  };

  const addVariable = () => {
    updateVariables((prev) => [...prev, createVariable()]);
  };

  const updateVariable = (index: number, next: WorkflowGlobalVariable) => {
    updateVariables((prev) => prev.map((v, idx) => (idx === index ? next : v)));
  };

  const removeVariable = (index: number) => {
    updateVariables((prev) => prev.filter((_, idx) => idx !== index));
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
            className="md:col-span-9 rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
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
