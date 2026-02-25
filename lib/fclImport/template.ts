import "server-only";

import type { StepFieldDefinition, StepFieldSchema } from "@/lib/stepFields";
import type { Role } from "@/lib/domain";
import {
  addTemplateStep,
  createWorkflowTemplate,
  listWorkflowTemplates,
  listTemplateSteps,
  updateTemplateStep,
  type WorkflowTemplateStepRow,
} from "@/lib/data/workflows";
import { FCL_IMPORT_STEP_NAMES, FCL_IMPORT_TEMPLATE_NAME } from "./constants";

const containerGroup = (
  fields: StepFieldDefinition[],
  required = true,
): StepFieldDefinition => ({
  id: "containers",
  label: "Containers",
  type: "group",
  repeatable: true,
  required,
  fields,
});

const shipmentCreationSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "bl_number",
      label: "B/L number",
      type: "text",
      required: false,
    },
    containerGroup(
      [
      {
        id: "container_number",
        label: "Container number",
        type: "text",
        required: false,
      },
      ],
      false,
    ),
  ],
};

const vesselTrackingSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "eta",
      label: "Estimated time of arrival (ETA)",
      type: "date",
    },
    {
      id: "ata",
      label: "Actual time of arrival (ATA)",
      type: "date",
    },
  ],
};

const containersDischargeSchema: StepFieldSchema = {
  version: 1,
  fields: [
    containerGroup([
      {
        id: "container_number",
        label: "Container number",
        type: "text",
      },
      {
        id: "container_discharged",
        label: "Container discharged",
        type: "boolean",
      },
      {
        id: "container_discharged_date",
        label: "Discharged date",
        type: "date",
      },
      {
        id: "last_port_free_day",
        label: "Last port free day",
        type: "date",
      },
    ]),
  ],
};

const containerPullOutSchema: StepFieldSchema = {
  version: 1,
  fields: [
    containerGroup([
      {
        id: "container_number",
        label: "Container number",
        type: "text",
      },
      {
        id: "pull_out_token_date",
        label: "Pull-out token date",
        type: "date",
      },
      {
        id: "pull_out_token_slot",
        label: "Pull-out token time slot",
        type: "text",
      },
      {
        id: "pull_out_token_file",
        label: "Pull-out token file",
        type: "file",
      },
      {
        id: "pull_out_destination",
        label: "Destination",
        type: "text",
      },
      {
        id: "stock_tracking_enabled",
        label: "Enable stock tracking",
        type: "boolean",
      },
    ]),
  ],
};

const containerDeliverySchema: StepFieldSchema = {
  version: 1,
  fields: [
    containerGroup([
      {
        id: "container_number",
        label: "Container number",
        type: "text",
      },
      {
        id: "delivered_offloaded",
        label: "Container delivered or offloaded",
        type: "boolean",
      },
      {
        id: "delivered_offloaded_date",
        label: "Offload / delivery date",
        type: "date",
      },
      {
        id: "empty_returned_token_slot",
        label: "Empty return token time slot",
        type: "text",
      },
      {
        id: "total_weight_kg",
        label: "Total weight (kg)",
        type: "text",
      },
      {
        id: "total_packages",
        label: "Total packages",
        type: "text",
      },
      {
        id: "package_type",
        label: "Package type",
        type: "text",
      },
      {
        id: "cargo_description",
        label: "Cargo description",
        type: "text",
      },
      {
        id: "offload_pictures",
        label: "General offloading pictures",
        type: "group",
        repeatable: true,
        fields: [
          {
            id: "file",
            label: "Picture",
            type: "file",
          },
        ],
      },
      {
        id: "cargo_damage",
        label: "Cargo damage or missing",
        type: "boolean",
      },
      {
        id: "cargo_damage_remarks",
        label: "Damage remarks",
        type: "text",
      },
      {
        id: "cargo_damage_pictures",
        label: "Damage pictures",
        type: "group",
        repeatable: true,
        fields: [
          {
            id: "file",
            label: "Damage picture",
            type: "file",
          },
        ],
      },
      {
        id: "empty_returned_token_file",
        label: "Empty return token file",
        type: "file",
      },
      {
        id: "offload_location",
        label: "Offload location",
        type: "text",
      },
      {
        id: "empty_returned",
        label: "Empty container returned to port",
        type: "boolean",
      },
      {
        id: "empty_returned_date",
        label: "Empty return date",
        type: "date",
      },
    ]),
  ],
};

const orderReceivedSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "order_received",
      label: "Order received by Zaxon",
      type: "boolean",
    },
    {
      id: "order_received_date",
      label: "Order received date",
      type: "date",
    },
    {
      id: "order_received_remarks",
      label: "Order received remarks",
      type: "text",
    },
    {
      id: "order_received_file",
      label: "Order received file",
      type: "file",
    },
    {
      id: "order_received_files",
      label: "Order received files",
      type: "group",
      repeatable: true,
      fields: [
        {
          id: "file",
          label: "Order received file",
          type: "file",
        },
      ],
    },
  ],
};

const billOfLadingSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "bl_number",
      label: "B/L number",
      type: "text",
      required: true,
    },
    {
      id: "draft_bl_file",
      label: "Draft bill of lading",
      type: "file",
    },
    {
      id: "bl_type",
      label: "Bill of lading type",
      type: "choice",
      required: true,
      options: [
        {
          id: "telex",
          label: "Telex",
          fields: [
            {
              id: "telex_copy_not_released",
              label: "Telex copy (not released)",
              type: "boolean",
            },
            {
              id: "telex_copy_not_released_file",
              label: "Telex copy file (not released)",
              type: "file",
            },
            {
              id: "telex_copy_released",
              label: "Telex copy (released)",
              type: "boolean",
            },
            {
              id: "telex_copy_released_file",
              label: "Telex copy file (released)",
              type: "file",
            },
          ],
        },
        {
          id: "original",
          label: "Original",
          fields: [
            {
              id: "bl_copy",
              label: "B/L copy",
              type: "boolean",
            },
            {
              id: "bl_copy_file",
              label: "B/L copy file",
              type: "file",
            },
            {
              id: "original_received",
              label: "Original B/L received",
              type: "boolean",
            },
            {
              id: "original_received_file",
              label: "Original B/L received file",
              type: "file",
            },
            {
              id: "original_submitted",
              label: "Original B/L submitted to shipping line office",
              type: "boolean",
            },
            {
              id: "original_submitted_date",
              label: "Original B/L submitted date",
              type: "date",
            },
            {
              id: "original_surrendered",
              label: "Original B/L surrendered",
              type: "boolean",
            },
            {
              id: "original_surrendered_file",
              label: "Original B/L surrendered file",
              type: "file",
            },
          ],
        },
      ],
    },
  ],
};

const commercialInvoiceSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "invoice_option",
      label: "BOE invoice option",
      type: "text",
    },
    {
      id: "copy_invoice_received",
      label: "Copy invoice received",
      type: "boolean",
    },
    {
      id: "copy_invoice_file",
      label: "Copy invoice file",
      type: "file",
    },
    {
      id: "proceed_with_copy",
      label: "Proceed with copy documents",
      type: "boolean",
    },
    {
      id: "original_invoice_received",
      label: "Original commercial invoice received",
      type: "boolean",
    },
    {
      id: "original_invoice_file",
      label: "Original commercial invoice file",
      type: "file",
    },
    {
      id: "other_documents",
      label: "Other documents",
      type: "group",
      repeatable: true,
      fields: [
        {
          id: "document_name",
          label: "Document name",
          type: "text",
        },
        {
          id: "document_file",
          label: "Document file",
          type: "file",
        },
      ],
    },
  ],
};

const deliveryOrderSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "delivery_order_obtained",
      label: "Delivery order obtained",
      type: "boolean",
    },
    {
      id: "delivery_order_date",
      label: "Delivery order date",
      type: "date",
    },
    {
      id: "delivery_order_validity",
      label: "Delivery order validity",
      type: "date",
    },
  ],
};

const billOfEntrySchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "boe_date",
      label: "Bill of entry date",
      type: "date",
    },
    {
      id: "boe_number",
      label: "Bill of entry number",
      type: "text",
    },
    {
      id: "boe_file",
      label: "Bill of entry file",
      type: "file",
    },
  ],
};

const tokenBookingSchema: StepFieldSchema = {
  version: 1,
  fields: [
    containerGroup([
      {
        id: "container_number",
        label: "Container number",
        type: "text",
      },
      {
        id: "token_date",
        label: "Token date",
        type: "date",
      },
      {
        id: "token_file",
        label: "Token file",
        type: "file",
      },
    ]),
  ],
};

const returnTokenSchema: StepFieldSchema = {
  version: 1,
  fields: [
    containerGroup([
      {
        id: "container_number",
        label: "Container number",
        type: "text",
      },
      {
        id: "return_token_date",
        label: "Return token date",
        type: "date",
      },
      {
        id: "return_token_file",
        label: "Return token file",
        type: "file",
      },
    ]),
  ],
};

type TemplateStep = {
  name: string;
  ownerRole: Role;
  schema: StepFieldSchema;
  customerVisible?: boolean;
  isExternal?: boolean;
};

