import "server-only";

import { getDb, inTransaction } from "@/lib/db";
import { queryOne } from "@/lib/sql";
import { createExceptionType, addExceptionPlaybookTask } from "@/lib/data/exceptions";
import {
  addTemplateStep,
  createTemplateRule,
  createWorkflowTemplate,
} from "@/lib/data/workflows";

export function seedInitialData(adminUserId: number) {
  const db = getDb();
  inTransaction(db, () => {
    const tmplCount =
      queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM workflow_templates", [], db)
        ?.count ?? 0;

    if (tmplCount === 0) {
      // Sea FCL
      const seaFcl = createWorkflowTemplate({
        name: "Sea FCL Standard",
        description: "Standard milestones for Sea FCL shipments.",
        createdByUserId: adminUserId,
      });
      addTemplateStep({
        templateId: seaFcl,
        name: "Booking confirmed",
        ownerRole: "SALES",
        customerVisible: true,
        slaHours: 24,
      });
      addTemplateStep({
        templateId: seaFcl,
        name: "Export customs clearance",
        ownerRole: "CLEARANCE",
        customerVisible: true,
        slaHours: 48,
      });
      addTemplateStep({
        templateId: seaFcl,
        name: "Vessel departed",
        ownerRole: "OPERATIONS",
        customerVisible: true,
        slaHours: null,
      });
      addTemplateStep({
        templateId: seaFcl,
        name: "Arrival notice",
        ownerRole: "OPERATIONS",
        customerVisible: true,
        slaHours: null,
      });
      addTemplateStep({
        templateId: seaFcl,
        name: "Import customs clearance",
        ownerRole: "CLEARANCE",
        customerVisible: true,
        slaHours: 48,
      });
      addTemplateStep({
        templateId: seaFcl,
        name: "Delivery completed",
        ownerRole: "OPERATIONS",
        customerVisible: true,
        slaHours: 24,
      });

      // Land
      const land = createWorkflowTemplate({
        name: "Land Standard",
        description: "Standard milestones for Land shipments.",
        createdByUserId: adminUserId,
      });
      addTemplateStep({
        templateId: land,
        name: "Pickup scheduled",
        ownerRole: "SALES",
        customerVisible: true,
        slaHours: 24,
      });
      addTemplateStep({
        templateId: land,
        name: "Pickup completed",
        ownerRole: "OPERATIONS",
        customerVisible: true,
        slaHours: 24,
      });
      addTemplateStep({
        templateId: land,
        name: "Customs clearance (if applicable)",
        ownerRole: "CLEARANCE",
        customerVisible: true,
        slaHours: 48,
      });
      addTemplateStep({
        templateId: land,
        name: "Delivery completed",
        ownerRole: "OPERATIONS",
        customerVisible: true,
        slaHours: 24,
      });

      // Rules
      createTemplateRule({
        templateId: seaFcl,
        transportMode: "SEA",
        shipmentType: "FCL",
        createdByUserId: adminUserId,
      });
      createTemplateRule({
        templateId: seaFcl,
        transportMode: "SEA_LAND",
        shipmentType: "FCL",
        createdByUserId: adminUserId,
      });
      createTemplateRule({
        templateId: land,
        transportMode: "LAND",
        shipmentType: "LAND",
        createdByUserId: adminUserId,
      });
    }

    const excCount =
      queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM exception_types", [], db)
        ?.count ?? 0;

    if (excCount === 0) {
      const missingDoc = createExceptionType({
        name: "Missing document",
        description: "A required document is missing from the shipment file.",
        defaultRisk: "BLOCKED",
        customerMessageTemplate:
          "We need the required document to proceed. Please upload it using the tracking link.",
        createdByUserId: adminUserId,
      });
      addExceptionPlaybookTask({
        exceptionTypeId: missingDoc,
        title: "Request missing document from customer",
        ownerRole: "OPERATIONS",
        dueHours: 4,
      });
      addExceptionPlaybookTask({
        exceptionTypeId: missingDoc,
        title: "Follow up with customer",
        ownerRole: "SALES",
        dueHours: 24,
      });

      const carrierDelay = createExceptionType({
        name: "Carrier delay",
        description: "Carrier reports a schedule delay.",
        defaultRisk: "AT_RISK",
        customerMessageTemplate:
          "There is a delay from the carrier. We will update you with the new ETA as soon as possible.",
        createdByUserId: adminUserId,
      });
      addExceptionPlaybookTask({
        exceptionTypeId: carrierDelay,
        title: "Confirm updated ETA with carrier",
        ownerRole: "OPERATIONS",
        dueHours: 12,
      });
      addExceptionPlaybookTask({
        exceptionTypeId: carrierDelay,
        title: "Inform customer about delay",
        ownerRole: "SALES",
        dueHours: 12,
      });
    }
  });
}

