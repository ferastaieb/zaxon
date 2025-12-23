export type StepFieldType = "text" | "date" | "number" | "file" | "group" | "choice";

export type StepFieldSchema = {
  version: 1;
  fields: StepFieldDefinition[];
};

export type StepFieldDefinition =
  | StepFieldBase
  | StepFieldGroup
  | StepFieldChoice;

export type StepFieldBase = {
  id: string;
  label: string;
  type: "text" | "date" | "number" | "file";
  required?: boolean;
  linkToGlobal?: string | null;
};

export type StepFieldGroup = {
  id: string;
  label: string;
  type: "group";
  required?: boolean;
  repeatable?: boolean;
  fields: StepFieldDefinition[];
};

export type StepFieldChoice = {
  id: string;
  label: string;
  type: "choice";
  required?: boolean;
  options: StepFieldChoiceOption[];
};

export type StepFieldChoiceOption = {
  id: string;
  label: string;
  is_final?: boolean;
  fields: StepFieldDefinition[];
};

export type StepFieldValue = string | StepFieldValues | StepFieldValue[];
export type StepFieldValues = Record<string, StepFieldValue>;

export type StepFieldUpdate = {
  path: string[];
  value: string;
};

export type StepFieldUpload = {
  path: string[];
  file: File;
};

export type StepFieldRequirementContext = {
  stepId: number;
  values: StepFieldValues;
  docTypes: Set<string>;
};

export const STEP_FIELD_DOC_PREFIX = "STEP_FIELD:";

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

export function parseStepFieldSchema(value: string | null | undefined): StepFieldSchema {
  const parsed = safeJsonParse(value, null as StepFieldSchema | null);
  if (!parsed || typeof parsed !== "object") return { version: 1, fields: [] };
  const fields = Array.isArray(parsed.fields)
    ? (parsed.fields as StepFieldDefinition[])
    : [];
  return { version: 1, fields };
}

export function schemaFromLegacyFields(labels: string[]): StepFieldSchema {
  return {
    version: 1,
    fields: labels.map((label) => ({
      id: label,
      label,
      type: "text",
      required: true,
    })),
  };
}

export function parseStepFieldValues(value: string | null | undefined): StepFieldValues {
  const parsed = safeJsonParse(value, null as StepFieldValues | null);
  return isPlainObject(parsed) ? (parsed as StepFieldValues) : {};
}

export function encodeFieldPath(segments: string[]): string {
  return segments.map((segment) => encodeURIComponent(segment)).join(".");
}

export function decodeFieldPath(path: string): string[] {
  if (!path) return [];
  return path.split(".").map((segment) => decodeURIComponent(segment));
}

export function fieldInputName(pathSegments: string[]): string {
  return `field:${encodeFieldPath(pathSegments)}`;
}

export function fieldRemovalName(pathSegments: string[]): string {
  return `field-remove:${encodeFieldPath(pathSegments)}`;
}

export function stepFieldDocType(stepId: number, encodedPath: string): string {
  return `${STEP_FIELD_DOC_PREFIX}${stepId}:${encodedPath}`;
}

export function parseStepFieldDocType(docType: string): { stepId: number; path: string } | null {
  if (!docType.startsWith(STEP_FIELD_DOC_PREFIX)) return null;
  const rest = docType.slice(STEP_FIELD_DOC_PREFIX.length);
  const parts = rest.split(":");
  if (parts.length < 2) return null;
  const stepId = Number(parts.shift());
  if (!Number.isFinite(stepId)) return null;
  return { stepId, path: parts.join(":") };
}

export function extractStepFieldUpdates(formData: FormData): StepFieldUpdate[] {
  const updates: StepFieldUpdate[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("field:")) continue;
    if (typeof value !== "string") continue;
    const path = decodeFieldPath(key.slice("field:".length));
    updates.push({ path, value: value.trim() });
  }
  return updates;
}

