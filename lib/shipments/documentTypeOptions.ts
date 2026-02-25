import type { ShipmentStepRow } from "@/lib/data/shipments";
import {
  encodeFieldPath,
  parseStepFieldSchema,
  parseStepFieldValues,
  stepFieldDocType,
  type StepFieldDefinition,
  type StepFieldValues,
} from "@/lib/stepFields";
import { jsonParse } from "@/lib/sql";

type StepLike = Pick<
  ShipmentStepRow,
  "id" | "required_document_types_json" | "field_schema_json" | "field_values_json"
>;

function isPlainObject(value: unknown): value is StepFieldValues {
  if (!value || typeof value !== "object") return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function collectStepFileDocTypes(input: {
  stepId: number;
  fields: StepFieldDefinition[];
  values: StepFieldValues;
  basePath: string[];
  out: Set<string>;
}) {
  for (const field of input.fields) {
    const fieldPath = [...input.basePath, field.id];
    if (field.type === "file") {
      input.out.add(stepFieldDocType(input.stepId, encodeFieldPath(fieldPath)));
      continue;
    }

    if (field.type === "group") {
      const groupValue = input.values[field.id];
      if (field.repeatable) {
        const rows = Array.isArray(groupValue)
          ? groupValue.filter((entry): entry is StepFieldValues => isPlainObject(entry))
          : [];

        if (rows.length === 0) {
          // Keep at least one template option for repeatable rows.
          collectStepFileDocTypes({
            stepId: input.stepId,
            fields: field.fields,
            values: {},
            basePath: [...fieldPath, "0"],
            out: input.out,
          });
        } else {
          rows.forEach((row, index) => {
            collectStepFileDocTypes({
              stepId: input.stepId,
              fields: field.fields,
              values: row,
              basePath: [...fieldPath, String(index)],
              out: input.out,
            });
          });
        }
      } else {
        collectStepFileDocTypes({
          stepId: input.stepId,
          fields: field.fields,
          values: isPlainObject(groupValue) ? groupValue : {},
          basePath: fieldPath,
          out: input.out,
        });
      }
      continue;
    }

    if (field.type === "choice") {
      const choiceValues = isPlainObject(input.values[field.id])
        ? (input.values[field.id] as StepFieldValues)
        : {};
      for (const option of field.options) {
        collectStepFileDocTypes({
          stepId: input.stepId,
          fields: option.fields,
          values: isPlainObject(choiceValues[option.id])
            ? (choiceValues[option.id] as StepFieldValues)
            : {},
          basePath: [...fieldPath, option.id],
          out: input.out,
        });
      }
    }
  }
}

export function listShipmentDocumentTypeOptions(steps: StepLike[]): string[] {
  const options = new Set<string>();

  for (const step of steps) {
    const requiredDocTypes = jsonParse(
      step.required_document_types_json,
      [] as string[],
    );
    for (const docType of requiredDocTypes) {
      const trimmed = String(docType ?? "").trim();
      if (trimmed) options.add(trimmed);
    }

    const schema = parseStepFieldSchema(step.field_schema_json);
    if (!schema.fields.length) continue;

    const values = parseStepFieldValues(step.field_values_json);
    collectStepFileDocTypes({
      stepId: step.id,
      fields: schema.fields,
      values,
      basePath: [],
      out: options,
    });
  }

  return Array.from(options).sort((left, right) => left.localeCompare(right));
}

