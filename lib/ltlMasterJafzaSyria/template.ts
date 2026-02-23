import "server-only";

import type { Role } from "@/lib/domain";
import type { StepFieldDefinition, StepFieldSchema } from "@/lib/stepFields";
import {
  addTemplateStep,
  createWorkflowTemplate,
  listTemplateSteps,
  listWorkflowTemplates,
} from "@/lib/data/workflows";
import {
  LTL_MASTER_JAFZA_SYRIA_STEP_NAMES,
  LTL_MASTER_JAFZA_SYRIA_TEMPLATE_NAME,
  LTL_MASTER_JAFZA_SYRIA_SERVICE_TYPE,
  LTL_SUBSHIPMENT_STEP_NAMES,
  LTL_SUBSHIPMENT_TEMPLATE_NAME,
} from "./constants";

const truckGroupSchema: StepFieldDefinition = {
  id: "trucks",
  label: "Trucks",
  type: "group",
  repeatable: true,
  fields: [
    {
      id: "truck_reference",
      label: "Truck reference",
      type: "text",
    },
    {
      id: "booking_status",
      label: "Booking status",
      type: "text",
    },
    {
      id: "truck_booked",
      label: "Truck booked",
      type: "boolean",
    },
    {
      id: "booking_date",
      label: "Booking date",
      type: "date",
    },
    {
      id: "estimated_loading_date",
      label: "Estimated loading date",
      type: "date",
    },
    {
      id: "truck_number",
      label: "Truck number",
      type: "text",
    },
    {
      id: "trailer_type",
      label: "Trailer type",
      type: "text",
    },
    {
      id: "driver_name",
      label: "Driver name",
      type: "text",
    },
    {
      id: "driver_contact",
      label: "Driver contact",
      type: "text",
    },
    {
      id: "cancellation_reason",
      label: "Cancellation reason",
      type: "text",
    },
    {
      id: "booking_notes",
      label: "Booking remarks",
      type: "text",
    },
  ],
};

const masterShipmentCreationSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "service_type",
      label: "Service type",
      type: "text",
      required: true,
    },
    {
      id: "planned_loading_date",
      label: "Planned loading date",
      type: "date",
    },
    {
      id: "notes",
      label: "Notes",
      type: "text",
    },
  ],
};

const trucksDetailsSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "total_trucks_planned",
      label: "Total trucks planned",
      type: "number",
    },
    {
      id: "trucks_booking_required_by",
      label: "Trucks booking required by",
      type: "date",
    },
    {
      id: "planned_trailers",
      label: "Planned trailers",
      type: "group",
      repeatable: true,
      fields: [
        {
          id: "trailer_type",
          label: "Trailer type",
          type: "text",
        },
      ],
    },
    {
      id: "planned_trucks_snapshot",
      label: "Planned trucks snapshot",
      type: "number",
    },
    {
      id: "actual_trucks_count",
      label: "Actual trucks count",
      type: "number",
    },
    {
      id: "variance_notes",
      label: "Variance notes",
      type: "text",
    },
    truckGroupSchema,
  ],
};

const addCustomerShipmentsSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "last_subshipment_at",
      label: "Last subshipment created at",
      type: "date",
    },
  ],
};

const loadingExecutionSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "close_loading",
      label: "Close loading",
      type: "boolean",
    },
    {
      id: "close_loading_at",
      label: "Close loading date",
      type: "date",
    },
  ],
};

const exportInvoiceSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "invoice_number",
      label: "Invoice number",
      type: "text",
      required: true,
    },
    {
      id: "invoice_date",
      label: "Invoice date",
      type: "date",
      required: true,
    },
    {
      id: "invoice_upload",
      label: "Invoice upload",
      type: "file",
      required: true,
    },
    {
      id: "invoice_finalized",
      label: "Finalized",
      type: "boolean",
    },
  ],
};

const customsAgentsSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "jebel_ali_agent_name",
      label: "Jebel Ali FZ clearing agent",
      type: "text",
      required: true,
    },
    {
      id: "sila_agent_name",
      label: "Sila border clearing agent",
      type: "text",
      required: true,
    },
    {
      id: "batha_agent_name",
      label: "Batha border clearing agent",
      type: "text",
      required: true,
    },
    {
      id: "omari_agent_name",
      label: "Omari border clearing agent",
      type: "text",
      required: true,
    },
    {
      id: "naseeb_clearance_mode",
      label: "Naseeb border clearance mode",
      type: "text",
      required: true,
    },
    {
      id: "naseeb_agent_name",
      label: "Naseeb agent name",
      type: "text",
      required: true,
    },
    {
      id: "syria_consignee_name",
      label: "Syria consignee name",
      type: "text",
    },
    {
      id: "show_syria_consignee_to_client",
      label: "Show consignee to client",
      type: "text",
    },
    {
      id: "naseeb_client_final_choice",
      label: "Client final choice",
      type: "text",
    },
  ],
};

const trackingUaeSchema: StepFieldSchema = {
  version: 1,
  fields: [
    { id: "jebel_ali_declaration_date", label: "Jebel Ali declaration date", type: "date" },
    {
      id: "jebel_ali_declaration_upload",
      label: "Jebel Ali declaration upload",
      type: "file",
    },
    { id: "jebel_ali_trucks_sealed", label: "Trucks sealed", type: "boolean" },
    { id: "jebel_ali_sealed_date", label: "Sealed date", type: "date" },
    { id: "jebel_ali_exit", label: "Exit Jebel Ali", type: "boolean" },
    { id: "jebel_ali_exit_date", label: "Exit Jebel Ali date", type: "date" },
    { id: "sila_declaration_date", label: "Sila declaration date", type: "date" },
    { id: "sila_declaration_upload", label: "Sila declaration upload", type: "file" },
    { id: "sila_arrived", label: "Arrived at Sila", type: "boolean" },
    { id: "sila_arrived_date", label: "Arrived at Sila date", type: "date" },
    { id: "sila_exit", label: "Exit Sila", type: "boolean" },
    { id: "sila_exit_date", label: "Exit Sila date", type: "date" },
  ],
};

const trackingKsaSchema: StepFieldSchema = {
  version: 1,
  fields: [
    { id: "batha_declaration_date", label: "Batha declaration date", type: "date" },
    { id: "batha_declaration_upload", label: "Batha declaration upload", type: "file" },
    { id: "batha_arrived", label: "Arrived at Batha", type: "boolean" },
    { id: "batha_arrived_date", label: "Arrived at Batha date", type: "date" },
    { id: "batha_exit", label: "Exit Batha", type: "boolean" },
    { id: "batha_exit_date", label: "Exit Batha date", type: "date" },
    { id: "hadietha_exit", label: "Exit Hadietha", type: "boolean" },
    { id: "hadietha_exit_date", label: "Exit Hadietha date", type: "date" },
  ],
};

const trackingJordanSchema: StepFieldSchema = {
  version: 1,
  fields: [
    { id: "omari_declaration_date", label: "Omari declaration date", type: "date" },
    { id: "omari_declaration_upload", label: "Omari declaration upload", type: "file" },
    { id: "omari_arrived", label: "Arrived at Omari", type: "boolean" },
    { id: "omari_arrived_date", label: "Arrived at Omari date", type: "date" },
    { id: "omari_exit", label: "Exit Omari", type: "boolean" },
    { id: "omari_exit_date", label: "Exit Omari date", type: "date" },
    { id: "jaber_exit", label: "Exit Jaber", type: "boolean" },
    { id: "jaber_exit_date", label: "Exit Jaber date", type: "date" },
  ],
};

const trackingSyriaSchema: StepFieldSchema = {
  version: 1,
  fields: [
    { id: "syria_clearance_mode", label: "Syria clearance mode", type: "text" },
    { id: "syria_declaration_date", label: "Syria declaration date", type: "date" },
    { id: "syria_declaration_upload", label: "Syria declaration upload", type: "file" },
    { id: "syria_arrived", label: "Arrived at Syria border", type: "boolean" },
    { id: "syria_arrived_date", label: "Arrived at Syria border date", type: "date" },
    { id: "syria_exit", label: "Exit Syria border", type: "boolean" },
    { id: "syria_exit_date", label: "Exit Syria border date", type: "date" },
    { id: "syria_delivered", label: "Delivered", type: "boolean" },
    { id: "syria_delivered_date", label: "Delivered date", type: "date" },
    { id: "syria_offload_location", label: "Offload location", type: "text" },
  ],
};

const syriaWarehouseFinalDeliverySchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "arrived_zaxon_syria_warehouse",
      label: "Arrived at Zaxon Syria warehouse",
      type: "boolean",
    },
    { id: "arrival_date", label: "Arrival date", type: "date" },
    {
      id: "offloaded_zaxon_syria_warehouse",
      label: "Offloaded at Zaxon Syria warehouse",
      type: "boolean",
    },
    { id: "offload_date", label: "Offload date", type: "date" },
    {
      id: "damaged_missing_notes",
      label: "Damaged or missing notes",
      type: "text",
    },
    { id: "offload_photos", label: "Offload photos", type: "file" },
  ],
};

const importShipmentGroup: StepFieldDefinition = {
  id: "import_shipments",
  label: "Import shipments",
  type: "group",
  repeatable: true,
  fields: [
    { id: "source_shipment_id", label: "Source shipment id", type: "text" },
    { id: "import_shipment_reference", label: "Import shipment number", type: "text" },
    { id: "client_number", label: "Client number", type: "text" },
    { id: "import_boe_number", label: "Import BOE number", type: "text" },
    { id: "processed_available", label: "Import processed / available", type: "boolean" },
    { id: "non_physical_stock", label: "Non-physical stock", type: "boolean" },
    { id: "imported_weight", label: "Imported weight", type: "number" },
    { id: "imported_quantity", label: "Imported quantity", type: "number" },
    {
      id: "already_allocated_weight",
      label: "Already allocated weight",
      type: "number",
    },
    {
      id: "already_allocated_quantity",
      label: "Already allocated quantity",
      type: "number",
    },
    { id: "package_type", label: "Cargo package type", type: "text" },
    { id: "cargo_description", label: "Cargo description", type: "text" },
    { id: "allocated_weight", label: "Allocated weight", type: "number" },
    { id: "allocated_quantity", label: "Allocated quantity", type: "number" },
  ],
};

const subshipmentDetailsSchema: StepFieldSchema = {
  version: 1,
  fields: [
    { id: "client_name", label: "Client name", type: "text", required: true },
    {
      id: "client_party_id",
      label: "Client party id",
      type: "text",
      required: true,
    },
    { id: "total_cargo_weight", label: "Total cargo weight", type: "number" },
    { id: "total_cargo_volume", label: "Total cargo volume", type: "number" },
    importShipmentGroup,
  ],
};

const subshipmentLoadingSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "loaded_into_truck",
      label: "Loaded into truck",
      type: "boolean",
    },
    {
      id: "confirmed_weight",
      label: "Confirmed weight",
      type: "number",
    },
    {
      id: "confirmed_volume",
      label: "Confirmed volume",
      type: "number",
    },
    {
      id: "loading_photos",
      label: "Loading photos",
      type: "file",
    },
    { id: "remarks", label: "Remarks", type: "text" },
  ],
};

const subshipmentFinalHandoverSchema: StepFieldSchema = {
  version: 1,
  fields: [
    { id: "handover_method", label: "Handover method", type: "text", required: true },
    {
      id: "collected_by_customer",
      label: "Collected by customer",
      type: "boolean",
    },
    { id: "collection_date", label: "Collection date", type: "date" },
    { id: "receiver_name_id", label: "Receiver name/ID", type: "text" },
    { id: "delivery_city_area", label: "Delivery city/area", type: "text" },
    { id: "out_for_delivery", label: "Out for delivery", type: "boolean" },
    {
      id: "out_for_delivery_date",
      label: "Out for delivery date",
      type: "date",
    },
    { id: "delivered", label: "Delivered", type: "boolean" },
    { id: "delivery_date", label: "Delivery date", type: "date" },
  ],
};

type TemplateStep = {
  name: string;
  ownerRole: Role;
  schema: StepFieldSchema;
  customerVisible?: boolean;
  isExternal?: boolean;
};

