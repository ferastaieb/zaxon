export const Roles = [
  "ADMIN",
  "OPERATIONS",
  "CLEARANCE",
  "SALES",
  "FINANCE",
] as const;
export type Role = (typeof Roles)[number];

export const TransportModes = ["SEA", "LAND", "SEA_LAND"] as const;
export type TransportMode = (typeof TransportModes)[number];

export const ShipmentTypes = ["FCL", "LCL", "LAND"] as const;
export type ShipmentType = (typeof ShipmentTypes)[number];

export const ShipmentOverallStatuses = [
  "CREATED",
  "IN_PROGRESS",
  "COMPLETED",
  "DELAYED",
] as const;
export type ShipmentOverallStatus = (typeof ShipmentOverallStatuses)[number];

export const ShipmentRisks = ["ON_TRACK", "AT_RISK", "BLOCKED"] as const;
export type ShipmentRisk = (typeof ShipmentRisks)[number];

export const StepStatuses = ["PENDING", "IN_PROGRESS", "DONE", "BLOCKED"] as const;
export type StepStatus = (typeof StepStatuses)[number];

export const TaskStatuses = ["OPEN", "IN_PROGRESS", "DONE", "BLOCKED"] as const;
export type TaskStatus = (typeof TaskStatuses)[number];

export const PartyTypes = ["CUSTOMER", "SUPPLIER", "CUSTOMS_BROKER"] as const;
export type PartyType = (typeof PartyTypes)[number];

export const ExceptionStatuses = ["OPEN", "RESOLVED"] as const;
export type ExceptionStatus = (typeof ExceptionStatuses)[number];

export const DocumentTypes = [
  "INVOICE",
  "BILL_OF_LADING",
  "PACKING_LIST",
  "CERTIFICATE",
  "CUSTOMS_ENTRY",
  "OTHER",
] as const;
export type DocumentType = (typeof DocumentTypes)[number];

export function roleLabel(role: Role) {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "OPERATIONS":
      return "Operations";
    case "CLEARANCE":
      return "Clearance";
    case "SALES":
      return "Sales";
    case "FINANCE":
      return "Finance (read-only)";
  }
}

export function transportModeLabel(mode: TransportMode) {
  switch (mode) {
    case "SEA":
      return "Sea";
    case "LAND":
      return "Land";
    case "SEA_LAND":
      return "Sea + Land";
  }
}

export function shipmentTypeLabel(type: ShipmentType) {
  switch (type) {
    case "FCL":
      return "FCL";
    case "LCL":
      return "LCL";
    case "LAND":
      return "Land";
  }
}

export function riskLabel(risk: ShipmentRisk) {
  switch (risk) {
    case "ON_TRACK":
      return "On Track";
    case "AT_RISK":
      return "At Risk";
    case "BLOCKED":
      return "Blocked";
  }
}

export function overallStatusLabel(status: ShipmentOverallStatus) {
  switch (status) {
    case "CREATED":
      return "Created";
    case "IN_PROGRESS":
      return "In progress";
    case "COMPLETED":
      return "Completed";
    case "DELAYED":
      return "Delayed";
  }
}

export function stepStatusLabel(status: StepStatus) {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "IN_PROGRESS":
      return "In progress";
    case "DONE":
      return "Done";
    case "BLOCKED":
      return "Blocked";
  }
}

export function taskStatusLabel(status: TaskStatus) {
  switch (status) {
    case "OPEN":
      return "Open";
    case "IN_PROGRESS":
      return "In progress";
    case "DONE":
      return "Done";
    case "BLOCKED":
      return "Blocked";
  }
}
