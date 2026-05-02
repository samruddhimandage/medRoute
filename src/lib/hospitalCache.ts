import type { Hospital } from "@/server/emergency.functions";
import type { Coords } from "@/lib/emergencyStore";

const KEY = "medroute:cache:hospitals:v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

type Cached = {
  at: number;
  location: Coords;
  injuryId: string;
  hospitals: Hospital[];
};

export function saveHospitalCache(c: Omit<Cached, "at">) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...c, at: Date.now() }));
  } catch { /* ignore */ }
}

export function loadHospitalCache(location: Coords, injuryId: string): Hospital[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (Date.now() - c.at > MAX_AGE_MS) return null;
    if (c.injuryId !== injuryId) return null;
    // Within ~5km of cached location → consider relevant
    const dx = (c.location.lat - location.lat) * 111;
    const dy = (c.location.lng - location.lng) * 96;
    if (Math.sqrt(dx * dx + dy * dy) > 5) return null;
    return c.hospitals;
  } catch {
    return null;
  }
}
