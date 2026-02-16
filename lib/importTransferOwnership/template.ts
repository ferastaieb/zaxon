import "server-only";

import type { Role } from "@/lib/domain";
import type { StepFieldSchema } from "@/lib/stepFields";
import {
  addTemplateStep,
  createWorkflowTemplate,
  listTemplateSteps,
  listWorkflowTemplates,
} from "@/lib/data/workflows";
import {
  IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES,
  IMPORT_TRANSFER_OWNERSHIP_TEMPLATE_NAME,
} from "./constants";

const overviewSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "request_received",
      label: "Request received",
      type: "boolean",
      required: true,
    },
    {
      id: "request_received_date",
      label: "Request received date",
      type: "date",
      required: true,
    },
  ],
};

const partiesCargoSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "supplier_company_name",
      label: "Supplier company name",
      type: "text",
      required: true,
    },
    {
      id: "supplier_location",
      label: "Supplier location / address",
      type: "text",
      required: true,
    },
    {
      id: "supplier_contact_person",
      label: "Supplier contact person",
      type: "text",
      required: true,
    },
    {
      id: "supplier_contact_details",
      label: "Supplier contact number/email",
      type: "text",
    },
    {
      id: "cargo_description",
      label: "Cargo description",
      type: "text",
    },
    {
      id: "package_type",
      label: "Package type",
      type: "text",
      required: true,
    },
    {
      id: "quantity",
      label: "Quantity",
      type: "number",
      required: true,
    },
    {
      id: "total_weight",
      label: "Total weight",
      type: "number",
      required: true,
    },
    {
      id: "remarks",
      label: "Remarks",
      type: "text",
    },
  ],
};

const documentsBoeSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "transfer_ownership_letter",
      label: "Transfer of ownership letter",
      type: "file",
      required: true,
    },
    {
      id: "delivery_advice",
      label: "Delivery advice",
      type: "file",
      required: true,
    },
    {
      id: "commercial_invoice",
      label: "Commercial invoice",
      type: "file",
      required: true,
    },
    {
      id: "packing_list",
      label: "Packing list",
      type: "file",
    },
    {
      id: "boe_prepared_by",
      label: "BOE prepared by",
      type: "text",
      required: true,
    },
    {
      id: "boe_number",
      label: "BOE number",
      type: "text",
      required: true,
    },
    {
      id: "boe_date",
      label: "BOE date",
      type: "date",
      required: true,
    },
    {
      id: "boe_upload",
      label: "BOE upload",
      type: "file",
      required: true,
    },
  ],
};

const collectionOutcomeSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "outcome_type",
      label: "Outcome type",
      type: "text",
      required: true,
    },
    {
      id: "planned_collection_date",
      label: "Planned collection date",
      type: "date",
    },
    {
      id: "collection_performed_by",
      label: "Collection performed by",
      type: "text",
      required: true,
    },
    {
      id: "vehicles",
      label: "Vehicles",
      type: "group",
      repeatable: true,
      fields: [
        {
          id: "vehicle_type",
          label: "Vehicle type",
          type: "text",
          required: true,
        },
        {
          id: "vehicle_size",
          label: "Vehicle size",
          type: "text",
          required: true,
        },
        {
          id: "vehicle_count",
          label: "Vehicle count",
          type: "number",
        },
      ],
    },
    {
      id: "cargo_collected",
      label: "Cargo collected",
      type: "boolean",
    },
    {
      id: "collected_date",
      label: "Collected date",
      type: "date",
    },
    {
      id: "cargo_delivered_to_zaxon",
      label: "Cargo delivered to Zaxon warehouse",
      type: "boolean",
    },
    {
      id: "dropoff_date",
      label: "Drop-off date",
      type: "date",
    },
    {
      id: "collected_by_export_truck",
      label: "Collected by export truck",
      type: "boolean",
    },
    {
      id: "direct_export_date",
      label: "Direct export collection date",
      type: "date",
    },
    {
      id: "pending_reason",
      label: "Pending reason",
      type: "text",
    },
    {
      id: "expected_collection_date",
      label: "Expected collection date",
      type: "date",
    },
  ],
};

const stockViewSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "stock_snapshot_confirmed",
      label: "Stock snapshot confirmed",
      type: "boolean",
    },
  ],
};

type TemplateStep = {
  name: string;
  ownerRole: Role;
  schema: StepFieldSchema;
};

const TEMPLATE_STEPS: TemplateStep[] = [
  {
    name: IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.overview,
    ownerRole: "SALES",
    schema: overviewSchema,
  },
  {
    name: IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.partiesCargo,
    ownerRole: "OPERATIONS",
    schema: partiesCargoSchema,
  },
  {
    name: IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.documentsBoe,
    ownerRole: "CLEARANCE",
    schema: documentsBoeSchema,
  },
  {
    name: IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.collectionOutcome,
    ownerRole: "OPERATIONS",
    schema: collectionOutcomeSchema,
  },
  {
    name: IMPORT_TRANSFER_OWNERSHIP_STEP_NAMES.stockView,
    ownerRole: "CLEARANCE",
    schema: stockViewSchema,
  },
];

export async function ensureImportTransferOwnershipTemplate(input?: {
  createdByUserId?: number | null;
}) {
  const templates = await listWorkflowTemplates({
    includeArchived: true,
    isSubworkflow: false,
  });

  const existing = templates.find(
    (template) =>
      template.name.toLowerCase() ===
      IMPORT_TRANSFER_OWNERSHIP_TEMPLATE_NAME.toLowerCase(),
  );
  if (existing) {
    const existingSteps = await listTemplateSteps(existing.id);
    const existingNames = new Set(existingSteps.map((step) => step.name));
    for (const step of TEMPLATE_STEPS) {
      if (existingNames.has(step.name)) continue;
      await addTemplateStep({
        templateId: existing.id,
        name: step.name,
        ownerRole: step.ownerRole,
        fieldSchemaJson: JSON.stringify(step.schema),
      });
    }
    return existing.id;
  }

  const templateId = await createWorkflowTemplate({
    name: IMPORT_TRANSFER_OWNERSHIP_TEMPLATE_NAME,
    description: "Workflow for import transfer of ownership operations.",
    createdByUserId: input?.createdByUserId ?? null,
  });

  for (const step of TEMPLATE_STEPS) {
    await addTemplateStep({
      templateId,
      name: step.name,
      ownerRole: step.ownerRole,
      fieldSchemaJson: JSON.stringify(step.schema),
    });
  }

  return templateId;
}
