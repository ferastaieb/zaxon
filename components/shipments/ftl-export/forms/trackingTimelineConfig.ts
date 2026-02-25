import {
  jafzaRouteById,
  resolveJafzaLandRoute,
  type JafzaLandRouteId,
  type JafzaTrackingTabId,
} from "@/lib/routes/jafzaLandRoutes";

export type TrackingRegion =
  | "uae"
  | "ksa"
  | "jordan"
  | "syria"
  | "mushtarakah"
  | "lebanon";
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

export type TrackingRegionMeta = {
  id: TrackingRegion;
  label: string;
  code: string;
};

const REGION_META: Record<TrackingRegion, TrackingRegionMeta> = {
  uae: { id: "uae", label: "UAE", code: "AE" },
  ksa: { id: "ksa", label: "KSA", code: "SA" },
  jordan: { id: "jordan", label: "Jordan", code: "JO" },
  syria: { id: "syria", label: "Syria", code: "SY" },
  mushtarakah: { id: "mushtarakah", label: "Mushtarakah", code: "SY" },
  lebanon: { id: "lebanon", label: "Lebanon", code: "LB" },
};

const TAB_ID_TO_REGION: Record<JafzaTrackingTabId, TrackingRegion> = {
  uae: "uae",
  ksa: "ksa",
  jordan: "jordan",
  syria: "syria",
  mushtarakah: "mushtarakah",
  lebanon: "lebanon",
};

export const TRACKING_REGION_FLOW: TrackingRegionMeta[] = [
  REGION_META.uae,
  REGION_META.ksa,
  REGION_META.jordan,
  REGION_META.syria,
];

export function trackingRegionFlowForRoute(routeId: JafzaLandRouteId): TrackingRegionMeta[] {
  return jafzaRouteById(routeId).trackingTabs.map(
    (tabId) => REGION_META[TAB_ID_TO_REGION[tabId]],
  );
}

export function resolveRouteIdFromShipment(input: {
  origin: string;
  destination: string;
}): JafzaLandRouteId {
  return resolveJafzaLandRoute(input.origin, input.destination);
}

export function trackingRegionMeta(region: TrackingRegion, routeId: JafzaLandRouteId) {
  if (region === "uae") {
    return {
      title: "UAE Tracking",
      description: "Jebel Ali and Sila checkpoints.",
    };
  }
  if (region === "ksa") {
    if (routeId === "JAFZA_TO_KSA") {
      return {
        title: "KSA Tracking",
        description: "Batha entry and final Batha delivery.",
      };
    }
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
  if (region === "mushtarakah") {
    return {
      title: "Mushtarakah Tracking",
      description: "Entry, warehouse handling, and Mushtarakah exit.",
    };
  }
  if (region === "lebanon") {
    return {
      title: "Lebanon Tracking",
      description: "Naseeb and Masnaa crossing checkpoints.",
    };
  }
  return {
    title: "Syria Tracking",
    description: "Naseeb/Syria clearance and final delivery.",
  };
}

function uaeStages(): TrackingStageDefinition[] {
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

function ksaStages(routeId: JafzaLandRouteId): TrackingStageDefinition[] {
  const base: TrackingStageDefinition[] = [
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
  ];

  if (routeId === "JAFZA_TO_KSA") {
    return [
      ...base,
      {
        id: "batha_entered",
        title: "Entered Batha",
        shortLabel: "Entered Batha",
        location: "Batha Border",
        type: "checkpoint",
        flagKey: "batha_entered",
        dateKey: "batha_entered_date",
      },
      {
        id: "batha_delivered",
        title: "Delivered at Batha",
        shortLabel: "Delivered",
        location: "Batha",
        type: "checkpoint",
        flagKey: "batha_delivered",
        dateKey: "batha_delivered_date",
      },
    ];
  }

  return [
    ...base,
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

function jordanStages(): TrackingStageDefinition[] {
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

function syriaStages(syriaMode: SyriaClearanceMode): TrackingStageDefinition[] {
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

function mushtarakahStages(): TrackingStageDefinition[] {
  return [
    {
      id: "mushtarakah_entered",
      title: "Enter Mushtarakah",
      shortLabel: "Enter",
      location: "Mushtarakah",
      type: "checkpoint",
      flagKey: "mushtarakah_entered",
      dateKey: "mushtarakah_entered_date",
    },
    {
      id: "mushtarakah_offloaded_warehouse",
      title: "Offloaded at Mushtarakah warehouse",
      shortLabel: "Offloaded",
      location: "Mushtarakah Warehouse",
      type: "checkpoint",
      flagKey: "mushtarakah_offloaded_warehouse",
      dateKey: "mushtarakah_offloaded_warehouse_date",
    },
    {
      id: "mushtarakah_loaded_syrian_trucks",
      title: "Loaded into Syrian trucks",
      shortLabel: "Loaded",
      location: "Mushtarakah Warehouse",
      type: "checkpoint",
      flagKey: "mushtarakah_loaded_syrian_trucks",
      dateKey: "mushtarakah_loaded_syrian_trucks_date",
    },
    {
      id: "mushtarakah_exit",
      title: "Exit Mushtarakah",
      shortLabel: "Exit",
      location: "Mushtarakah Border",
      type: "checkpoint",
      flagKey: "mushtarakah_exit",
      dateKey: "mushtarakah_exit_date",
    },
  ];
}

function lebanonStages(): TrackingStageDefinition[] {
  return [
    {
      id: "naseeb_arrived",
      title: "Naseeb Arrived",
      shortLabel: "Naseeb Arrived",
      location: "Naseeb Border",
      type: "checkpoint",
      flagKey: "naseeb_arrived",
      dateKey: "naseeb_arrived_date",
    },
    {
      id: "naseeb_entered",
      title: "Naseeb Entered",
      shortLabel: "Naseeb Entered",
      location: "Naseeb Border",
      type: "checkpoint",
      flagKey: "naseeb_entered",
      dateKey: "naseeb_entered_date",
    },
    {
      id: "masnaa_arrived",
      title: "Masnaa Arrived",
      shortLabel: "Masnaa Arrived",
      location: "Masnaa Border",
      type: "checkpoint",
      flagKey: "masnaa_arrived",
      dateKey: "masnaa_arrived_date",
    },
    {
      id: "masnaa_entered",
      title: "Masnaa Entered",
      shortLabel: "Masnaa Entered",
      location: "Masnaa Border",
      type: "checkpoint",
      flagKey: "masnaa_entered",
      dateKey: "masnaa_entered_date",
    },
    {
      id: "masnaa_delivered",
      title: "Delivered at Masnaa",
      shortLabel: "Delivered",
      location: "Lebanon",
      type: "checkpoint",
      flagKey: "masnaa_delivered",
      dateKey: "masnaa_delivered_date",
    },
  ];
}

export function trackingStagesForRegion(input: {
  region: TrackingRegion;
  routeId: JafzaLandRouteId;
  syriaMode: SyriaClearanceMode;
}): TrackingStageDefinition[] {
  if (input.region === "uae") return uaeStages();
  if (input.region === "ksa") return ksaStages(input.routeId);
  if (input.region === "jordan") return jordanStages();
  if (input.region === "mushtarakah") return mushtarakahStages();
  if (input.region === "lebanon") return lebanonStages();
  return syriaStages(input.syriaMode);
}

