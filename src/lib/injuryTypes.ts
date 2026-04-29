export type InjuryType = {
  id: string;
  label: string;
  description: string;
  /** Overpass query terms to prioritize matching hospitals */
  facilityKeywords: string[];
  severity: "critical" | "urgent" | "standard";
};

export const INJURY_TYPES: InjuryType[] = [
  {
    id: "brain",
    label: "Head / Brain Injury",
    description: "Concussion, skull trauma, loss of consciousness, stroke symptoms.",
    facilityKeywords: ["neurology", "neurosurgery", "trauma"],
    severity: "critical",
  },
  {
    id: "cardiac",
    label: "Cardiac / Chest Pain",
    description: "Heart attack, severe chest pain, irregular heartbeat.",
    facilityKeywords: ["cardiology", "cardiac", "emergency"],
    severity: "critical",
  },
  {
    id: "bleeding",
    label: "Severe Bleeding",
    description: "Heavy blood loss, deep wounds, hemorrhage.",
    facilityKeywords: ["trauma", "emergency", "surgery"],
    severity: "critical",
  },
  {
    id: "bone",
    label: "Bone / Fracture",
    description: "Broken bones, dislocations, severe sprains.",
    facilityKeywords: ["orthopedic", "orthopaedic", "trauma"],
    severity: "urgent",
  },
  {
    id: "burn",
    label: "Burns",
    description: "Fire, chemical or electrical burns of any degree.",
    facilityKeywords: ["burn", "trauma", "emergency"],
    severity: "urgent",
  },
  {
    id: "respiratory",
    label: "Breathing Difficulty",
    description: "Asthma attack, choking, severe shortness of breath.",
    facilityKeywords: ["pulmonology", "emergency", "respiratory"],
    severity: "critical",
  },
  {
    id: "pediatric",
    label: "Child / Pediatric",
    description: "Any emergency involving an infant or child.",
    facilityKeywords: ["pediatric", "paediatric", "children"],
    severity: "urgent",
  },
  {
    id: "obstetric",
    label: "Pregnancy / Labor",
    description: "Labor, pregnancy complications, obstetric emergency.",
    facilityKeywords: ["maternity", "obstetric", "gynecology"],
    severity: "urgent",
  },
  {
    id: "general",
    label: "Other Emergency",
    description: "Unspecified emergency requiring immediate care.",
    facilityKeywords: ["emergency", "general"],
    severity: "standard",
  },
];
