import "server-only";

import { scanAll, tableName } from "@/lib/db";
import { createExceptionType, addExceptionPlaybookTask } from "@/lib/data/exceptions";
import {
  addTemplateStep,
  createTemplateRule,
  createWorkflowTemplate,
} from "@/lib/data/workflows";

const WORKFLOW_TEMPLATES_TABLE = tableName("workflow_templates");
const EXCEPTION_TYPES_TABLE = tableName("exception_types");

export async function seedInitialData(adminUserId: number) {
  const [templates, exceptionTypes] = await Promise.all([
    scanAll<{ id: number }>(WORKFLOW_TEMPLATES_TABLE),
    scanAll<{ id: number }>(EXCEPTION_TYPES_TABLE),
  ]);

  if (templates.length === 0) {
    const seaFcl = await createWorkflowTemplate({
      name: "Sea FCL Standard",
      description: "Standard milestones for Sea FCL shipments.",
      createdByUserId: adminUserId,
    });
    await addTemplateStep({
      templateId: seaFcl,
      name: "Booking confirmed",
      ownerRole: "SALES",
      customerVisible: true,
      slaHours: 24,
    });
    await addTemplateStep({
      templateId: seaFcl,
      name: "Export customs clearance",
      ownerRole: "CLEARANCE",
      customerVisible: true,
      slaHours: 48,
    });
    await addTemplateStep({
      templateId: seaFcl,
      name: "Vessel departed",
      ownerRole: "OPERATIONS",
      customerVisible: true,
      slaHours: null,
    });
    await addTemplateStep({
      templateId: seaFcl,
      name: "Arrival notice",
      ownerRole: "OPERATIONS",
      customerVisible: true,
      slaHours: null,
    });
    await addTemplateStep({
      templateId: seaFcl,
      name: "Import customs clearance",
      ownerRole: "CLEARANCE",
      customerVisible: true,
      slaHours: 48,
    });
    await addTemplateStep({
      templateId: seaFcl,
      name: "Delivery completed",
      ownerRole: "OPERATIONS",
      customerVisible: true,
      slaHours: 24,
    });

    const land = await createWorkflowTemplate({
      name: "Land Standard",
      description: "Standard milestones for Land shipments.",
      createdByUserId: adminUserId,
    });
    await addTemplateStep({
      templateId: land,
      name: "Pickup scheduled",
      ownerRole: "SALES",
      customerVisible: true,
      slaHours: 24,
    });
    await addTemplateStep({
      templateId: land,
      name: "Pickup completed",
      ownerRole: "OPERATIONS",
      customerVisible: true,
      slaHours: 24,
    });
    await addTemplateStep({
      templateId: land,
      name: "Customs clearance (if applicable)",
      ownerRole: "CLEARANCE",
      customerVisible: true,
      slaHours: 48,
    });
    await addTemplateStep({
      templateId: land,
      name: "Delivery completed",
      ownerRole: "OPERATIONS",
      customerVisible: true,
      slaHours: 24,
    });

    await createTemplateRule({
      templateId: seaFcl,
      transportMode: "SEA",
      shipmentType: "FCL",
      createdByUserId: adminUserId,
    });
    await createTemplateRule({
      templateId: seaFcl,
      transportMode: "SEA_LAND",
      shipmentType: "FCL",
      createdByUserId: adminUserId,
    });
    await createTemplateRule({
      templateId: land,
      transportMode: "LAND",
      shipmentType: "LAND",
      createdByUserId: adminUserId,
    });
  }

  if (exceptionTypes.length === 0) {
    const missingDoc = await createExceptionType({
      name: "Missing document",
      description: "A required document is missing from the shipment file.",
      defaultRisk: "BLOCKED",
      customerMessageTemplate:
        "We need the required document to proceed. Please upload it using the tracking link.",
      createdByUserId: adminUserId,
    });
    await addExceptionPlaybookTask({
      exceptionTypeId: missingDoc,
      title: "Request missing document from customer",
      ownerRole: "OPERATIONS",
      dueHours: 4,
    });
    await addExceptionPlaybookTask({
      exceptionTypeId: missingDoc,
      title: "Follow up with customer",
      ownerRole: "SALES",
      dueHours: 24,
    });

    const carrierDelay = await createExceptionType({
      name: "Carrier delay",
      description: "Carrier reports a schedule delay.",
      defaultRisk: "AT_RISK",
      customerMessageTemplate:
        "There is a delay from the carrier. We will update you with the new ETA as soon as possible.",
      createdByUserId: adminUserId,
    });
    await addExceptionPlaybookTask({
      exceptionTypeId: carrierDelay,
      title: "Confirm updated ETA with carrier",
      ownerRole: "OPERATIONS",
      dueHours: 12,
    });
    await addExceptionPlaybookTask({
      exceptionTypeId: carrierDelay,
      title: "Inform customer about delay",
      ownerRole: "SALES",
      dueHours: 12,
    });
  }
}
