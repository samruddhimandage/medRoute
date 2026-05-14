import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  text: z.string().min(2).max(1000),
  language: z.string().min(2).max(8).default("en"),
});

const INJURY_IDS = [
  "brain",
  "cardiac",
  "bleeding",
  "bone",
  "burn",
  "respiratory",
  "pediatric",
  "obstetric",
  "general",
] as const;

export type SymptomAnalysis = {
  injuryId: (typeof INJURY_IDS)[number];
  detected_issue: string;
  medical_department: string;
  urgency_level: "Critical" | "Urgent" | "Standard";
  recommended_hospital_type: string;
  emergency_mode: boolean;
  recommended_action: string;
  reassurance_message: string;
};

const SYSTEM_PROMPT = `You are a calm, expert medical triage assistant for an emergency app used by ordinary people in India.
Users may panic, use slang, broken sentences, Hindi, Hinglish, Marathi, or describe pain instead of disease names.

Your job: read the user's words and return a SINGLE JSON object that maps the symptoms to ONE of these injury categories:

- "brain"        → stroke, head trauma, severe headache+vomiting, numbness, speech problems, seizures, fainting, dizziness, neurological
- "cardiac"      → chest pain/pressure, heart attack, left arm pain + sweating, palpitations, cardiac arrest
- "bleeding"     → severe bleeding, deep wound, hemorrhage, blood loss
- "bone"         → fracture, broken bone, accident, road accident, bike accident, dislocation, trauma, orthopedic
- "burn"         → fire/chemical/electrical burns, scald
- "respiratory"  → can't breathe, choking, asthma, shortness of breath, coughing blood, "saans nahi aa rahi"
- "pediatric"    → child/infant/baby emergency
- "obstetric"    → pregnancy, labor, delivery
- "general"      → anything else: stomach pain, vomiting, diarrhea, food poisoning, skin rashes/itching/allergy, eye pain/burning/blurry vision, ear/nose/throat issues, fever, collapse of unknown cause, unsure

Rules:
- ALWAYS pick exactly one injuryId from the list above.
- If the symptoms suggest a life-threatening situation (stroke, heart attack, severe bleeding, unconsciousness, breathing failure, seizure, major trauma), set emergency_mode=true and urgency_level="Critical".
- Reassurance must be calm and short (max 12 words), e.g. "Stay calm. We're finding the fastest help."
- recommended_action: 1 short sentence telling them what to do right now.
- Respond ONLY with raw JSON. No prose, no markdown fences.

JSON shape:
{
  "injuryId": "...",
  "detected_issue": "...",
  "medical_department": "...",
  "urgency_level": "Critical" | "Urgent" | "Standard",
  "recommended_hospital_type": "...",
  "emergency_mode": true|false,
  "recommended_action": "...",
  "reassurance_message": "..."
}`;

function safeParse(raw: string): SymptomAnalysis | null {
  let s = raw.trim();
  // Strip markdown fences if any
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  // Extract first {...}
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    if (!INJURY_IDS.includes(obj.injuryId)) obj.injuryId = "general";
    if (!["Critical", "Urgent", "Standard"].includes(obj.urgency_level)) {
      obj.urgency_level = "Standard";
    }
    obj.emergency_mode = !!obj.emergency_mode || obj.urgency_level === "Critical";
    return obj as SymptomAnalysis;
  } catch {
    return null;
  }
}

export const analyzeSymptoms = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }): Promise<{ result: SymptomAnalysis | null; error?: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { result: null, error: "AI service not configured." };

    const langName =
      { en: "English", hi: "Hindi", mr: "Marathi", ta: "Tamil", bn: "Bengali", te: "Telugu" }[
        data.language
      ] ?? "English";

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `User language: ${langName}.\nUser said: """${data.text}"""\n\nReturn JSON only.`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (res.status === 429) return { result: null, error: "Too many requests. Please try again in a moment." };
      if (res.status === 402) return { result: null, error: "AI credits exhausted. Please add credits in Workspace Settings." };
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error("AI gateway error:", res.status, txt);
        return { result: null, error: "AI service error. Please pick the emergency type manually." };
      }

      const json = await res.json();
      const content: string = json?.choices?.[0]?.message?.content ?? "";
      const parsed = safeParse(content);
      if (!parsed) return { result: null, error: "Could not understand symptoms. Please try again or pick manually." };
      return { result: parsed };
    } catch (e) {
      console.error("analyzeSymptoms failed:", e);
      return { result: null, error: "AI service unreachable. Please pick the emergency type manually." };
    }
  });
