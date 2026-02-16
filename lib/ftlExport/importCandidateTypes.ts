import type { ShipmentOverallStatus } from "@/lib/domain";

export type FtlImportAllocationHistoryRow = {
  exportShipmentId: number;
  exportShipmentCode: string;
  exportDate: string;
  allocatedWeight: number;
  allocatedQuantity: number;
};

export type FtlImportCandidate = {
  shipmentId: number;
  shipmentCode: string;
  jobIds: string;
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
  allocationHistory: FtlImportAllocationHistoryRow[];
  overallStatus: ShipmentOverallStatus;
};