export function extractStepFieldUploads(formData: FormData): StepFieldUpload[] {
  const uploads: StepFieldUpload[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("field:")) continue;
    if (!(value instanceof File) || value.size <= 0) continue;
    const path = decodeFieldPath(key.slice("field:".length));
    uploads.push({ path, file: value });
  }
  return uploads;
}

export function extractStepFieldRemovals(formData: FormData): string[][] {
  const removals: string[][] = [];
  for (const [key] of formData.entries()) {
    if (!key.startsWith("field-remove:")) continue;
    const path = decodeFieldPath(key.slice("field-remove:".length));
    removals.push(path);
  }
  return removals;
}

export function applyStepFieldUpdates(
  existing: StepFieldValues,
  updates: StepFieldUpdate[],
): StepFieldValues {
  const next = cloneValue(existing) as StepFieldValues;
  for (const update of updates) {
    setPathValue(next, update.path, update.value);
  }
  return next;
}

export function applyStepFieldRemovals(
  existing: StepFieldValues,
  removals: string[][],
): StepFieldValues {
  const next = cloneValue(existing) as StepFieldValues;
  for (const removal of removals) {
    removePathValue(next, removal);
  }
  return next;
}

export function collectMissingFieldPaths(
  schema: StepFieldSchema,
  context: StepFieldRequirementContext,
): Set<string> {
  const missing = new Set<string>();
  collectMissingForFields(schema.fields, context, [], missing);
  return missing;
}

export function collectFlatFieldValues(
  schema: StepFieldSchema,
  values: StepFieldValues,
): Record<string, string> {
  const flat: Record<string, string> = {};
  collectFlatValues(schema.fields, values, flat);
  return flat;
}

export function describeFieldPath(
  schema: StepFieldSchema,
  pathSegments: string[],
): string | null {
  const labels: string[] = [];
  let fields = schema.fields;
  let idx = 0;
  while (idx < pathSegments.length) {
    const segment = pathSegments[idx];
    const field = fields.find((f) => f.id === segment);
    if (!field) break;
    labels.push(field.label);

    if (field.type === "group") {
      idx += 1;
      if (field.repeatable && idx < pathSegments.length && isNumeric(pathSegments[idx])) {
        labels.push(`Item ${Number(pathSegments[idx]) + 1}`);
        idx += 1;
      }
      fields = field.fields;
      continue;
    }
    if (field.type === "choice") {
      idx += 1;
      const optionId = pathSegments[idx];
      const option = field.options.find((o) => o.id === optionId);
      if (option) {
        labels.push(option.label);
        fields = option.fields;
        idx += 1;
        continue;
      }
      break;
    }
    idx += 1;
  }
  if (!labels.length) return null;
  return labels.join(" / ");
}

function collectFlatValues(
  fields: StepFieldDefinition[],
  values: StepFieldValues,
  out: Record<string, string>,
) {
  for (const field of fields) {
    const fieldValue = values[field.id];
    if (field.type === "text" || field.type === "number" || field.type === "date") {
      if (typeof fieldValue === "string" && fieldValue.trim()) {
        out[field.label] = fieldValue;
      }
      continue;
    }
    if (field.type === "group") {
      if (field.repeatable) {
        const items = Array.isArray(fieldValue) ? fieldValue : [];
        for (const item of items) {
          if (isPlainObject(item)) collectFlatValues(field.fields, item, out);
        }
      } else if (isPlainObject(fieldValue)) {
        collectFlatValues(field.fields, fieldValue, out);
      }
      continue;
    }
    if (field.type === "choice") {
      const choiceValues = isPlainObject(fieldValue) ? fieldValue : {};
      for (const option of field.options) {
        const optionValue = choiceValues[option.id];
        if (isPlainObject(optionValue)) {
          collectFlatValues(option.fields, optionValue, out);
        }
      }
    }
  }
}

