export type JafzaLandRouteId =
  | "JAFZA_TO_SYRIA"
  | "JAFZA_TO_KSA"
  | "JAFZA_TO_MUSHTARAKAH";

export type JafzaTrackingTabId =
  | "uae"
  | "ksa"
  | "jordan"
  | "syria"
  | "mushtarakah"
  | "lebanon";

export type JafzaCustomsBorderNode = {
  id: "jebel_ali" | "sila" | "batha" | "omari" | "naseeb" | "mushtarakah" | "masnaa";
  label: string;
  country: string;
  kind: "agent" | "clearance_mode";
  agentField?: string;
  clearanceModeField?: string;
  consigneePartyIdField?: string;
  consigneeNameField?: string;
  showConsigneeField?: string;
  clientFinalChoiceField?: string;
};

export type JafzaLandRouteProfile = {
  id: JafzaLandRouteId;
  label: string;
  origin: string;
  destination: string;
  trackingTabs: JafzaTrackingTabId[];
  customsChain: JafzaCustomsBorderNode[];
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function includesWord(value: string, needle: string) {
  return normalizeText(value).includes(normalizeText(needle));
}

const BATHA_AGENT_NODE: JafzaCustomsBorderNode = {
  id: "batha",
  label: "Batha Border",
  country: "SA",
  kind: "agent",
  agentField: "batha_agent_name",
};

const BATHA_CLEARANCE_NODE: JafzaCustomsBorderNode = {
  id: "batha",
  label: "Batha Border",
  country: "SA",
  kind: "clearance_mode",
  agentField: "batha_agent_name",
  clearanceModeField: "batha_clearance_mode",
  consigneePartyIdField: "batha_consignee_party_id",
  consigneeNameField: "batha_consignee_name",
  showConsigneeField: "show_batha_consignee_to_client",
  clientFinalChoiceField: "batha_client_final_choice",
};

const MASNAA_CLEARANCE_NODE: JafzaCustomsBorderNode = {
  id: "masnaa",
  label: "Masnaa Border",
  country: "LB",
  kind: "clearance_mode",
  agentField: "masnaa_agent_name",
  clearanceModeField: "masnaa_clearance_mode",
  consigneePartyIdField: "masnaa_consignee_party_id",
  consigneeNameField: "masnaa_consignee_name",
  showConsigneeField: "show_masnaa_consignee_to_client",
  clientFinalChoiceField: "masnaa_client_final_choice",
};

const NASEEB_CLEARANCE_NODE: JafzaCustomsBorderNode = {
  id: "naseeb",
  label: "Naseeb Border",
  country: "SY",
  kind: "clearance_mode",
  agentField: "naseeb_agent_name",
  clearanceModeField: "naseeb_clearance_mode",
  consigneePartyIdField: "syria_consignee_party_id",
  consigneeNameField: "syria_consignee_name",
  showConsigneeField: "show_syria_consignee_to_client",
  clientFinalChoiceField: "naseeb_client_final_choice",
};

export const JAFZA_LAND_ROUTES: Record<JafzaLandRouteId, JafzaLandRouteProfile> = {
  JAFZA_TO_SYRIA: {
    id: "JAFZA_TO_SYRIA",
    label: "JAFZA, Dubai to Syria",
    origin: "JAFZA, Dubai",
    destination: "Syria",
    trackingTabs: ["uae", "ksa", "jordan", "syria"],
    customsChain: [
      {
        id: "jebel_ali",
        label: "Jebel Ali FZ",
        country: "AE",
        kind: "agent",
        agentField: "jebel_ali_agent_name",
      },
      {
        id: "sila",
        label: "Sila Border",
        country: "AE",
        kind: "agent",
        agentField: "sila_agent_name",
      },
      BATHA_AGENT_NODE,
      {
        id: "omari",
        label: "Omari Border",
        country: "JO",
        kind: "agent",
        agentField: "omari_agent_name",
      },
      NASEEB_CLEARANCE_NODE,
    ],
  },
  JAFZA_TO_KSA: {
    id: "JAFZA_TO_KSA",
    label: "JAFZA, Dubai to KSA",
    origin: "JAFZA, Dubai",
    destination: "KSA",
    trackingTabs: ["uae", "ksa"],
    customsChain: [
      {
        id: "jebel_ali",
        label: "Jebel Ali FZ",
        country: "AE",
        kind: "agent",
        agentField: "jebel_ali_agent_name",
      },
      {
        id: "sila",
        label: "Sila Border",
        country: "AE",
        kind: "agent",
        agentField: "sila_agent_name",
      },
      BATHA_CLEARANCE_NODE,
    ],
  },
  JAFZA_TO_MUSHTARAKAH: {
    id: "JAFZA_TO_MUSHTARAKAH",
    label: "JAFZA, Dubai to Mushtarakah, Lebanon",
    origin: "JAFZA, Dubai",
    destination: "Mushtarakah, Lebanon",
    trackingTabs: ["uae", "ksa", "jordan", "mushtarakah", "lebanon"],
    customsChain: [
      {
        id: "jebel_ali",
        label: "Jebel Ali FZ",
        country: "AE",
        kind: "agent",
        agentField: "jebel_ali_agent_name",
      },
      {
        id: "sila",
        label: "Sila Border",
        country: "AE",
        kind: "agent",
        agentField: "sila_agent_name",
      },
      BATHA_AGENT_NODE,
      {
        id: "omari",
        label: "Omari Border",
        country: "JO",
        kind: "agent",
        agentField: "omari_agent_name",
      },
      {
        id: "mushtarakah",
        label: "Mushtarakah",
        country: "SY",
        kind: "agent",
        agentField: "mushtarakah_agent_name",
        consigneePartyIdField: "mushtarakah_consignee_party_id",
        consigneeNameField: "mushtarakah_consignee_name",
      },
      MASNAA_CLEARANCE_NODE,
    ],
  },
};

export function jafzaRouteById(routeId: JafzaLandRouteId): JafzaLandRouteProfile {
  return JAFZA_LAND_ROUTES[routeId];
}

export function resolveJafzaLandRoute(
  origin: string,
  destination: string,
): JafzaLandRouteId {
  const normalizedOrigin = normalizeText(origin);
  const normalizedDestination = normalizeText(destination);

  const originLooksJafza =
    includesWord(normalizedOrigin, "jafza") ||
    (includesWord(normalizedOrigin, "jebel ali") && includesWord(normalizedOrigin, "dubai"));

  if (!originLooksJafza) {
    return "JAFZA_TO_SYRIA";
  }

  if (includesWord(normalizedDestination, "mushtarakah")) {
    return "JAFZA_TO_MUSHTARAKAH";
  }
  if (normalizedDestination === "ksa" || includesWord(normalizedDestination, "saudi")) {
    return "JAFZA_TO_KSA";
  }
  return "JAFZA_TO_SYRIA";
}

export function routeTrackingUsesSharedSyriaStep(routeId: JafzaLandRouteId) {
  return routeId === "JAFZA_TO_MUSHTARAKAH";
}

