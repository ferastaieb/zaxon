"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { cn } from "@/lib/cn";
import { Roles, type Role } from "@/lib/domain";
import type {
  StepFieldDefinition,
  StepFieldSchema,
  StepFieldType,
} from "@/lib/stepFields";
import type { WorkflowGlobalVariable } from "@/lib/workflowGlobals";
import { GlobalVariablesBuilder } from "@/components/workflows/GlobalVariablesBuilder";
import { StepFieldBuilder } from "@/components/workflows/StepFieldBuilder";
import { SubmitButton } from "@/components/ui/SubmitButton";

type DesignerStep = {
  id: string;
  name: string;
  ownerRole: Role;
  customerVisible: boolean;
  isExternal: boolean;
  slaHours: string;
  dependsOn: string[];
  position: { x: number; y: number };
  schema: StepFieldSchema;
};

type DesignerEdge = { from: string; to: string };

const NODE_WIDTH = 220;
const NODE_HEIGHT = 96;
const CANVAS_WIDTH = 980;
const CANVAS_HEIGHT = 560;

type PreviewRow = {
  label: string;
  detail: string;
};

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function baseField(label: string, type: StepFieldType, required = false) {
  return {
    id: createId("field"),
    label,
    type,
    required,
  } as StepFieldDefinition;
}

function initialSteps(): DesignerStep[] {
  const step1 = createId("step");
  const step2 = createId("step");
  const step3 = createId("step");
  const step4 = createId("step");
  const step5 = createId("step");

  return [
    {
      id: step1,
      name: "Booking intake",
      ownerRole: "SALES",
      customerVisible: true,
      isExternal: false,
      slaHours: "24",
      dependsOn: [],
      position: { x: 80, y: 80 },
      schema: {
        version: 1,
        fields: [
          baseField("Booking reference", "text", true),
          baseField("ETD", "date"),
        ],
      },
    },
    {
      id: step2,
      name: "Document collection",
      ownerRole: "OPERATIONS",
      customerVisible: true,
      isExternal: false,
      slaHours: "48",
      dependsOn: [step1],
      position: { x: 360, y: 80 },
      schema: {
        version: 1,
        fields: [
          baseField("Invoice received", "boolean"),
          baseField("Packing list", "file"),
        ],
      },
    },
    {
      id: step3,
      name: "Customs clearance",
      ownerRole: "CLEARANCE",
      customerVisible: true,
      isExternal: false,
      slaHours: "24",
      dependsOn: [step2],
      position: { x: 640, y: 80 },
      schema: {
        version: 1,
        fields: [
          baseField("Cleared by", "text"),
          baseField("Clearance date", "date"),
        ],
      },
    },
    {
      id: step4,
      name: "In transit",
      ownerRole: "OPERATIONS",
      customerVisible: true,
      isExternal: true,
      slaHours: "",
      dependsOn: [step2],
      position: { x: 360, y: 280 },
      schema: {
        version: 1,
        fields: [baseField("Departure date", "date"), baseField("ETA", "date")],
      },
    },
    {
      id: step5,
      name: "Final delivery",
      ownerRole: "OPERATIONS",
      customerVisible: true,
      isExternal: true,
      slaHours: "",
      dependsOn: [step4],
      position: { x: 640, y: 280 },
      schema: {
        version: 1,
        fields: [
          baseField("Delivered at", "date"),
          baseField("Proof of delivery", "file"),
        ],
      },
    },
  ];
}

function collectLinkedGlobals(fields: StepFieldDefinition[], used: Set<string>) {
  for (const field of fields) {
    if (field.type === "group") {
      collectLinkedGlobals(field.fields, used);
      continue;
    }
    if (field.type === "choice") {
      for (const option of field.options) {
        collectLinkedGlobals(option.fields, used);
      }
      continue;
    }
    if (
      (field.type === "date" || field.type === "number") &&
      field.linkToGlobal
    ) {
      used.add(field.linkToGlobal);
    }
  }
}

function fieldLabel(field: StepFieldDefinition) {
  return field.label?.trim() || "Untitled field";
}

