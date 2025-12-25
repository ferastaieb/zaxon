import Link from "next/link";
import { redirect } from "next/navigation";

import { canWrite, requireUser } from "@/lib/auth";
import { listActivities } from "@/lib/data/activities";
import {
  listDocumentRequests,
  listDocuments,
} from "@/lib/data/documents";
import {
  listExceptionTypes,
  listShipmentExceptions,
} from "@/lib/data/exceptions";
import {
  getShipment,
  getTrackingTokenForShipment,
  listShipmentJobIds,
  listShipmentCustomers,
  listShipmentSteps,
  parseFieldValues,
  parseRequiredDocumentTypes,
  parseRequiredFields,
} from "@/lib/data/shipments";
import {
  listGoodsForUser,
  listInventoryBalances,
  listInventoryTransactionsForShipmentCustomers,
  listShipmentGoods,
} from "@/lib/data/goods";
import { listParties } from "@/lib/data/parties";
import { listTasks } from "@/lib/data/tasks";
import { listActiveUsers } from "@/lib/data/users";
import { getWorkflowTemplate } from "@/lib/data/workflows";
import { requireShipmentAccess } from "@/lib/permissions";
import { refreshShipmentDerivedState } from "@/lib/services/shipmentDerived";
import { parseWorkflowGlobalValues, parseWorkflowGlobalVariables } from "@/lib/workflowGlobals";
import ShipmentView from "./ShipmentView";

export default async function ShipmentDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ shipmentId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const { shipmentId } = await params;
  const sp = (await searchParams) ?? {};
  const error = typeof sp.error === "string" ? sp.error : null;
  const errorStepId =
    typeof sp.stepId === "string" ? Number(sp.stepId) : null;
  const id = Number(shipmentId);
  if (!id) redirect("/shipments");

  requireShipmentAccess(user, id);
  const existing = getShipment(id);
  if (!existing) redirect("/shipments");

  refreshShipmentDerivedState({ shipmentId: id });

  const shipment = getShipment(id);
  if (!shipment) redirect("/shipments");
  const shipmentCustomers = listShipmentCustomers(id);
  const canAccessAllShipments = user.role === "ADMIN" || user.role === "FINANCE";
  const shipmentGoods = listShipmentGoods({ shipmentId: id, ownerUserId: user.id });
  const goods = listGoodsForUser(user.id);
  const inventoryBalances = listInventoryBalances(user.id);
  const inventoryTransactions = listInventoryTransactionsForShipmentCustomers({
    ownerUserId: user.id,
    shipmentId: id,
    canAccessAllShipments,
    limit: 200,
  });

  const template = shipment.workflow_template_id
    ? getWorkflowTemplate(shipment.workflow_template_id)
    : null;
  const workflowGlobals = template
    ? parseWorkflowGlobalVariables(template.global_variables_json)
    : [];
  const workflowGlobalValues = parseWorkflowGlobalValues(
    shipment.workflow_global_values_json,
  );

  const steps = listShipmentSteps(id);
  const internalSteps = steps.filter((s) => !s.is_external);
  const trackingSteps = steps.filter((s) => s.is_external);
  const jobIds = listShipmentJobIds(id);
  const tasks = listTasks(id);
  const docs = listDocuments(id);
  const docRequests = listDocumentRequests(id);
  const exceptions = listShipmentExceptions(id);
  const exceptionTypes = listExceptionTypes({ includeArchived: false });
  const activities = listActivities(id);
  const trackingToken = getTrackingTokenForShipment(id);

  const activeUsers = listActiveUsers();
  const parties = listParties();
  const partiesById = new Map(parties.map((p) => [p.id, p]));
  const customers = parties.filter((p) => p.type === "CUSTOMER");
  const suppliers = parties.filter((p) => p.type === "SUPPLIER");
  const brokers = parties.filter((p) => p.type === "CUSTOMS_BROKER");

  const receivedDocTypes = new Set(
    docs.filter((d) => d.is_received).map((d) => String(d.document_type)),
  );
  const openDocRequestTypes = new Set(
    docRequests
      .filter((r) => r.status === "OPEN")
      .map((r) => String(r.document_type)),
  );
  const latestReceivedDocByType = new Map<string, (typeof docs)[number]>();
  for (const doc of docs) {
    if (!doc.is_received) continue;
    const type = String(doc.document_type);
    if (!latestReceivedDocByType.has(type)) {
      latestReceivedDocByType.set(type, doc);
    }
  }

  const myTasks = tasks
    .filter((t) => t.status !== "DONE")
    .filter(
      (t) => t.assignee_user_id === user.id || t.assignee_role === user.role,
    );

  const mySteps = steps
    .filter((s) => s.status !== "DONE")
    .filter((s) => s.owner_role === user.role)
    .map((s) => {
      const requiredFields = parseRequiredFields(s);
      const requiredDocs = parseRequiredDocumentTypes(s);
      const fieldValues = parseFieldValues(s);
      const missingFields = requiredFields.filter(
        (f) => !String(fieldValues[f] ?? "").trim(),
      );
      const missingDocs = requiredDocs.filter((dt) => !receivedDocTypes.has(dt));
      const relatedPartyName = s.related_party_id
        ? partiesById.get(s.related_party_id)?.name ?? null
        : null;
      return {
        id: s.id,
        sortOrder: s.sort_order,
        name: s.name,
        status: s.status,
        dueAt: s.due_at,
        relatedPartyName,
        missingFieldsCount: missingFields.length,
        missingDocsCount: missingDocs.length,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const blockingExceptions = exceptions.filter(
    (e) => e.status === "OPEN" && e.default_risk === "BLOCKED",
  );
  const workflowBlocked = blockingExceptions.length > 0;
  const primaryBlockingException = blockingExceptions[0] ?? null;

  // Convert Sets and Maps to serializable formats for Client Component
  const receivedDocTypesArray = Array.from(receivedDocTypes);
  const openDocRequestTypesArray = Array.from(openDocRequestTypes);
  const latestReceivedDocByTypeObj = Object.fromEntries(latestReceivedDocByType);

  return (
    <ShipmentView
      user={user}
      shipment={shipment}
      shipmentCustomers={shipmentCustomers}
      shipmentGoods={shipmentGoods}
      goods={goods}
      inventoryBalances={inventoryBalances}
      inventoryTransactions={inventoryTransactions}
      steps={steps}
      internalSteps={internalSteps}
      trackingSteps={trackingSteps}
      jobIds={jobIds}
      tasks={tasks}
      docs={docs}
      docRequests={docRequests}
      exceptions={exceptions}
      exceptionTypes={exceptionTypes}
      activities={activities}
      trackingToken={trackingToken}
      activeUsers={activeUsers}
      customers={customers}
      suppliers={suppliers}
      brokers={brokers}
      mySteps={mySteps}
      myTasks={myTasks}
      blockingExceptions={blockingExceptions}
      workflowBlocked={workflowBlocked}
      primaryBlockingException={primaryBlockingException}
      receivedDocTypes={receivedDocTypesArray}
      openDocRequestTypes={openDocRequestTypesArray}
      latestReceivedDocByType={latestReceivedDocByTypeObj}
      workflowGlobals={workflowGlobals}
      workflowGlobalValues={workflowGlobalValues}
      error={error}
      errorStepId={errorStepId}
    />
  );
}
