import type { ShipmentOverallStatus } from "@/lib/domain";

export type FtlImportCandidate = {
  shipmentId: number;
  shipmentCode: string;
  clientNumber: string;
  importBoeNumber: string;
  processedAvailable: boolean;
  nonPhysicalStock: boolean;
  importedWeight: number;
  importedQuantity: number;
  packageType: string;
  cargoDescription: string;
  alreadyAllocatedWeight: number;
  alreadyAllocatedQuantity: number;
  remainingWeight: number;
  remainingQuantity: number;
  overallStatus: ShipmentOverallStatus;
};