function collectCustomerPreviewRows(
  fields: StepFieldDefinition[],
  labelPath: string[] = [],
): PreviewRow[] {
  const rows: PreviewRow[] = [];
  for (const field of fields) {
    const labelParts = [...labelPath, fieldLabel(field)];
    const label = labelParts.join(" / ");
    if (field.type === "group") {
      rows.push({
        label,
        detail: field.repeatable ? "Repeatable group" : "Group",
      });
      const childPath = field.repeatable
        ? [...labelParts, "Item 1"]
        : labelParts;
      rows.push(...collectCustomerPreviewRows(field.fields, childPath));
      continue;
    }
    if (field.type === "choice") {
      const optionLabels = field.options
        .map((option) => option.label?.trim() || "Option")
        .map((option) => option.replace(/\s+/g, " "))
        .join(", ");
      rows.push({
        label,
        detail: optionLabels ? `Choice: ${optionLabels}` : "Choice",
      });
      for (const option of field.options) {
        rows.push(
          ...collectCustomerPreviewRows(option.fields, [
            ...labelParts,
            option.label?.trim() || "Option",
          ]),
        );
      }
      continue;
    }
    if (field.type === "file") {
      rows.push({ label, detail: "File upload" });
      continue;
    }
    if (field.type === "shipment_goods") {
      rows.push({ label, detail: "Shipment goods allocation" });
      continue;
    }
    if (field.type === "boolean") {
      rows.push({ label, detail: "Checkbox" });
      continue;
    }
    if (field.type === "number") {
      rows.push({ label, detail: "Number input" });
      continue;
    }
    if (field.type === "date") {
      rows.push({ label, detail: "Date input" });
      continue;
    }
    rows.push({ label, detail: "Text input" });
  }
  return rows;
}

