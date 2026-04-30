export type InjuryType = {
  id: string;
  label: string;
  description: string;
  /** Overpass query terms to prioritize matching hospitals */
  facilityKeywords: string[];
  severity: "critical" | "urgent" | "standard";
  /** lucide-react icon name */
  icon:
    | "Brain"
    | "HeartPulse"
    | "Droplet"
    | "Bone"
    | "Flame"
    | "Wind"
    | "Baby"
    | "Stethoscope"
    | "Plus";
};

export const INJURY_TYPES: InjuryType[] = [
  {
    id: "brain",
    label: "Head / Brain",
    description: "Concussion, skull trauma, stroke symptoms.",
    facilityKeywords: ["neurology", "neurosurgery", "trauma"],
    severity: "critical",
    icon: "Brain",
  },
  {
    id: "cardiac",
    label: "Cardiac / Chest Pain",
    description: "Heart attack, severe chest pain, arrhythmia.",
    facilityKeywords: ["cardiology", "cardiac", "emergency"],
    severity: "critical",
    icon: "HeartPulse",
  },
  {
    id: "bleeding",
    label: "Severe Bleeding",
    description: "Heavy blood loss, deep wounds, hemorrhage.",
    facilityKeywords: ["trauma", "emergency", "surgery"],
    severity: "critical",
    icon: "Droplet",
  },
  {
    id: "bone",
    label: "Bone / Fracture",
    description: "Broken bones, dislocations, severe sprains.",
    facilityKeywords: ["orthopedic", "orthopaedic", "trauma"],
    severity: "urgent",
    icon: "Bone",
  },
  {
    id: "burn",
    label: "Burns",
    description: "Fire, chemical or electrical burns.",
    facilityKeywords: ["burn", "trauma", "emergency"],
    severity: "urgent",
    icon: "Flame",
  },
  {
    id: "respiratory",
    label: "Breathing Difficulty",
    description: "Asthma, choking, shortness of breath.",
    facilityKeywords: ["pulmonology", "emergency", "respiratory"],
    severity: "critical",
    icon: "Wind",
  },
  {
    id: "pediatric",
    label: "Child / Pediatric",
    description: "Emergency involving infant or child.",
    facilityKeywords: ["pediatric", "paediatric", "children"],
    severity: "urgent",
    icon: "Baby",
  },
  {
    id: "obstetric",
    label: "Pregnancy / Labor",
    description: "Labor, pregnancy complications.",
    facilityKeywords: ["maternity", "obstetric", "gynecology"],
    severity: "urgent",
    icon: "Stethoscope",
  },
  {
    id: "general",
    label: "Other Emergency",
    description: "Unspecified emergency requiring care.",
    facilityKeywords: ["emergency", "general"],
    severity: "standard",
    icon: "Plus",
  },
];
