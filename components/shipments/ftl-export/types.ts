import type {
  ShipmentOverallStatus,
  ShipmentRisk,
  StepStatus,
} from "@/lib/domain";
import type { StepFieldSchema, StepFieldValues } from "@/lib/stepFields";
import type { FtlImportCandidate } from "@/lib/ftlExport/importCandidateTypes";

export type FtlStepData = {
  id: number;
  name: string;
  status: StepStatus;
  notes: string | null;
  values: StepFieldValues;
  schema: StepFieldSchema;
};

export type FtlDocumentMeta = {
  id: number;
  file_name: string;
  uploaded_at: string;
  source?: "STAFF" | "CUSTOMER";
  is_received?: boolean;
  review_status?: "PENDING" | "VERIFIED" | "REJECTED";
  review_note?: string | null;
};

export type FtlShipmentMeta = {
  id: number;
  shipment_code: string;
  origin: string;
  destination: string;
  overall_status: ShipmentOverallStatus;
  risk: ShipmentRisk;
};

export type { FtlImportCandidate };