function InternalPreviewFields({
  schema,
  globalVariables,
}: {
  schema: StepFieldSchema;
  globalVariables: WorkflowGlobalVariable[];
}) {
  const [choiceTabs, setChoiceTabs] = useState<Record<string, string>>({});
  const globalLabelMap = useMemo(
    () => new Map(globalVariables.map((variable) => [variable.id, variable.label])),
    [globalVariables],
  );

  const renderFields = (
    fields: StepFieldDefinition[],
    path: string[] = [],
  ) => {
    return fields.map((field) => {
      const fieldPath = [...path, field.id];
      const fieldKey = fieldPath.join("/");
      const label = fieldLabel(field);

      if (field.type === "text" || field.type === "number" || field.type === "date") {
        const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
        const globalLabel = field.linkToGlobal
          ? globalLabelMap.get(field.linkToGlobal) ?? null
          : null;
        const helperText =
          field.type === "date" && globalLabel
            ? `Sets global date: ${globalLabel}`
            : field.type === "number" && globalLabel
              ? `Countdown from: ${globalLabel}`
              : null;
        return (
          <label key={fieldKey} className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600">{label}</div>
            <input
              type={inputType}
              disabled
              placeholder="Enter value..."
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm disabled:bg-zinc-100"
            />
            {helperText ? (
              <div className="mt-1 text-[11px] text-zinc-500">{helperText}</div>
            ) : null}
          </label>
        );
      }

      if (field.type === "boolean") {
        return (
          <label
            key={fieldKey}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700"
          >
            <input
              type="checkbox"
              disabled
              className="h-4 w-4 rounded border border-zinc-300"
            />
            <span>{label}</span>
          </label>
        );
      }

      if (field.type === "file") {
        return (
          <div key={fieldKey} className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="text-xs font-medium text-zinc-700">{label}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="block">
                <div className="mb-1 text-[11px] font-medium text-zinc-600">
                  Upload file
                </div>
                <input
                  type="file"
                  disabled
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs disabled:bg-zinc-100"
                />
              </label>
              <div className="text-[11px] text-zinc-500">No file uploaded</div>
            </div>
          </div>
        );
      }

      if (field.type === "shipment_goods") {
        return (
          <div key={fieldKey} className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="text-xs font-medium text-zinc-700">{label}</div>
            <div className="mt-2 text-xs text-zinc-500">
              Shipment goods will appear here in the shipment view.
            </div>
          </div>
        );
      }

      if (field.type === "group") {
        if (field.repeatable) {
          return (
            <div key={fieldKey} className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-700">
                <span>{label}</span>
                <button
                  type="button"
                  disabled
                  className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium text-zinc-600 disabled:bg-zinc-100"
                >
                  Add item
                </button>
              </div>
              <div className="mt-3 space-y-3">
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div className="mb-2 text-xs font-medium text-zinc-700">
                    Item 1
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {renderFields(field.fields, [...fieldPath, "0"])}
                  </div>
                </div>
              </div>
            </div>
          );
        }
        return (
          <div key={fieldKey} className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="text-xs font-medium text-zinc-700">{label}</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {renderFields(field.fields, fieldPath)}
            </div>
          </div>
        );
      }

      if (field.type === "choice") {
        const choiceKey = fieldPath.join("/");
        const activeOptionId =
          choiceTabs[choiceKey] ?? field.options[0]?.id ?? "";
        return (
          <div key={fieldKey} className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="text-xs font-medium text-zinc-700">{label}</div>
            <div className="mt-3">
              <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
                {field.options.map((option) => {
                  const optionLabel = option.label?.trim() || "Option";
                  const isActive = option.id === activeOptionId;
                  return (
                    <button
                      key={`${choiceKey}-tab-${option.id}`}
                      type="button"
                      onClick={() =>
                        setChoiceTabs((prev) => ({ ...prev, [choiceKey]: option.id }))
                      }
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                        isActive
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                      )}
                    >
                      {optionLabel}
                      {option.is_final ? " (Final)" : ""}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3">
                {field.options.map((option) => {
                  if (option.id !== activeOptionId) return null;
                  const optionPath = [...fieldPath, option.id];
                  return (
                    <div key={`${choiceKey}-panel-${option.id}`} className="grid gap-3 sm:grid-cols-2">
                      {renderFields(option.fields, optionPath)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }

      return null;
    });
  };

  if (!schema.fields.length) {
    return (
      <div className="text-xs text-zinc-500">
        Add fields to see a preview.
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs font-medium text-zinc-700">Step fields</div>
      <div className="mt-2 space-y-3">{renderFields(schema.fields)}</div>
    </div>
  );
}

function nextPosition(index: number) {
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: 80 + col * 280,
    y: 80 + row * 200,
  };
}

export function WorkflowDesigner({
  action,
}: {
  action: (formData: FormData) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const ignoreClickRef = useRef(false);

  const [steps, setSteps] = useState<DesignerStep[]>(() => initialSteps());
  const [selectedId, setSelectedId] = useState(steps[0]?.id ?? "");
  const [globalVariables, setGlobalVariables] = useState<WorkflowGlobalVariable[]>(
    [],
  );
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [panState, setPanState] = useState<{
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  const selectedStep =
    steps.find((step) => step.id === selectedId) ?? steps[0] ?? null;
  const selectedIndex = selectedStep
    ? steps.findIndex((step) => step.id === selectedStep.id)
    : -1;
  const connectingStep = connectingFromId
    ? steps.find((step) => step.id === connectingFromId) ?? null
    : null;
  const effectiveCustomerVisible = selectedStep
    ? selectedStep.isExternal
      ? true
      : selectedStep.customerVisible
    : false;

  useEffect(() => {
    if (!steps.length) {
      setSelectedId("");
      return;
    }
    if (!steps.some((step) => step.id === selectedId)) {
      setSelectedId(steps[0]!.id);
    }
  }, [steps, selectedId]);

  useEffect(() => {
    if (!draggingId) return;

    const handleMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        ignoreClickRef.current = true;
      }
      const nextX = Math.min(
        Math.max(0, drag.originX + dx),
        CANVAS_WIDTH - NODE_WIDTH,
      );
      const nextY = Math.min(
        Math.max(0, drag.originY + dy),
        CANVAS_HEIGHT - NODE_HEIGHT,
      );
      setSteps((prev) =>
        prev.map((step) =>
          step.id === drag.id
            ? { ...step, position: { x: nextX, y: nextY } }
            : step,
        ),
      );
    };

    const handleUp = () => {
      dragRef.current = null;
      setDraggingId(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [draggingId]);

  useEffect(() => {
    if (!panState) return;

    const handleMove = (event: PointerEvent) => {
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;
      const dx = event.clientX - panState.startX;
      const dy = event.clientY - panState.startY;
      scrollEl.scrollLeft = panState.scrollLeft - dx;
      scrollEl.scrollTop = panState.scrollTop - dy;
    };

    const handleUp = () => {
      setPanState(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [panState]);

  const updateStep = (id: string, patch: Partial<DesignerStep>) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, ...patch } : step)),
    );
  };

  const addStep = () => {
    const id = createId("step");
    const index = steps.length;
    const next: DesignerStep = {
      id,
      name: `Step ${index + 1}`,
      ownerRole: "OPERATIONS",
      customerVisible: true,
      isExternal: false,
      slaHours: "",
      dependsOn: index > 0 ? [steps[index - 1]!.id] : [],
      position: nextPosition(index),
      schema: { version: 1, fields: [] },
    };
    setSteps((prev) => [...prev, next]);
    setSelectedId(id);
  };

  const removeStep = (id: string) => {
    setSteps((prev) => {
      const next = prev.filter((step) => step.id !== id);
      return next.map((step) => ({
        ...step,
        dependsOn: step.dependsOn.filter((dep) => dep !== id),
      }));
    });
    if (selectedId === id) {
      const fallback = steps.find((step) => step.id !== id)?.id ?? "";
      setSelectedId(fallback);
    }
    if (connectingFromId === id) {
      setConnectingFromId(null);
    }
  };

  const toggleDependency = (targetId: string, sourceId: string) => {
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id !== targetId) return step;
        const next = new Set(step.dependsOn);
        if (next.has(sourceId)) {
          next.delete(sourceId);
        } else {
          next.add(sourceId);
        }
        return { ...step, dependsOn: Array.from(next) };
      }),
    );
  };

  const startNodeDrag = (
    step: DesignerStep,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    ignoreClickRef.current = false;
    dragRef.current = {
      id: step.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: step.position.x,
      originY: step.position.y,
    };
    setDraggingId(step.id);
    setSelectedId(step.id);
  };

  const handleNodeClick = (stepId: string) => {
    if (ignoreClickRef.current) {
      ignoreClickRef.current = false;
      return;
    }
    setSelectedId(stepId);
    if (connectingFromId && connectingFromId !== stepId) {
      const sourceIndex = steps.findIndex((step) => step.id === connectingFromId);
      const targetIndex = steps.findIndex((step) => step.id === stepId);
      if (sourceIndex > -1 && targetIndex > sourceIndex) {
        toggleDependency(stepId, connectingFromId);
      }
      setConnectingFromId(null);
    }
  };

  const startConnect = (stepId: string) => {
    setSelectedId(stepId);
    setConnectingFromId((prev) => (prev === stepId ? null : stepId));
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("[data-node]")
    ) {
      return;
    }
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    event.preventDefault();
    setConnectingFromId(null);
    setPanState({
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: scrollEl.scrollLeft,
      scrollTop: scrollEl.scrollTop,
    });
  };

  const edges = useMemo<DesignerEdge[]>(() => {
    const result: DesignerEdge[] = [];
    for (const step of steps) {
      for (const dep of step.dependsOn) {
        result.push({ from: dep, to: step.id });
      }
    }
    return result;
  }, [steps]);

  const usedGlobalsByStep = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const all = new Set<string>();
    for (const step of steps) {
      const used = new Set<string>();
      collectLinkedGlobals(step.schema.fields, used);
      map.set(step.id, used);
      for (const id of used) all.add(id);
    }
    return { map, all };
  }, [steps]);

  const stepsPayload = useMemo(() => {
    return steps.map((step) => ({
      id: step.id,
      name: step.name,
      ownerRole: step.ownerRole,
      customerVisible: step.customerVisible,
      isExternal: step.isExternal,
      slaHours: step.slaHours ? Number(step.slaHours) : null,
      dependsOn: step.dependsOn,
      fieldSchemaKey: `fieldSchema_${step.id}`,
    }));
  }, [steps]);

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Workflow details</h2>
          <div className="mt-4 space-y-3">
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">Name</div>
              <input
                name="name"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                placeholder="Sea import flow"
                required
              />
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">
                Description
              </div>
              <textarea
                name="description"
                className="min-h-24 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                placeholder="How the workflow should be used..."
              />
            </label>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-900">Global variables</h2>
          <div className="mt-4">
            <GlobalVariablesBuilder
              name="globalVariablesJson"
              initialVariables={[]}
              onChange={setGlobalVariables}
            />
            <div className="mt-2 text-xs text-zinc-500">
              Use variables in step fields for dates and countdowns.
            </div>
          </div>
        </div>
      </div>

      <input type="hidden" name="stepsJson" value={JSON.stringify(stepsPayload)} />

      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">Steps</h2>
            <button
              type="button"
              onClick={addStep}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Add step
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setSelectedId(step.id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-xs",
                  selectedId === step.id
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                )}
              >
                <div className="text-[10px] uppercase text-zinc-400">
                  Step {index + 1}
                </div>
                <div className="mt-1 font-semibold">
                  {step.name || "Untitled step"}
                </div>
                <div className="mt-1 text-[11px] text-zinc-400">
                  {step.schema.fields.length} fields
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">Canvas</h2>
              <div className="text-xs text-zinc-500">
                Drag nodes to move, drag the background to pan, click the dot to
                connect to later steps.
              </div>
            </div>
            <div className="text-xs text-zinc-400">Grid view</div>
          </div>

          {connectingStep ? (
            <div className="mt-3 text-xs text-blue-700">
              Connecting from: {connectingStep.name || "Untitled step"}. Click
              another node to link.
            </div>
          ) : null}

          <div
            ref={scrollRef}
            className={cn(
              "mt-4 overflow-auto rounded-xl border border-zinc-100",
              panState ? "cursor-grabbing" : "cursor-grab",
            )}
            onPointerDown={startPan}
          >
            <div
              className="relative"
              style={{
                width: CANVAS_WIDTH,
                height: CANVAS_HEIGHT,
                backgroundImage:
                  "radial-gradient(#e5e7eb 1px, transparent 1px)",
                backgroundSize: "24px 24px",
                touchAction: "none",
              }}
            >
              <svg
                className="absolute inset-0"
                width={CANVAS_WIDTH}
                height={CANVAS_HEIGHT}
                viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
              >
                <defs>
                  <marker
                    id="arrow-head"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#d4d4d8" />
                  </marker>
                </defs>
                {edges.map((edge) => {
                  const from = steps.find((step) => step.id === edge.from);
                  const to = steps.find((step) => step.id === edge.to);
                  if (!from || !to) return null;
                  const startX = from.position.x + NODE_WIDTH / 2;
                  const startY = from.position.y + NODE_HEIGHT / 2;
                  const endX = to.position.x + NODE_WIDTH / 2;
                  const endY = to.position.y + NODE_HEIGHT / 2;
                  const midX = (startX + endX) / 2;
                  const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
                  return (
                    <path
                      key={`${edge.from}-${edge.to}`}
                      d={path}
                      stroke="#d4d4d8"
                      strokeWidth="2"
                      fill="none"
                      markerEnd="url(#arrow-head)"
                    />
                  );
                })}
              </svg>

              {steps.map((step, index) => {
                const selected = selectedId === step.id;
                const isConnectingSource = connectingFromId === step.id;
                return (
                  <div
                    key={step.id}
                    data-node="true"
                    onClick={() => handleNodeClick(step.id)}
                    onPointerDown={(event) => startNodeDrag(step, event)}
                    className={cn(
                      "absolute z-10 rounded-xl border bg-white p-3 text-left shadow-sm transition",
                      selected
                        ? "border-zinc-900 ring-2 ring-zinc-200"
                        : "border-zinc-200 hover:border-zinc-400",
                      draggingId === step.id ? "cursor-grabbing" : "cursor-grab",
                    )}
                    style={{
                      left: step.position.x,
                      top: step.position.y,
                      width: NODE_WIDTH,
                      height: NODE_HEIGHT,
                    }}
                  >
                    <button
                      type="button"
                      data-connector="true"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        startConnect(step.id);
                      }}
                      className={cn(
                        "absolute -right-2 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border",
                        isConnectingSource
                          ? "border-blue-500 bg-blue-500"
                          : "border-zinc-300 bg-white",
                      )}
                      aria-label="Connect to another step"
                    />
                    <div className="text-[10px] uppercase text-zinc-400">
                      Step {index + 1}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-zinc-900">
                      {step.name || "Untitled step"}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      {step.ownerRole} - {step.schema.fields.length} fields
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Inspector</h2>
        {selectedStep ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs text-zinc-500">Selected step</div>
                <div className="text-sm font-semibold text-zinc-900">
                  {selectedStep.name || "Untitled step"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeStep(selectedStep.id)}
                className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Remove step
              </button>
            </div>

            <label className="block">
              <div className="mb-1 text-sm font-medium text-zinc-800">
                Step name
              </div>
              <input
                value={selectedStep.name}
                onChange={(e) =>
                  updateStep(selectedStep.id, { name: e.target.value })
                }
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <div className="mb-1 text-sm font-medium text-zinc-800">
                  Owner role
                </div>
                <select
                  value={selectedStep.ownerRole}
                  onChange={(e) =>
                    updateStep(selectedStep.id, {
                      ownerRole: e.target.value as Role,
                    })
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  {Roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="mb-1 text-sm font-medium text-zinc-800">
                  SLA (hours)
                </div>
                <input
                  value={selectedStep.slaHours}
                  onChange={(e) =>
                    updateStep(selectedStep.id, { slaHours: e.target.value })
                  }
                  type="number"
                  min={0}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  placeholder="24"
                />
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={selectedStep.customerVisible}
                  onChange={(e) =>
                    updateStep(selectedStep.id, {
                      customerVisible: e.target.checked,
                    })
                  }
                />
                Customer visible
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={selectedStep.isExternal}
                  onChange={(e) =>
                    updateStep(selectedStep.id, {
                      isExternal: e.target.checked,
                    })
                  }
                />
                External step
              </label>
            </div>

            {selectedIndex > 0 ? (
              <div>
                <div className="mb-2 text-sm font-medium text-zinc-800">
                  Depends on
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {steps.slice(0, selectedIndex).map((step) => {
                    const checked = selectedStep.dependsOn.includes(step.id);
                    return (
                      <label
                        key={`${selectedStep.id}-dep-${step.id}`}
                        className="flex items-center gap-2 text-sm text-zinc-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selectedStep.dependsOn, step.id]
                              : selectedStep.dependsOn.filter(
                                  (id) => id !== step.id,
                                );
                            updateStep(selectedStep.id, { dependsOn: next });
                          }}
                        />
                        {step.name || "Untitled step"}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium text-zinc-800">
                  Fields
                </div>
                {steps.map((step) => {
                  if (step.id !== selectedStep.id) return null;
                  const stepUsed =
                    usedGlobalsByStep.map.get(step.id) ?? new Set<string>();
                  const blockedGlobals = Array.from(usedGlobalsByStep.all).filter(
                    (id) => !stepUsed.has(id),
                  );
                  return (
                    <div key={step.id}>
                      <StepFieldBuilder
                        name={`fieldSchema_${step.id}`}
                        initialSchema={step.schema}
                        globalVariables={globalVariables}
                        blockedGlobalVariableIds={blockedGlobals}
                        onSchemaChange={(schema) =>
                          updateStep(step.id, { schema })
                        }
                      />
                    </div>
                  );
                })}
              </div>

              <div>
                <div className="mb-2 text-sm font-medium text-zinc-800">
                  Preview
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 text-xs font-medium text-zinc-600">
                      Internal preview
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                      <InternalPreviewFields
                        schema={selectedStep.schema}
                        globalVariables={globalVariables}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-medium text-zinc-600">
                      Customer preview
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white p-3">
                      {!effectiveCustomerVisible ? (
                        <div className="text-xs text-zinc-500">
                          Hidden from the customer portal.
                        </div>
                      ) : selectedStep.schema.fields.length ? (
                        <div className="space-y-2 text-xs text-zinc-600">
                          {collectCustomerPreviewRows(
                            selectedStep.schema.fields,
                          ).map((row, index) => (
                            <div
                              key={`${selectedStep.id}-preview-${index}`}
                              className="flex flex-wrap items-center justify-between gap-3"
                            >
                              <div className="font-medium text-zinc-700">
                                {row.label}
                              </div>
                              <div className="text-zinc-500">{row.detail}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-zinc-500">
                          Add fields to preview the customer view.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 text-sm text-zinc-500">
            Select a step to edit fields and preview.
          </div>
        )}

        {steps.map((step) => {
          if (step.id === selectedStep?.id) return null;
          return (
            <div key={`hidden-${step.id}`} className="hidden">
              <StepFieldBuilder
                name={`fieldSchema_${step.id}`}
                initialSchema={step.schema}
                globalVariables={globalVariables}
                blockedGlobalVariableIds={Array.from(usedGlobalsByStep.all)}
                onSchemaChange={(schema) =>
                  updateStep(step.id, { schema })
                }
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          pendingLabel="Creating..."
        >
          Create workflow
        </SubmitButton>
        <Link
          href="/workflows"
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
