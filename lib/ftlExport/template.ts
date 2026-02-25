import "server-only";

import type { Role } from "@/lib/domain";
import type { StepFieldDefinition, StepFieldSchema } from "@/lib/stepFields";
import {
  addTemplateStep,
  createWorkflowTemplate,
  listTemplateSteps,
  listWorkflowTemplates,
  updateTemplateStep,
} from "@/lib/data/workflows";
import { FTL_EXPORT_STEP_NAMES, FTL_EXPORT_TEMPLATE_NAME } from "./constants";

function parseJsonValue<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

const truckGroup = (fields: StepFieldDefinition[]): StepFieldDefinition => ({
  id: "trucks",
  label: "Trucks",
  type: "group",
  repeatable: true,
  fields,
});

const importShipmentGroup = (): StepFieldDefinition => ({
  id: "import_shipments",
  label: "Import shipments",
  type: "group",
  repeatable: true,
  fields: [
    {
      id: "source_shipment_id",
      label: "Source import shipment id",
      type: "text",
    },
    {
      id: "import_shipment_reference",
      label: "Import shipment number",
      type: "text",
    },
    {
      id: "client_number",
      label: "Client number",
      type: "text",
    },
    {
      id: "import_boe_number",
      label: "Import BOE number",
      type: "text",
    },
    {
      id: "processed_available",
      label: "Import processed / available",
      type: "boolean",
    },
    {
      id: "non_physical_stock",
      label: "Non-physical stock",
      type: "boolean",
    },
    {
      id: "imported_weight",
      label: "Imported weight",
      type: "number",
    },
    {
      id: "imported_quantity",
      label: "Imported quantity",
      type: "number",
    },
    {
      id: "already_allocated_weight",
      label: "Already allocated weight across previous exports",
      type: "number",
    },
    {
      id: "already_allocated_quantity",
      label: "Already allocated quantity across previous exports",
      type: "number",
    },
    {
      id: "package_type",
      label: "Cargo package type",
      type: "text",
    },
    {
      id: "cargo_description",
      label: "Cargo description",
      type: "text",
    },
    {
      id: "allocated_weight",
      label: "Allocated export weight",
      type: "number",
    },
    {
      id: "allocated_quantity",
      label: "Allocated export quantity",
      type: "number",
    },
  ],
});

const exportPlanOverviewSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "order_received",
      label: "Order received",
      type: "boolean",
      required: true,
    },
    {
      id: "order_received_date",
      label: "Order received date",
      type: "date",
      required: true,
    },
    {
      id: "planned_loading_date",
      label: "Planned loading date",
      type: "date",
    },
    {
      id: "remarks",
      label: "Remarks",
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
      id: "planned_truck_types",
      label: "Planned truck types",
      type: "group",
      repeatable: true,
      fields: [
        {
          id: "truck_type",
          label: "Truck type",
          type: "text",
        },
        {
          id: "truck_count",
          label: "Truck count",
          type: "number",
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
    truckGroup([
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
    ]),
  ],
};

const loadingDetailsSchema: StepFieldSchema = {
  version: 1,
  fields: [
    truckGroup([
      {
        id: "truck_reference",
        label: "Truck reference",
        type: "text",
      },
      {
        id: "truck_loaded",
        label: "Truck loaded",
        type: "boolean",
      },
      {
        id: "mixed_supplier_loaded",
        label: "Mixed: supplier stop loaded",
        type: "boolean",
      },
      {
        id: "mixed_zaxon_loaded",
        label: "Mixed: Zaxon stop loaded",
        type: "boolean",
      },
      {
        id: "loading_origin",
        label: "Loading origin",
        type: "text",
      },
      {
        id: "supplier_name",
        label: "Supplier name",
        type: "text",
      },
      {
        id: "external_loading_date",
        label: "Loading date (external supplier)",
        type: "date",
      },
      {
        id: "external_loading_location",
        label: "Loading location (external supplier)",
        type: "text",
      },
      {
        id: "zaxon_actual_loading_date",
        label: "Actual loading date (Zaxon warehouse)",
        type: "date",
      },
      {
        id: "zaxon_warehouse_remarks",
        label: "Warehouse remarks (Zaxon)",
        type: "text",
      },
      {
        id: "mixed_supplier_loading_date",
        label: "Mixed: supplier loading date",
        type: "date",
      },
      {
        id: "mixed_supplier_remarks",
        label: "Mixed: supplier remarks",
        type: "text",
      },
      {
        id: "mixed_zaxon_loading_date",
        label: "Mixed: Zaxon loading date",
        type: "date",
      },
      {
        id: "mixed_zaxon_remarks",
        label: "Mixed: Zaxon remarks",
        type: "text",
      },
      {
        id: "mixed_supplier_cargo_weight",
        label: "Mixed: supplier cargo weight",
        type: "number",
      },
      {
        id: "mixed_supplier_cargo_unit_type",
        label: "Mixed: supplier cargo unit type",
        type: "text",
      },
      {
        id: "mixed_supplier_cargo_unit_type_other",
        label: "Mixed: supplier cargo unit type - other",
        type: "text",
      },
      {
        id: "mixed_supplier_cargo_quantity",
        label: "Mixed: supplier cargo quantity",
        type: "number",
      },
      {
        id: "mixed_zaxon_cargo_weight",
        label: "Mixed: Zaxon cargo weight",
        type: "number",
      },
      {
        id: "mixed_zaxon_cargo_unit_type",
        label: "Mixed: Zaxon cargo unit type",
        type: "text",
      },
      {
        id: "mixed_zaxon_cargo_unit_type_other",
        label: "Mixed: Zaxon cargo unit type - other",
        type: "text",
      },
      {
        id: "mixed_zaxon_cargo_quantity",
        label: "Mixed: Zaxon cargo quantity",
        type: "number",
      },
      {
        id: "cargo_weight",
        label: "Cargo weight",
        type: "number",
      },
      {
        id: "cargo_unit_type",
        label: "Cargo unit type",
        type: "text",
      },
      {
        id: "cargo_unit_type_other",
        label: "Cargo unit type - other",
        type: "text",
      },
      {
        id: "cargo_quantity",
        label: "Cargo quantity",
        type: "number",
      },
      {
        id: "loading_photo",
        label: "Loading photo",
        type: "file",
      },
      {
        id: "loading_sheet_upload",
        label: "Loading sheet upload",
        type: "file",
      },
      {
        id: "remarks",
        label: "Remarks",
        type: "text",
      },
    ]),
  ],
};

const importShipmentSelectionSchema: StepFieldSchema = {
  version: 1,
  fields: [importShipmentGroup()],
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

const customsAgentsAllocationSchema: StepFieldSchema = {
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
      id: "batha_clearance_mode",
      label: "Batha border clearance mode",
      type: "text",
    },
    {
      id: "batha_consignee_party_id",
      label: "Batha consignee party id",
      type: "text",
    },
    {
      id: "batha_consignee_name",
      label: "Batha consignee name",
      type: "text",
    },
    {
      id: "show_batha_consignee_to_client",
      label: "Show Batha consignee to client",
      type: "text",
    },
    {
      id: "batha_client_final_choice",
      label: "Batha client final choice",
      type: "text",
    },
    {
      id: "omari_agent_name",
      label: "Omari border clearing agent",
      type: "text",
      required: true,
    },
    {
      id: "mushtarakah_agent_name",
      label: "Mushtarakah clearing agent",
      type: "text",
    },
    {
      id: "mushtarakah_consignee_party_id",
      label: "Mushtarakah consignee party id",
      type: "text",
    },
    {
      id: "mushtarakah_consignee_name",
      label: "Mushtarakah consignee name",
      type: "text",
    },
    {
      id: "masnaa_clearance_mode",
      label: "Masnaa border clearance mode",
      type: "text",
    },
    {
      id: "masnaa_agent_name",
      label: "Masnaa agent name",
      type: "text",
    },
    {
      id: "masnaa_consignee_party_id",
      label: "Masnaa consignee party id",
      type: "text",
    },
    {
      id: "masnaa_consignee_name",
      label: "Masnaa consignee name",
      type: "text",
    },
    {
      id: "show_masnaa_consignee_to_client",
      label: "Show Masnaa consignee to client",
      type: "text",
    },
    {
      id: "masnaa_client_final_choice",
      label: "Masnaa client final choice",
      type: "text",
    },
    {
      id: "naseeb_clearance_mode",
      label: "Naseeb border clearance mode",
      type: "text",
      required: true,
    },
    {
      id: "naseeb_agent_name",
      label: "Naseeb agent name (if Zaxon)",
      type: "text",
    },
    {
      id: "syria_consignee_party_id",
      label: "Syria consignee party id (if Zaxon)",
      type: "text",
    },
    {
      id: "syria_consignee_name",
      label: "Syria consignee name (if Zaxon)",
      type: "text",
    },
    {
      id: "show_syria_consignee_to_client",
      label: "Show consignee name to client",
      type: "text",
    },
    {
      id: "naseeb_client_final_choice",
      label: "Client final choice (if Client clearance)",
      type: "text",
    },
  ],
};

const trackingUaeSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "jebel_ali_declaration_date",
      label: "Jebel Ali declaration date",
      type: "date",
    },
    {
      id: "jebel_ali_declaration_upload",
      label: "Jebel Ali declaration upload",
      type: "file",
    },
    {
      id: "jebel_ali_trucks_sealed",
      label: "Trucks sealed",
      type: "boolean",
    },
    {
      id: "jebel_ali_sealed_date",
      label: "Sealed date",
      type: "date",
    },
    {
      id: "jebel_ali_exit",
      label: "Exit Jebel Ali",
      type: "boolean",
    },
    {
      id: "jebel_ali_exit_date",
      label: "Exit Jebel Ali date",
      type: "date",
    },
    {
      id: "sila_declaration_date",
      label: "Sila declaration date",
      type: "date",
    },
    {
      id: "sila_declaration_upload",
      label: "Sila declaration upload",
      type: "file",
    },
    {
      id: "sila_arrived",
      label: "Arrived at Sila",
      type: "boolean",
    },
    {
      id: "sila_arrived_date",
      label: "Arrived at Sila date",
      type: "date",
    },
    {
      id: "sila_exit",
      label: "Exit Sila",
      type: "boolean",
    },
    {
      id: "sila_exit_date",
      label: "Exit Sila date",
      type: "date",
    },
  ],
};

const trackingKsaSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "batha_declaration_date",
      label: "Batha declaration date",
      type: "date",
    },
    {
      id: "batha_declaration_upload",
      label: "Batha declaration upload",
      type: "file",
    },
    {
      id: "batha_arrived",
      label: "Arrived at Batha",
      type: "boolean",
    },
    {
      id: "batha_arrived_date",
      label: "Arrived at Batha date",
      type: "date",
    },
    {
      id: "batha_exit",
      label: "Exit Batha",
      type: "boolean",
    },
    {
      id: "batha_exit_date",
      label: "Exit Batha date",
      type: "date",
    },
    {
      id: "batha_entered",
      label: "Entered Batha",
      type: "boolean",
    },
    {
      id: "batha_entered_date",
      label: "Entered Batha date",
      type: "date",
    },
    {
      id: "batha_delivered",
      label: "Delivered at Batha",
      type: "boolean",
    },
    {
      id: "batha_delivered_date",
      label: "Delivered at Batha date",
      type: "date",
    },
    {
      id: "hadietha_exit",
      label: "Exit Hadietha",
      type: "boolean",
    },
    {
      id: "hadietha_exit_date",
      label: "Exit Hadietha date",
      type: "date",
    },
  ],
};

const trackingJordanSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "omari_declaration_date",
      label: "Omari declaration date",
      type: "date",
    },
    {
      id: "omari_declaration_upload",
      label: "Omari declaration upload",
      type: "file",
    },
    {
      id: "omari_arrived",
      label: "Arrived at Omari",
      type: "boolean",
    },
    {
      id: "omari_arrived_date",
      label: "Arrived at Omari date",
      type: "date",
    },
    {
      id: "omari_exit",
      label: "Exit Omari",
      type: "boolean",
    },
    {
      id: "omari_exit_date",
      label: "Exit Omari date",
      type: "date",
    },
    {
      id: "jaber_exit",
      label: "Exit Jaber",
      type: "boolean",
    },
    {
      id: "jaber_exit_date",
      label: "Exit Jaber date",
      type: "date",
    },
  ],
};

