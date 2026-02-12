import {
  fieldInputName,
  fieldRemovalName,
  type StepFieldValues,
} from "@/lib/stepFields";

export function fieldName(path: string[]) {
  return fieldInputName(path);
}

export function fieldRemoveName(path: string[]) {
  return fieldRemovalName(path);
}

export function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export function numberValue(value: unknown, fallback = 0): number {
  const raw = stringValue(value).trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export function boolValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  if (Object.getPrototypeOf(value) !== Object.prototype) return {};
  return value as Record<string, unknown>;
}

export function toGroupRows(values: StepFieldValues, groupId: string) {
  const raw = values[groupId];
  if (!Array.isArray(raw)) return [] as Array<Record<string, unknown>>;
  return raw.filter((entry) => !!entry && typeof entry === "object") as Array<
    Record<string, unknown>
  >;
}

export function stepCardTitle(stepName: string) {
  return stepName;
}

