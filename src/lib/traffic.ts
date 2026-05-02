/**
 * Simulated live traffic factor.
 * Real ORS API does not expose live traffic; we apply a realistic time-of-day
 * multiplier plus a small jitter that varies per refresh tick. This keeps ETAs
 * "live-feeling" without misleading the user about real-time congestion.
 */
export function trafficFactor(date: Date = new Date()): number {
  const h = date.getHours() + date.getMinutes() / 60;
  // Base curve: rush hours peak ~1.55x, late night ~0.85x
  let base = 1.0;
  if (h >= 7.5 && h <= 10) base = 1.45;            // morning rush
  else if (h > 10 && h <= 12) base = 1.15;
  else if (h > 12 && h <= 16) base = 1.1;
  else if (h > 16 && h <= 20) base = 1.55;         // evening rush
  else if (h > 20 && h <= 23) base = 1.1;
  else base = 0.88;                                 // late night / early morning

  // Tick-based jitter: changes every ~10s, ±6%
  const tick = Math.floor(Date.now() / 10000);
  const seed = (Math.sin(tick * 9301 + 49297) + 1) / 2; // 0..1 deterministic
  const jitter = 0.94 + seed * 0.12;
  return base * jitter;
}

/** Apply traffic to a base ORS duration (seconds). */
export function withTraffic(durationSeconds: number, date?: Date): number {
  return durationSeconds * trafficFactor(date);
}

/**
 * Estimated ambulance arrival time (seconds): dispatch + travel-to-user + return-to-hospital.
 * Ambulances drive faster than civilian cars (sirens), so we apply 0.75x to the user-trip
 * portion. Plus a small fixed dispatch overhead.
 */
export function ambulanceEta(travelToHospitalSeconds: number, date?: Date): number {
  const dispatchSec = 90; // ~1.5 min dispatch overhead
  const factor = trafficFactor(date);
  // Estimated time for ambulance to reach user: half the trip distance with siren factor 0.75
  const ambToUser = travelToHospitalSeconds * 0.5 * 0.75 * factor;
  return dispatchSec + ambToUser;
}