const trackingSyriaSchema: StepFieldSchema = {
  version: 1,
  fields: [
    {
      id: "syria_clearance_mode",
      label: "Syria clearance mode",
      type: "text",
    },
    {
      id: "syria_declaration_date",
      label: "Syria declaration date",
      type: "date",
    },
    {
      id: "syria_declaration_upload",
      label: "Syria declaration upload",
      type: "file",
    },
    {
      id: "syria_arrived",
      label: "Arrived at Syria border",
      type: "boolean",
    },
    {
      id: "syria_arrived_date",
      label: "Arrived at Syria border date",
      type: "date",
    },
    {
      id: "syria_exit",
      label: "Exit Syria border",
      type: "boolean",
    },
    {
      id: "syria_exit_date",
      label: "Exit Syria border date",
      type: "date",
    },
    {
      id: "syria_delivered",
      label: "Delivered",
      type: "boolean",
    },
    {
      id: "syria_delivered_date",
      label: "Delivered date",
      type: "date",
    },
    {
      id: "syria_offload_location",
      label: "Offload location",
      type: "text",
    },
    {
      id: "mushtarakah_entered",
      label: "Enter Mushtarakah",
      type: "boolean",
    },
    {
      id: "mushtarakah_entered_date",
      label: "Enter Mushtarakah date",
      type: "date",
    },
    {
      id: "mushtarakah_offloaded_warehouse",
      label: "Offloaded at Mushtarakah warehouse",
      type: "boolean",
    },
    {
      id: "mushtarakah_offloaded_warehouse_date",
      label: "Offloaded at Mushtarakah warehouse date",
      type: "date",
    },
    {
      id: "mushtarakah_loaded_syrian_trucks",
      label: "Loaded into Syrian trucks",
      type: "boolean",
    },
    {
      id: "mushtarakah_loaded_syrian_trucks_date",
      label: "Loaded into Syrian trucks date",
      type: "date",
    },
    {
      id: "mushtarakah_exit",
      label: "Exit Mushtarakah",
      type: "boolean",
    },
    {
      id: "mushtarakah_exit_date",
      label: "Exit Mushtarakah date",
      type: "date",
    },
    {
      id: "naseeb_arrived",
      label: "Arrived at Naseeb",
      type: "boolean",
    },
    {
      id: "naseeb_arrived_date",
      label: "Arrived at Naseeb date",
      type: "date",
    },
    {
      id: "naseeb_entered",
      label: "Entered Naseeb",
      type: "boolean",
    },
    {
      id: "naseeb_entered_date",
      label: "Entered Naseeb date",
      type: "date",
    },
    {
      id: "masnaa_arrived",
      label: "Arrived at Masnaa",
      type: "boolean",
    },
    {
      id: "masnaa_arrived_date",
      label: "Arrived at Masnaa date",
      type: "date",
    },
    {
      id: "masnaa_entered",
      label: "Entered Masnaa",
      type: "boolean",
    },
    {
      id: "masnaa_entered_date",
      label: "Entered Masnaa date",
      type: "date",
    },
    {
      id: "masnaa_delivered",
      label: "Delivered at Masnaa",
      type: "boolean",
    },
    {
      id: "masnaa_delivered_date",
      label: "Delivered at Masnaa date",
      type: "date",
    },
  ],
};

type TemplateStep = {
  name: string;
  ownerRole: Role;
  schema: StepFieldSchema;
  customerVisible?: boolean;
  isExternal?: boolean;
};

