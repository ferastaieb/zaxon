import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
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
  listConnectableShipments,
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
  listShipmentGoodsForAllocations,
  listShipmentGoods,
} from "@/lib/data/goods";
import { listParties } from "@/lib/data/parties";
import { listShipmentLinksForShipment } from "@/lib/data/shipmentLinks";
import { listTasks } from "@/lib/data/tasks";
import { listActiveUsers } from "@/lib/data/users";
import { getWorkflowTemplate } from "@/lib/data/workflows";
import { FTL_EXPORT_TEMPLATE_NAME } from "@/lib/ftlExport/constants";
import { requireShipmentAccess } from "@/lib/permissions";
import { refreshShipmentDerivedState } from "@/lib/services/shipmentDerived";
import { parseWorkflowGlobalValues, parseWorkflowGlobalVariables } from "@/lib/workflowGlobals";
import {
  requestFclDocumentAction,
  updateFclStepAction,
} from "../fcl-import/[shipmentId]/actions";
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

  await requireShipmentAccess(user, id);
  await refreshShipmentDerivedState({ shipmentId: id });

  const shipment = await getShipment(id);
  if (!shipment) redirect("/shipments");
  const template = shipment.workflow_template_id
    ? await getWorkflowTemplate(shipment.workflow_template_id)
    : null;
  if (
    template?.name &&
    template.name.toLowerCase() === FTL_EXPORT_TEMPLATE_NAME.toLowerCase()
  ) {
    redirect(`/shipments/ftl-export/${id}`);
  }
  const shipmentCustomers = await listShipmentCustomers(id);
  const shipmentCustomerIds = shipmentCustomers.map((c) => c.id);
  const canAccessAllShipments = user.role === "ADMIN" || user.role === "FINANCE";
  const shipmentGoods = await listShipmentGoods({
    shipmentId: id,
    ownerUserId: user.id,
  });
  const allocationGoods = await listShipmentGoodsForAllocations({
    shipmentId: id,
    ownerUserId: user.id,
  });
  const goods = await listGoodsForUser(user.id);
  const inventoryBalances = await listInventoryBalances(user.id);
  const inventoryTransactions = await listInventoryTransactionsForShipmentCustomers({
    ownerUserId: user.id,
    shipmentId: id,
    canAccessAllShipments,
    limit: 200,
  });
  const shipmentLinks = await listShipmentLinksForShipment({
    shipmentId: id,
    userId: user.id,
    role: user.role,
  });
  const connectableCandidates = await listConnectableShipments({
    customerPartyIds: shipmentCustomerIds,
    userId: user.id,
    role: user.role,
    excludeShipmentId: id,
  });
  const connectedIds = new Set(
    shipmentLinks.map((link) => link.connected_shipment_id),
  );
  const connectableShipments = connectableCandidates.filter(
    (s) => !connectedIds.has(s.id),
  );
  const connectedShipments = await Promise.all(
    shipmentLinks.map(async (link) => {
      const [connectedGoods, connectedDocs, connectedTrackingToken] =
        await Promise.all([
          listShipmentGoods({
            shipmentId: link.connected_shipment_id,
            ownerUserId: user.id,
          }),
          listDocuments(link.connected_shipment_id),
          getTrackingTokenForShipment(link.connected_shipment_id),
        ]);
      return {
        ...link,
        goods: connectedGoods,
        docs: connectedDocs,
        trackingToken: connectedTrackingToken,
      };
    }),
  );

  const workflowGlobals = template
    ? parseWorkflowGlobalVariables(template.global_variables_json)
    : [];
  const workflowGlobalValues = parseWorkflowGlobalValues(
    shipment.workflow_global_values_json,
  );

  const steps = await listShipmentSteps(id);
  const internalSteps = steps.filter((s) => !s.is_external);
  const trackingSteps = steps.filter((s) => s.is_external);
  const jobIds = await listShipmentJobIds(id);
  const tasks = await listTasks(id);
  const docs = await listDocuments(id);
  const docRequests = await listDocumentRequests(id);
  const exceptions = await listShipmentExceptions(id);
  const exceptionTypes = await listExceptionTypes({ includeArchived: false });
  const activities = await listActivities(id);
  const trackingToken = await getTrackingTokenForShipment(id);
  const fclUpdateAction = updateFclStepAction.bind(null, id);
  const fclRequestAction = requestFclDocumentAction.bind(null, id);

  const activeUsers = await listActiveUsers();
  const parties = await listParties();
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
        isExternal: s.is_external === 1,
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
      allocationGoods={allocationGoods}
      goods={goods}
      inventoryBalances={inventoryBalances}
      inventoryTransactions={inventoryTransactions}
      connectableShipments={connectableShipments}
      connectedShipments={connectedShipments}
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
      fclUpdateAction={fclUpdateAction}
      fclRequestAction={fclRequestAction}
    />
  );
}
