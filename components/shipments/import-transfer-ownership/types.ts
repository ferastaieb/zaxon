import type {
  ShipmentOverallStatus,
  ShipmentRisk,
  StepStatus,
} from "@/lib/domain";
import type { StepFieldSchema, StepFieldValues } from "@/lib/stepFields";
import type { FtlImportAllocationHistoryRow } from "@/lib/ftlExport/importCandidateTypes";
import type { ImportTransferStockType } from "@/lib/importTransferOwnership/constants";

export type ImportTransferStepData = {
  id: number;
  name: string;
  status: StepStatus;
  notes: string | null;
  values: StepFieldValues;
  schema: StepFieldSchema;
};

export type ImportTransferDocumentMeta = {
  id: number;
  file_name: string;
  uploaded_at: string;
  count?: number;
  source?: "STAFF" | "CUSTOMER";
  is_received?: boolean;
  review_status?: "PENDING" | "VERIFIED" | "REJECTED";
  review_note?: string | null;
};

export type ImportTransferShipmentMeta = {
  id: number;
  shipment_code: string;
  origin: string;
  destination: string;
  overall_status: ShipmentOverallStatus;
  risk: ShipmentRisk;
};

export type ImportTransferStockSummary = {
  importedQuantity: number;
  importedWeight: number;
  exportedQuantity: number;
  exportedWeight: number;
  remainingQuantity: number;
  remainingWeight: number;
  stockType: ImportTransferStockType;
  allocationHistory: FtlImportAllocationHistoryRow[];
};
