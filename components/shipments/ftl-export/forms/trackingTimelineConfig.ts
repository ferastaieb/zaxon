export type TrackingRegion = "uae" | "ksa" | "jordan" | "syria";
export type SyriaClearanceMode = "ZAXON" | "CLIENT";

export type TrackingStageType = "customs" | "checkpoint";

export type TrackingStageDefinition = {
  id: string;
  title: string;
  shortLabel: string;
  location: string;
  type: TrackingStageType;
  dateKey: string;
  flagKey?: string;
  fileKey?: string;
  includeOffloadLocation?: boolean;
};

export const TRACKING_REGION_FLOW: Array<{
  id: TrackingRegion;
  label: string;
  code: string;
}> = [
  { id: "uae", label: "UAE", code: "AE" },
  { id: "ksa", label: "KSA", code: "SA" },
  { id: "jordan", label: "Jordan", code: "JO" },
  { id: "syria", label: "Syria", code: "SY" },
];

export function trackingRegionMeta(region: TrackingRegion) {
  if (region === "uae") {
    return {
      title: "UAE Tracking",
      description: "Jebel Ali and Sila checkpoints.",
    };
  }
  if (region === "ksa") {
    return {
      title: "KSA Tracking",
      description: "Batha entry and Hadietha exit.",
    };
  }
  if (region === "jordan") {
    return {
      title: "Jordan Tracking",
      description: "Omari entry and Jaber exit.",
    };
  }
  return {
    title: "Syria Tracking",
    description: "Naseeb/Syria clearance and final delivery.",
  };
}

export function trackingStagesForRegion(
  region: TrackingRegion,
  syriaMode: SyriaClearanceMode,
): TrackingStageDefinition[] {
  if (region === "uae") {
    return [
      {
        id: "jebel_ali_customs",
        title: "Jebel Ali Customs",
        shortLabel: "Jebel Ali",
        location: "Dubai Free Zone",
        type: "customs",
        dateKey: "jebel_ali_declaration_date",
        fileKey: "jebel_ali_declaration_upload",
      },
      {
        id: "jebel_ali_sealed",
        title: "Trucks Sealed",
        shortLabel: "Sealed",
        location: "Jebel Ali",
        type: "checkpoint",
        flagKey: "jebel_ali_trucks_sealed",
        dateKey: "jebel_ali_sealed_date",
      },
      {
        id: "jebel_ali_exit",
        title: "Exit Jebel Ali",
        shortLabel: "Exit JAFZA",
        location: "Dubai",
        type: "checkpoint",
        flagKey: "jebel_ali_exit",
        dateKey: "jebel_ali_exit_date",
      },
      {
        id: "sila_customs",
        title: "Sila Customs",
        shortLabel: "Sila Customs",
        location: "Abu Dhabi",
        type: "customs",
        dateKey: "sila_declaration_date",
        fileKey: "sila_declaration_upload",
      },
      {
        id: "sila_arrived",
        title: "Arrived at Sila",
        shortLabel: "Arrived Sila",
        location: "Sila Border",
        type: "checkpoint",
        flagKey: "sila_arrived",
        dateKey: "sila_arrived_date",
      },
      {
        id: "sila_exit",
        title: "Exit Sila",
        shortLabel: "Exit Sila",
        location: "Sila Border",
        type: "checkpoint",
        flagKey: "sila_exit",
        dateKey: "sila_exit_date",
      },
    ];
  }

  if (region === "ksa") {
    return [
      {
        id: "batha_customs",
        title: "Batha Customs",
        shortLabel: "Batha Customs",
        location: "Batha Entry",
        type: "customs",
        dateKey: "batha_declaration_date",
        fileKey: "batha_declaration_upload",
      },
      {
        id: "batha_arrived",
        title: "Arrived at Batha",
        shortLabel: "Arrived Batha",
        location: "Batha Border",
        type: "checkpoint",
        flagKey: "batha_arrived",
        dateKey: "batha_arrived_date",
      },
      {
        id: "batha_exit",
        title: "Exit Batha",
        shortLabel: "Exit Batha",
        location: "Batha Border",
        type: "checkpoint",
        flagKey: "batha_exit",
        dateKey: "batha_exit_date",
      },
      {
        id: "hadietha_exit",
        title: "Exit Hadietha",
        shortLabel: "Exit Hadietha",
        location: "KSA Exit",
        type: "checkpoint",
        flagKey: "hadietha_exit",
        dateKey: "hadietha_exit_date",
      },
    ];
  }

  if (region === "jordan") {
    return [
      {
        id: "omari_customs",
        title: "Omari Customs",
        shortLabel: "Omari Customs",
        location: "Omari Entry",
        type: "customs",
        dateKey: "omari_declaration_date",
        fileKey: "omari_declaration_upload",
      },
      {
        id: "omari_arrived",
        title: "Arrived at Omari",
        shortLabel: "Arrived Omari",
        location: "Omari Border",
        type: "checkpoint",
        flagKey: "omari_arrived",
        dateKey: "omari_arrived_date",
      },
      {
        id: "omari_exit",
        title: "Exit Omari",
        shortLabel: "Exit Omari",
        location: "Omari Border",
        type: "checkpoint",
        flagKey: "omari_exit",
        dateKey: "omari_exit_date",
      },
      {
        id: "jaber_exit",
        title: "Exit Jaber",
        shortLabel: "Exit Jaber",
        location: "Jordan Exit",
        type: "checkpoint",
        flagKey: "jaber_exit",
        dateKey: "jaber_exit_date",
      },
    ];
  }

  const commonSyria: TrackingStageDefinition[] = [
    {
      id: "syria_arrived",
      title: "Arrived in Syria",
      shortLabel: "Arrived Syria",
      location: "Naseeb Border",
      type: "checkpoint",
      flagKey: "syria_arrived",
      dateKey: "syria_arrived_date",
    },
    {
      id: "syria_exit",
      title: "Exit Border",
      shortLabel: "Exit Border",
      location: "Naseeb Border",
      type: "checkpoint",
      flagKey: "syria_exit",
      dateKey: "syria_exit_date",
    },
    {
      id: "syria_delivered",
      title: "Delivered",
      shortLabel: "Delivered",
      location: "Final Destination",
      type: "checkpoint",
      flagKey: "syria_delivered",
      dateKey: "syria_delivered_date",
      includeOffloadLocation: true,
    },
  ];

  if (syriaMode === "ZAXON") {
    return [
      {
        id: "syria_customs",
        title: "Syria Customs",
        shortLabel: "Syria Customs",
        location: "Syria Entry",
        type: "customs",
        dateKey: "syria_declaration_date",
        fileKey: "syria_declaration_upload",
      },
      ...commonSyria,
    ];
  }

  return commonSyria;
}