const TEMPLATE_STEPS: TemplateStep[] = [
  {
    name: FTL_EXPORT_STEP_NAMES.exportPlanOverview,
    ownerRole: "SALES",
    schema: exportPlanOverviewSchema,
  },
  {
    name: FTL_EXPORT_STEP_NAMES.trucksDetails,
    ownerRole: "OPERATIONS",
    schema: trucksDetailsSchema,
  },
  {
    name: FTL_EXPORT_STEP_NAMES.loadingDetails,
    ownerRole: "OPERATIONS",
    schema: loadingDetailsSchema,
  },
  {
    name: FTL_EXPORT_STEP_NAMES.importShipmentSelection,
    ownerRole: "OPERATIONS",
    schema: importShipmentSelectionSchema,
  },
  {
    name: FTL_EXPORT_STEP_NAMES.exportInvoice,
    ownerRole: "CLEARANCE",
    schema: exportInvoiceSchema,
  },
  {
    name: FTL_EXPORT_STEP_NAMES.stockView,
    ownerRole: "CLEARANCE",
    schema: stockViewSchema,
  },
  {
    name: FTL_EXPORT_STEP_NAMES.customsAgentsAllocation,
    ownerRole: "CLEARANCE",
    schema: customsAgentsAllocationSchema,
  },
  {
    name: FTL_EXPORT_STEP_NAMES.trackingUae,
    ownerRole: "OPERATIONS",
    schema: trackingUaeSchema,
    customerVisible: true,
    isExternal: true,
  },
  {
    name: FTL_EXPORT_STEP_NAMES.trackingKsa,
    ownerRole: "OPERATIONS",
    schema: trackingKsaSchema,
    customerVisible: true,
    isExternal: true,
  },
  {
    name: FTL_EXPORT_STEP_NAMES.trackingJordan,
    ownerRole: "OPERATIONS",
    schema: trackingJordanSchema,
    customerVisible: true,
    isExternal: true,
  },
  {
    name: FTL_EXPORT_STEP_NAMES.trackingSyria,
    ownerRole: "OPERATIONS",
    schema: trackingSyriaSchema,
    customerVisible: true,
    isExternal: true,
  },
];

export async function ensureFtlExportTemplate(input?: { createdByUserId?: number | null }) {
  const templates = await listWorkflowTemplates({
    includeArchived: true,
    isSubworkflow: false,
  });

  const existing = templates.find(
    (template) => template.name.toLowerCase() === FTL_EXPORT_TEMPLATE_NAME.toLowerCase(),
  );
  if (existing) {
    const existingSteps = await listTemplateSteps(existing.id);
    const existingByName = new Map(existingSteps.map((step) => [step.name, step]));
    for (const step of TEMPLATE_STEPS) {
      const existingStep = existingByName.get(step.name);
      const nextFieldSchemaJson = JSON.stringify(step.schema);
      if (!existingStep) {
        await addTemplateStep({
          templateId: existing.id,
          name: step.name,
          ownerRole: step.ownerRole,
          fieldSchemaJson: nextFieldSchemaJson,
          customerVisible: step.customerVisible,
          isExternal: step.isExternal,
        });
        continue;
      }

      const nextCustomerVisible = step.customerVisible ?? false;
      const nextIsExternal = step.isExternal ?? false;
      const needsUpdate =
        existingStep.owner_role !== step.ownerRole ||
        existingStep.field_schema_json !== nextFieldSchemaJson ||
        existingStep.customer_visible !== (nextCustomerVisible ? 1 : 0) ||
        existingStep.is_external !== (nextIsExternal ? 1 : 0);

      if (!needsUpdate) continue;

      await updateTemplateStep({
        stepId: existingStep.id,
        name: step.name,
        ownerRole: step.ownerRole,
        requiredFields: parseJsonValue<string[]>(
          existingStep.required_fields_json,
          [],
        ),
        requiredDocumentTypes: parseJsonValue<string[]>(
          existingStep.required_document_types_json,
          [],
        ),
        fieldSchemaJson: nextFieldSchemaJson,
        slaHours: existingStep.sla_hours ?? null,
        customerVisible: nextCustomerVisible,
        isExternal: nextIsExternal,
        checklistGroups: parseJsonValue(existingStep.checklist_groups_json, []),
        dependsOnStepIds: parseJsonValue<number[]>(
          existingStep.depends_on_step_ids_json,
          [],
        ),
        customerCompletionMessageTemplate:
          existingStep.customer_completion_message_template ?? null,
      });
    }
    return existing.id;
  }

  const templateId = await createWorkflowTemplate({
    name: FTL_EXPORT_TEMPLATE_NAME,
    description: "Structured workflow for FTL export warehouse operations.",
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
