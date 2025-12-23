export type WorkflowGlobalVariableType = "text" | "date" | "number";

export type WorkflowGlobalVariable = {
  id: string;
  label: string;
  type: WorkflowGlobalVariableType;
};

export type WorkflowGlobalValues = Record<string, string>;

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

export function parseWorkflowGlobalVariables(
  value: string | null | undefined,
): WorkflowGlobalVariable[] {
  const parsed = safeJsonParse(value, [] as WorkflowGlobalVariable[]);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      const id = typeof entry.id === "string" ? entry.id : "";
      const label = typeof entry.label === "string" ? entry.label : "";
      const type = entry.type as WorkflowGlobalVariableType;
      if (!id || !label) return null;
      if (type !== "text" && type !== "date" && type !== "number") return null;
      return { id, label, type };
    })
    .filter((entry): entry is WorkflowGlobalVariable => !!entry);
}

export function parseWorkflowGlobalValues(
  value: string | null | undefined,
): WorkflowGlobalValues {
  const parsed = safeJsonParse(value, {} as WorkflowGlobalValues);
  if (!isPlainObject(parsed)) return {};
  const result: WorkflowGlobalValues = {};
  for (const [key, raw] of Object.entries(parsed)) {
    if (typeof raw === "string") {
      result[key] = raw;
    } else if (raw === null || raw === undefined) {
      result[key] = "";
    } else {
      result[key] = String(raw);
    }
  }
  return result;
}