function normalizeJson(input: unknown) {
  try {
    return JSON.stringify(input ?? null);
  } catch {
    return "";
  }
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function shouldUpdateStepSchema(
  existing: WorkflowTemplateStepRow,
  expected: TemplateStep,
) {
  if (existing.owner_role !== expected.ownerRole) return true;
  if ((existing.customer_visible === 1) !== !!expected.customerVisible) return true;
  if ((existing.is_external === 1) !== !!expected.isExternal) return true;

  const existingSchema = parseJson(existing.field_schema_json);
  return normalizeJson(existingSchema) !== normalizeJson(expected.schema);
}

const TEMPLATE_STEPS: TemplateStep[] = [
  {
    name: FCL_IMPORT_STEP_NAMES.shipmentCreation,
    ownerRole: "SALES",
    schema: shipmentCreationSchema,
  },
  {
    name: FCL_IMPORT_STEP_NAMES.vesselTracking,
    ownerRole: "OPERATIONS",
    schema: vesselTrackingSchema,
    customerVisible: true,
    isExternal: true,
  },
  {
    name: FCL_IMPORT_STEP_NAMES.containersDischarge,
    ownerRole: "OPERATIONS",
    schema: containersDischargeSchema,
    customerVisible: true,
    isExternal: true,
  },
  {
    name: FCL_IMPORT_STEP_NAMES.containerPullOut,
    ownerRole: "OPERATIONS",
    schema: containerPullOutSchema,
    customerVisible: true,
    isExternal: true,
  },
  {
    name: FCL_IMPORT_STEP_NAMES.containerDelivery,
    ownerRole: "OPERATIONS",
    schema: containerDeliverySchema,
    customerVisible: true,
    isExternal: true,
  },
  {
    name: FCL_IMPORT_STEP_NAMES.orderReceived,
    ownerRole: "OPERATIONS",
    schema: orderReceivedSchema,
  },
  {
    name: FCL_IMPORT_STEP_NAMES.billOfLading,
    ownerRole: "CLEARANCE",
    schema: billOfLadingSchema,
  },
  {
    name: FCL_IMPORT_STEP_NAMES.commercialInvoice,
    ownerRole: "CLEARANCE",
    schema: commercialInvoiceSchema,
  },
  {
    name: FCL_IMPORT_STEP_NAMES.deliveryOrder,
    ownerRole: "CLEARANCE",
    schema: deliveryOrderSchema,
  },
  {
    name: FCL_IMPORT_STEP_NAMES.billOfEntry,
    ownerRole: "CLEARANCE",
    schema: billOfEntrySchema,
  },
  {
    name: FCL_IMPORT_STEP_NAMES.tokenBooking,
    ownerRole: "OPERATIONS",
    schema: tokenBookingSchema,
  },
  {
    name: FCL_IMPORT_STEP_NAMES.returnTokenBooking,
    ownerRole: "OPERATIONS",
    schema: returnTokenSchema,
  },
];

export async function ensureFclImportTemplate(input?: { createdByUserId?: number | null }) {
  const templates = await listWorkflowTemplates({
    includeArchived: true,
    isSubworkflow: false,
  });

  const existing = templates.find(
    (template) => template.name.toLowerCase() === FCL_IMPORT_TEMPLATE_NAME.toLowerCase(),
  );
  if (existing) {
    const existingSteps = await listTemplateSteps(existing.id);
    const existingByName = new Map(existingSteps.map((step) => [step.name, step]));
    for (const step of TEMPLATE_STEPS) {
      const current = existingByName.get(step.name);
      if (!current) {
        await addTemplateStep({
          templateId: existing.id,
          name: step.name,
          ownerRole: step.ownerRole,
          fieldSchemaJson: JSON.stringify(step.schema),
          customerVisible: step.customerVisible,
          isExternal: step.isExternal,
        });
        continue;
      }

      if (!shouldUpdateStepSchema(current, step)) continue;

      await updateTemplateStep({
        stepId: current.id,
        name: step.name,
        ownerRole: step.ownerRole,
        fieldSchemaJson: JSON.stringify(step.schema),
        customerVisible: step.customerVisible,
        isExternal: step.isExternal,
      });
    }
    return existing.id;
  }

  const templateId = await createWorkflowTemplate({
    name: FCL_IMPORT_TEMPLATE_NAME,
    description: "Structured workflow for FCL import clearance shipments.",
    createdByUserId: input?.createdByUserId ?? null,
  });

  for (const step of TEMPLATE_STEPS) {
    await addTemplateStep({
      templateId,
      name: step.name,
      ownerRole: step.ownerRole,
      fieldSchemaJson: JSON.stringify(step.schema),
      customerVisible: step.customerVisible,
      isExternal: step.isExternal,
    });
  }

  return templateId;
}