const MASTER_STEPS: TemplateStep[] = [
  {
    name: LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.shipmentCreation,
    ownerRole: "SALES",
    schema: masterShipmentCreationSchema,
  },
  {
    name: LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trucksDetails,
    ownerRole: "OPERATIONS",
    schema: trucksDetailsSchema,
  },
  {
    name: LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.addCustomerShipments,
    ownerRole: "OPERATIONS",
    schema: addCustomerShipmentsSchema,
  },
  {
    name: LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.loadingExecution,
    ownerRole: "OPERATIONS",
    schema: loadingExecutionSchema,
  },
  {
    name: LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.exportInvoice,
    ownerRole: "CLEARANCE",
    schema: exportInvoiceSchema,
  },
  {
    name: LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.customsAgentsAllocation,
    ownerRole: "CLEARANCE",
    schema: customsAgentsSchema,
  },
  {
    name: LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingUae,
    ownerRole: "OPERATIONS",
    schema: trackingUaeSchema,
    customerVisible: true,
    isExternal: true,
  },
  {
    name: LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingKsa,
    ownerRole: "OPERATIONS",
    schema: trackingKsaSchema,
    customerVisible: true,
    isExternal: true,
  },
  {
    name: LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingJordan,
    ownerRole: "OPERATIONS",
    schema: trackingJordanSchema,
    customerVisible: true,
    isExternal: true,
  },
  {
    name: LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.trackingSyria,
    ownerRole: "OPERATIONS",
    schema: trackingSyriaSchema,
    customerVisible: true,
    isExternal: true,
  },
  {
    name: LTL_MASTER_JAFZA_SYRIA_STEP_NAMES.syriaWarehouseFinalDelivery,
    ownerRole: "OPERATIONS",
    schema: syriaWarehouseFinalDeliverySchema,
  },
];

const SUBSHIPMENT_STEPS: TemplateStep[] = [
  {
    name: LTL_SUBSHIPMENT_STEP_NAMES.detailsAndImports,
    ownerRole: "OPERATIONS",
    schema: subshipmentDetailsSchema,
  },
  {
    name: LTL_SUBSHIPMENT_STEP_NAMES.loadingExecution,
    ownerRole: "OPERATIONS",
    schema: subshipmentLoadingSchema,
  },
  {
    name: LTL_SUBSHIPMENT_STEP_NAMES.finalHandover,
    ownerRole: "OPERATIONS",
    schema: subshipmentFinalHandoverSchema,
  },
];

async function ensureTemplateByName(input: {
  templateName: string;
  description: string;
  steps: TemplateStep[];
  createdByUserId?: number | null;
}) {
  const templates = await listWorkflowTemplates({
    includeArchived: true,
    isSubworkflow: false,
  });

  const existing = templates.find(
    (template) =>
      template.name.toLowerCase() === input.templateName.toLowerCase(),
  );
  if (existing) {
    const existingSteps = await listTemplateSteps(existing.id);
    const existingNames = new Set(existingSteps.map((step) => step.name));
    for (const step of input.steps) {
      if (existingNames.has(step.name)) continue;
      await addTemplateStep({
        templateId: existing.id,
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
    name: input.templateName,
    description: input.description,
    createdByUserId: input.createdByUserId ?? null,
  });

  for (const step of input.steps) {
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

export async function ensureLtlMasterJafzaSyriaTemplate(input?: {
  createdByUserId?: number | null;
}) {
  return await ensureTemplateByName({
    templateName: LTL_MASTER_JAFZA_SYRIA_TEMPLATE_NAME,
    description:
      `Consolidated LTL master workflow for JAFZA to Syria (${LTL_MASTER_JAFZA_SYRIA_SERVICE_TYPE}).`,
    steps: MASTER_STEPS,
    createdByUserId: input?.createdByUserId ?? null,
  });
}

export async function ensureLtlSubshipmentTemplate(input?: {
  createdByUserId?: number | null;
}) {
  return await ensureTemplateByName({
    templateName: LTL_SUBSHIPMENT_TEMPLATE_NAME,
    description: "Subshipment workflow for customer-level LTL execution and handover.",
    steps: SUBSHIPMENT_STEPS,
    createdByUserId: input?.createdByUserId ?? null,
  });
}