function collectMissingForFields(
  fields: StepFieldDefinition[],
  context: StepFieldRequirementContext,
  basePath: string[],
  missing: Set<string>,
) {
  for (const field of fields) {
    const fieldPath = [...basePath, field.id];
    const encodedPath = encodeFieldPath(fieldPath);

    if (field.type === "text" || field.type === "number" || field.type === "date") {
      const value = getValueAtPath(context.values, fieldPath);
      if (field.required && !hasStringValue(value)) {
        missing.add(encodedPath);
      }
      continue;
    }

    if (field.type === "file") {
      const docType = stepFieldDocType(context.stepId, encodedPath);
      if (field.required && !context.docTypes.has(docType)) {
        missing.add(encodedPath);
      }
      continue;
    }

    if (field.type === "group") {
      const groupValue = getValueAtPath(context.values, fieldPath);
      const items = field.repeatable
        ? (Array.isArray(groupValue) ? groupValue : [])
        : [isPlainObject(groupValue) ? groupValue : {}];

      const activeIndexes: number[] = [];
      items.forEach((item, index) => {
        if (!isPlainObject(item)) return;
        const itemPath = field.repeatable ? [...fieldPath, String(index)] : fieldPath;
        if (hasAnyFieldValue(field.fields, context, itemPath, item)) {
          activeIndexes.push(index);
        }
      });

      if (activeIndexes.length === 0) {
        if (field.required) {
          missing.add(encodedPath);
        }
        continue;
      }

      activeIndexes.forEach((index) => {
        const item = items[index];
        if (!isPlainObject(item)) return;
        const itemPath = field.repeatable ? [...fieldPath, String(index)] : fieldPath;
        collectMissingForFields(field.fields, { ...context, values: item }, itemPath, missing);
      });
      continue;
    }

    if (field.type === "choice") {
      const choiceValue = getValueAtPath(context.values, fieldPath);
      const choiceValues = isPlainObject(choiceValue) ? choiceValue : {};
      const finalOption = field.options.find((o) => o.is_final);
      const finalComplete = finalOption
        ? isOptionComplete(finalOption, context, fieldPath, choiceValues)
        : false;

      let anyComplete = false;
      for (const option of field.options) {
        const complete = isOptionComplete(option, context, fieldPath, choiceValues);
        if (complete) anyComplete = true;
      }

      if (field.required && !anyComplete) {
        missing.add(encodedPath);
      }

      for (const option of field.options) {
        if (finalComplete && finalOption && option.id !== finalOption.id) {
          continue;
        }
        const optionValue = choiceValues[option.id];
        const optionPath = [...fieldPath, option.id];
        const hasValue = hasAnyFieldValue(option.fields, context, optionPath, optionValue);
        if (!hasValue) {
          continue;
        }
        const optionValues = isPlainObject(optionValue) ? optionValue : {};
        collectMissingForFields(
          option.fields,
          { ...context, values: optionValues },
          optionPath,
          missing,
        );
      }
    }
  }
}

function isOptionComplete(
  option: StepFieldChoiceOption,
  context: StepFieldRequirementContext,
  basePath: string[],
  choiceValues: Record<string, unknown>,
) {
  const optionValue = choiceValues[option.id];
  const optionValues = isPlainObject(optionValue) ? optionValue : {};
  if (!hasAnyFieldValue(option.fields, context, [...basePath, option.id], optionValues)) {
    return false;
  }
  const missing = new Set<string>();
  collectMissingForFields(
    option.fields,
    { ...context, values: optionValues },
    [...basePath, option.id],
    missing,
  );
  return missing.size === 0;
}

