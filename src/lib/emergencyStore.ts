import { useSyncExternalStore } from "react";
import type { Hospital } from "@/server/emergency.functions";
import type { InjuryType } from "@/lib/injuryTypes";

export type Coords = { lat: number; lng: number };

export type EmergencyState = {
  location: Coords | null;
  locationLabel: string;
  injury: InjuryType | null;
  hospitals: Hospital[] | null;
  etas: Record<string, { distance: number; duration: number } | null>;
  selectedHospital: Hospital | null;
};

const STORAGE_KEY = "medroute:state:v1";

const initial: EmergencyState = {
  location: null,
  locationLabel: "",
  injury: null,
  hospitals: null,
  etas: {},
  selectedHospital: null,
};

function load(): EmergencyState {
  if (typeof window === "undefined") return initial;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    return { ...initial, ...JSON.parse(raw) };
  } catch {
    return initial;
  }
}

let state: EmergencyState = load();
const listeners = new Set<() => void>();

function persist() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export const emergencyStore = {
  get: () => state,
  set(patch: Partial<EmergencyState>) {
    state = { ...state, ...patch };
    persist();
    listeners.forEach((l) => l());
  },
  reset() {
    state = initial;
    persist();
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useEmergencyState(): EmergencyState {
  return useSyncExternalStore(
    emergencyStore.subscribe,
    () => emergencyStore.get(),
    () => initial
  );
}
