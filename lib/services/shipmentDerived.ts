import "server-only";

import type { ShipmentOverallStatus, ShipmentRisk, StepStatus } from "@/lib/domain";
import { nowIso, scanAll, tableName, updateItem, getItem } from "@/lib/db";
import { listActiveUserIdsByRole } from "@/lib/data/users";
import { createAlert } from "@/lib/data/alerts";

const SHIPMENT_STEPS_TABLE = tableName("shipment_steps");
const SHIPMENT_EXCEPTIONS_TABLE = tableName("shipment_exceptions");
const EXCEPTION_TYPES_TABLE = tableName("exception_types");
const SHIPMENTS_TABLE = tableName("shipments");

const DUE_SOON_THRESHOLD_HOURS = 12;

type StepLite = {
  id: number;
  name: string;
  owner_role: string;
  status: StepStatus;
  due_at: string | null;
  shipment_id: number;
  sort_order: number;
};

type OpenExceptionLite = {
  id: number;
  default_risk: ShipmentRisk;
  exception_name: string;
};

function computeOverallStatus(steps: StepLite[]): ShipmentOverallStatus {
  if (steps.length === 0) return "CREATED";
  if (steps.every((s) => s.status === "DONE")) return "COMPLETED";
  if (steps.some((s) => s.status === "BLOCKED")) return "DELAYED";
  if (steps.some((s) => s.status === "IN_PROGRESS" || s.status === "DONE")) {
    return "IN_PROGRESS";
  }
  return "CREATED";
}

function computeRisk(steps: StepLite[], exceptions: OpenExceptionLite[]): ShipmentRisk {
  if (
    steps.some((s) => s.status === "BLOCKED") ||
    exceptions.some((e) => e.default_risk === "BLOCKED")
  ) {
    return "BLOCKED";
  }

  if (exceptions.some((e) => e.default_risk === "AT_RISK")) return "AT_RISK";

  const now = Date.now();
  const soonMs = DUE_SOON_THRESHOLD_HOURS * 3600 * 1000;
  for (const s of steps) {
    if (s.status === "DONE") continue;
    if (!s.due_at) continue;
    const due = Date.parse(s.due_at);
    if (Number.isNaN(due)) continue;
    if (due <= now || due - now <= soonMs) return "AT_RISK";
  }

  return "ON_TRACK";
}

export async function refreshShipmentDerivedState(input: {
  shipmentId: number;
  actorUserId?: number | null;
  updateLastUpdate?: boolean;
}) {
  const [steps, exceptions, exceptionTypes] = await Promise.all([
    scanAll<StepLite>(SHIPMENT_STEPS_TABLE),
    scanAll<{
      id: number;
      shipment_id: number;
      exception_type_id: number;
      status: "OPEN" | "RESOLVED";
      created_at: string;
    }>(SHIPMENT_EXCEPTIONS_TABLE),
    scanAll<{ id: number; name: string; default_risk: ShipmentRisk }>(
      EXCEPTION_TYPES_TABLE,
    ),
  ]);

  const typeMap = new Map(exceptionTypes.map((type) => [type.id, type]));

  const shipmentSteps = steps
    .filter((step) => step.shipment_id === input.shipmentId)
    .sort((a, b) => a.sort_order - b.sort_order);

  const openExceptions = exceptions
    .filter((ex) => ex.shipment_id === input.shipmentId && ex.status === "OPEN")
    .map((ex) => {
      const type = typeMap.get(ex.exception_type_id);
      return {
        id: ex.id,
        default_risk: type?.default_risk ?? "ON_TRACK",
        exception_name: type?.name ?? "Unknown",
      } as OpenExceptionLite;
    })
    .sort((a, b) => b.id - a.id);

  const computedOverall = computeOverallStatus(shipmentSteps);
  const computedRisk = computeRisk(shipmentSteps, openExceptions);

  const current = await getItem<{ overall_status: ShipmentOverallStatus; risk: ShipmentRisk }>(
    SHIPMENTS_TABLE,
    { id: input.shipmentId },
  );

  if (!current) return;

  const shouldUpdate =
    current.overall_status !== computedOverall || current.risk !== computedRisk;

  if (shouldUpdate) {
    if (input.updateLastUpdate) {
      await updateItem(
        SHIPMENTS_TABLE,
        { id: input.shipmentId },
        "SET overall_status = :overall_status, risk = :risk, last_update_at = :last_update_at, last_update_by_user_id = :last_update_by_user_id",
        {
          ":overall_status": computedOverall,
          ":risk": computedRisk,
          ":last_update_at": nowIso(),
          ":last_update_by_user_id": input.actorUserId ?? null,
        },
      );
    } else {
      await updateItem(
        SHIPMENTS_TABLE,
        { id: input.shipmentId },
        "SET overall_status = :overall_status, risk = :risk",
        { ":overall_status": computedOverall, ":risk": computedRisk },
      );
    }
  } else if (input.updateLastUpdate) {
    await updateItem(
      SHIPMENTS_TABLE,
      { id: input.shipmentId },
      "SET last_update_at = :last_update_at, last_update_by_user_id = :last_update_by_user_id",
      {
        ":last_update_at": nowIso(),
        ":last_update_by_user_id": input.actorUserId ?? null,
      },
    );
  }

  const now = Date.now();
  const soonMs = DUE_SOON_THRESHOLD_HOURS * 3600 * 1000;
  for (const s of shipmentSteps) {
    if (s.status === "DONE") continue;
    if (!s.due_at) continue;
    const due = Date.parse(s.due_at);
    if (Number.isNaN(due)) continue;

    const isOverdue = due <= now;
    const isDueSoon = !isOverdue && due - now <= soonMs;
    if (!isOverdue && !isDueSoon) continue;

    const recipients = new Set<number>();
    for (const id of await listActiveUserIdsByRole("ADMIN")) recipients.add(id);
    try {
      for (const id of await listActiveUserIdsByRole(s.owner_role as never)) {
        recipients.add(id);
      }
    } catch {
      // ignore unknown role strings
    }

    const kind = isOverdue ? "overdue" : "due-soon";
    const type = isOverdue ? "STEP_OVERDUE" : "STEP_DUE_SOON";
    const message = isOverdue
      ? `Step overdue: ${s.name}`
      : `Step due soon: ${s.name}`;

    for (const userId of recipients) {
      await createAlert({
        userId,
        shipmentId: input.shipmentId,
        type,
        message,
        dedupeKey: `step:${s.id}:${kind}`,
      });
    }
  }
}