function hasAnyFieldValue(
  fields: StepFieldDefinition[],
  context: StepFieldRequirementContext,
  basePath: string[],
  values: unknown,
) {
  const container = isPlainObject(values) ? values : {};
  for (const field of fields) {
    const fieldPath = [...basePath, field.id];
    if (field.type === "text" || field.type === "number" || field.type === "date") {
      const value = container[field.id];
      if (hasStringValue(value)) return true;
      continue;
    }
    if (field.type === "file") {
      const encodedPath = encodeFieldPath(fieldPath);
      const docType = stepFieldDocType(context.stepId, encodedPath);
      if (context.docTypes.has(docType)) return true;
      continue;
    }
    if (field.type === "group") {
      const groupValue = container[field.id];
      if (field.repeatable) {
        const items = Array.isArray(groupValue) ? groupValue : [];
        for (let index = 0; index < items.length; index += 1) {
          const itemPath = [...fieldPath, String(index)];
          if (hasAnyFieldValue(field.fields, context, itemPath, items[index])) {
            return true;
          }
        }
      } else if (hasAnyFieldValue(field.fields, context, fieldPath, groupValue)) {
        return true;
      }
      continue;
    }
    if (field.type === "choice") {
      const choiceValue = container[field.id];
      const choiceValues = isPlainObject(choiceValue) ? choiceValue : {};
      for (const option of field.options) {
        if (hasAnyFieldValue(option.fields, context, [...fieldPath, option.id], choiceValues[option.id])) {
          return true;
        }
      }
    }
  }
  return false;
}

function hasStringValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getValueAtPath(values: StepFieldValues, path: string[]): StepFieldValue | undefined {
  let current: StepFieldValue | undefined = values;
  for (const segment of path) {
    if (!current) return undefined;
    if (Array.isArray(current)) {
      if (!isNumeric(segment)) return undefined;
      current = current[Number(segment)];
      continue;
    }
    if (!isPlainObject(current)) return undefined;
    current = current[segment] as StepFieldValue | undefined;
  }
  return current;
}

function setPathValue(values: StepFieldValues, path: string[], value: string) {
  if (!path.length) return;
  let current: StepFieldValue = values;
  for (let i = 0; i < path.length; i += 1) {
    const segment = path[i];
    const nextSegment = path[i + 1];
    const isIndex = isNumeric(segment);

    if (i === path.length - 1) {
      if (isIndex && Array.isArray(current)) {
        current[Number(segment)] = value;
      } else if (isPlainObject(current)) {
        current[segment] = value;
      }
      return;
    }

    if (isIndex) {
      if (!Array.isArray(current)) return;
      const index = Number(segment);
      const nextIsIndex = isNumeric(nextSegment);
      const nextValue = current[index];
      if (nextIsIndex) {
        if (!Array.isArray(nextValue)) current[index] = [];
      } else if (!isPlainObject(nextValue)) {
        current[index] = {};
      }
      current = current[index] as StepFieldValue;
      continue;
    }

    if (!isPlainObject(current)) return;
    const nextIsIndex = isNumeric(nextSegment);
    const nextValue = current[segment] as StepFieldValue | undefined;
    if (nextIsIndex) {
      if (!Array.isArray(nextValue)) current[segment] = [];
    } else if (!isPlainObject(nextValue)) {
      current[segment] = {};
    }
    current = current[segment] as StepFieldValue;
  }
}

function removePathValue(values: StepFieldValues, path: string[]) {
  if (!path.length) return;
  let current: StepFieldValue = values;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    if (Array.isArray(current)) {
      if (!isNumeric(segment)) return;
      current = current[Number(segment)];
      continue;
    }
    if (!isPlainObject(current)) return;
    current = current[segment] as StepFieldValue;
  }

  const last = path[path.length - 1];
  if (Array.isArray(current) && isNumeric(last)) {
    const index = Number(last);
    if (index >= 0 && index < current.length) {
      current.splice(index, 1);
    }
    return;
  }
  if (isPlainObject(current)) {
    delete current[last];
  }
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(cloneValue) as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = cloneValue(entry);
    }
    return out as T;
  }
  return value;
}

function isNumeric(value: string | undefined): boolean {
  if (!value) return false;
  return /^[0-9]+$/.test(value);
}
