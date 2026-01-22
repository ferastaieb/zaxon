import "server-only";

import type { ShipmentRisk } from "@/lib/domain";
import {
  getItem,
  nextId,
  nowIso,
  putItem,
  scanAll,
  tableName,
  updateItem,
  deleteItem,
} from "@/lib/db";

export type ExceptionTypeRow = {
  id: number;
  name: string;
  description: string | null;
  default_risk: ShipmentRisk;
  customer_message_template: string | null;
  is_archived: 0 | 1;
  created_at: string;
  created_by_user_id: number | null;
  updated_at: string;
  updated_by_user_id: number | null;
};

export type ExceptionPlaybookTaskRow = {
  id: number;
  exception_type_id: number;
  sort_order: number;
  title: string;
  owner_role: string;
  due_hours: number | null;
  created_at: string;
  updated_at: string;
};

export type ShipmentExceptionRow = {
  id: number;
  shipment_id: number;
  exception_type_id: number;
  status: "OPEN" | "RESOLVED";
  notes: string | null;
  customer_message: string | null;
  share_with_customer: 0 | 1;
  created_at: string;
  created_by_user_id: number | null;
  resolved_at: string | null;
  resolved_by_user_id: number | null;
  exception_name: string;
  default_risk: ShipmentRisk;
};

const EXCEPTION_TYPES_TABLE = tableName("exception_types");
const EXCEPTION_PLAYBOOK_TABLE = tableName("exception_playbook_tasks");
const SHIPMENT_EXCEPTIONS_TABLE = tableName("shipment_exceptions");

export async function listExceptionTypes(input?: { includeArchived?: boolean }) {
  const rows = await scanAll<ExceptionTypeRow>(EXCEPTION_TYPES_TABLE);
  return rows
    .filter((row) => (input?.includeArchived ? true : row.is_archived === 0))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getExceptionType(id: number) {
  return await getItem<ExceptionTypeRow>(EXCEPTION_TYPES_TABLE, { id });
}

export async function createExceptionType(input: {
  name: string;
  description?: string | null;
  defaultRisk: ShipmentRisk;
  customerMessageTemplate?: string | null;
  createdByUserId?: number | null;
}) {
  const ts = nowIso();
  const id = await nextId("exception_types");
  await putItem(EXCEPTION_TYPES_TABLE, {
    id,
    name: input.name,
    description: input.description ?? null,
    default_risk: input.defaultRisk,
    customer_message_template: input.customerMessageTemplate ?? null,
    is_archived: 0,
    created_at: ts,
    created_by_user_id: input.createdByUserId ?? null,
    updated_at: ts,
    updated_by_user_id: input.createdByUserId ?? null,
  });
  return id;
}

export async function updateExceptionType(input: {
  id: number;
  name: string;
  description?: string | null;
  defaultRisk: ShipmentRisk;
  customerMessageTemplate?: string | null;
  isArchived?: boolean;
  updatedByUserId?: number | null;
}) {
  await updateItem<ExceptionTypeRow>(
    EXCEPTION_TYPES_TABLE,
    { id: input.id },
    "SET #name = :name, description = :description, default_risk = :default_risk, customer_message_template = :customer_message_template, is_archived = :is_archived, updated_at = :updated_at, updated_by_user_id = :updated_by_user_id",
    {
      ":name": input.name,
      ":description": input.description ?? null,
      ":default_risk": input.defaultRisk,
      ":customer_message_template": input.customerMessageTemplate ?? null,
      ":is_archived": input.isArchived ? 1 : 0,
      ":updated_at": nowIso(),
      ":updated_by_user_id": input.updatedByUserId ?? null,
    },
    { "#name": "name" },
  );
}

export async function listExceptionPlaybookTasks(exceptionTypeId: number) {
  const rows = await scanAll<ExceptionPlaybookTaskRow>(EXCEPTION_PLAYBOOK_TABLE);
  return rows
    .filter((row) => row.exception_type_id === exceptionTypeId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

export async function addExceptionPlaybookTask(input: {
  exceptionTypeId: number;
  title: string;
  ownerRole: string;
  dueHours?: number | null;
}) {
  const rows = await listExceptionPlaybookTasks(input.exceptionTypeId);
  const maxOrder = rows.reduce((max, row) => Math.max(max, row.sort_order), 0);
  const nextOrder = maxOrder + 1;
  const ts = nowIso();
  const id = await nextId("exception_playbook_tasks");
  await putItem(EXCEPTION_PLAYBOOK_TABLE, {
    id,
    exception_type_id: input.exceptionTypeId,
    sort_order: nextOrder,
    title: input.title,
    owner_role: input.ownerRole,
    due_hours: input.dueHours ?? null,
    created_at: ts,
    updated_at: ts,
  });
  return id;
}

export async function updateExceptionPlaybookTask(input: {
  taskId: number;
  title: string;
  ownerRole: string;
  dueHours?: number | null;
}) {
  await updateItem<ExceptionPlaybookTaskRow>(
    EXCEPTION_PLAYBOOK_TABLE,
    { id: input.taskId },
    "SET title = :title, owner_role = :owner_role, due_hours = :due_hours, updated_at = :updated_at",
    {
      ":title": input.title,
      ":owner_role": input.ownerRole,
      ":due_hours": input.dueHours ?? null,
      ":updated_at": nowIso(),
    },
  );
}

export async function deleteExceptionPlaybookTask(taskId: number) {
  await deleteItem(EXCEPTION_PLAYBOOK_TABLE, { id: taskId });
}

export async function listShipmentExceptions(shipmentId: number) {
  const [exceptions, types] = await Promise.all([
    scanAll<ShipmentExceptionRow>(SHIPMENT_EXCEPTIONS_TABLE),
    scanAll<ExceptionTypeRow>(EXCEPTION_TYPES_TABLE),
  ]);
  const typeMap = new Map(types.map((type) => [type.id, type]));

  return exceptions
    .filter((exception) => exception.shipment_id === shipmentId)
    .map((exception) => {
      const type = typeMap.get(exception.exception_type_id);
      return {
        ...exception,
        exception_name: type?.name ?? "Unknown",
        default_risk: type?.default_risk ?? "ON_TRACK",
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 100);
}

export async function createShipmentException(input: {
  shipmentId: number;
  exceptionTypeId: number;
  notes?: string | null;
  customerMessage?: string | null;
  shareWithCustomer?: boolean;
  createdByUserId?: number | null;
}) {
  const ts = nowIso();
  const id = await nextId("shipment_exceptions");
  await putItem(SHIPMENT_EXCEPTIONS_TABLE, {
    id,
    shipment_id: input.shipmentId,
    exception_type_id: input.exceptionTypeId,
    status: "OPEN",
    notes: input.notes ?? null,
    customer_message: input.customerMessage ?? null,
    share_with_customer: input.shareWithCustomer ? 1 : 0,
    created_at: ts,
    created_by_user_id: input.createdByUserId ?? null,
    resolved_at: null,
    resolved_by_user_id: null,
  });
  return id;
}

export async function resolveShipmentException(input: {
  exceptionId: number;
  resolvedByUserId?: number | null;
}) {
  await updateItem(
    SHIPMENT_EXCEPTIONS_TABLE,
    { id: input.exceptionId },
    "SET #status = :status, resolved_at = :resolved_at, resolved_by_user_id = :resolved_by_user_id",
    {
      ":status": "RESOLVED",
      ":resolved_at": nowIso(),
      ":resolved_by_user_id": input.resolvedByUserId ?? null,
    },
    { "#status": "status" },
  );
}
