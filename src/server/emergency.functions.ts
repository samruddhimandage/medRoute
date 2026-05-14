import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const NearbySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  keywords: z.array(z.string().min(1).max(40)).min(1).max(10),
  radiusMeters: z.number().min(1000).max(200000).default(50000),
});

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

export type Hospital = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  phone?: string;
  address?: string;
  emergency?: boolean;
  matchedKeywords: string[];
};

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const findNearbyHospitals = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => NearbySchema.parse(d))
  .handler(async ({ data }) => {
    // Expanding radius search so users always get the NEAREST hospitals
    // even when none exist within the initial radius.
    const radii = [data.radiusMeters, 50000, 100000, 200000].filter(
      (v, i, a) => a.indexOf(v) === i
    );

    const fetchOverpass = async (radius: number) => {
      const query = `[out:json][timeout:25];(node["amenity"="hospital"](around:${radius},${data.lat},${data.lng});way["amenity"="hospital"](around:${radius},${data.lat},${data.lng});relation["amenity"="hospital"](around:${radius},${data.lat},${data.lng}););out center tags 80;`;
      for (const url of OVERPASS_ENDPOINTS) {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
              "User-Agent": "MedRouteEmergencyApp/1.0 (contact@medroute.app)",
            },
            body: "data=" + encodeURIComponent(query),
          });
          if (!res.ok) {
            console.error("Overpass endpoint", url, "status", res.status);
            continue;
          }
          return (await res.json()) as { elements: Array<any> };
        } catch (e) {
          console.error("Overpass endpoint", url, "fetch failed", e);
        }
      }
      return null;
    };

    try {
      let json: { elements: Array<any> } | null = null;
      let usedRadius = data.radiusMeters;
      for (const r of radii) {
        json = await fetchOverpass(r);
        if (json && json.elements && json.elements.length > 0) {
          usedRadius = r;
          break;
        }
      }
      if (!json) {
        return { hospitals: [] as Hospital[], error: "Hospital directory is unreachable. Please try again." };
      }
      const kw = data.keywords.map((k) => k.toLowerCase());

      // Single-specialty facility detection. If a place is clearly an
      // Eye/Dental/ENT/Maternity/Ayush/Vet/Fertility/Cancer/Psych-only
      // facility, it should NOT be returned for unrelated emergencies
      // (e.g. fever/cold should not surface "Mohite Eye Hospital").
      const SPECIALTY: Array<{ id: string; pattern: RegExp; terms: string[] }> = [
        { id: "eye", pattern: /\b(eye|ophthal|netra|drishti|vision)\b/i, terms: ["eye", "ophthal", "vision"] },
        { id: "dental", pattern: /\b(dental|dentist|teeth|tooth|orthodont)\b/i, terms: ["dental", "dentist", "tooth"] },
        { id: "ent", pattern: /(\bent\b|ear[, ]+nose|nose[, ]+throat)/i, terms: ["ent", "ear", "nose", "throat"] },
        { id: "skin", pattern: /\b(skin|derma|cosmetic|aesthet)\b/i, terms: ["skin", "derma"] },
        { id: "maternity", pattern: /\b(maternity|gyna?ec|women|obstetric|mother\s*&?\s*child|prasuti)\b/i, terms: ["maternity", "obstetric", "gynec", "pediatric", "paediatric", "children", "women", "child"] },
        { id: "ayush", pattern: /\b(ayurved|homeo|homoeo|unani|siddha|naturopath|panchakarma)\b/i, terms: [] },
        { id: "veterinary", pattern: /\b(veterinar|pet hospital|animal hospital)\b/i, terms: [] },
        { id: "fertility", pattern: /\b(fertility|ivf|test\s*tube)\b/i, terms: [] },
        { id: "cancer", pattern: /\b(cancer|onco|tata\s+memorial)\b/i, terms: ["cancer", "onco"] },
        { id: "cardiac", pattern: /\b(cardiac|cardio|heart\s+(hospital|institute|care|centre|center))\b/i, terms: ["cardiac", "cardio", "heart"] },
        { id: "ortho", pattern: /\b(orthop[ae]edic|fracture)\b/i, terms: ["orthop", "fracture", "trauma", "bone"] },
        { id: "neuro", pattern: /\b(neuro|stroke|brain)\b/i, terms: ["neuro", "stroke", "brain"] },
        { id: "psych", pattern: /\b(psychiatr|mental health|de[-\s]?addict|rehabilitation)\b/i, terms: ["psychiatr", "mental"] },
        { id: "kidney", pattern: /\b(dialysis|nephro|kidney)\b/i, terms: ["dialysis", "nephro", "kidney"] },
      ];
      // Always exclude these regardless of injury — never relevant for emergency triage.
      const ALWAYS_EXCLUDE = new Set(["veterinary", "ayush", "fertility"]);

      const hospitals: Hospital[] = json.elements
        .map((el) => {
          const lat = el.lat ?? el.center?.lat;
          const lng = el.lon ?? el.center?.lon;
          if (typeof lat !== "number" || typeof lng !== "number") return null;
          const tags = el.tags ?? {};
          const blob = JSON.stringify(tags).toLowerCase();
          const name: string = tags.name || tags["name:en"] || tags["operator"] || "Unnamed Hospital";
          const haystack = `${name} ${blob}`;

          // Detect specialty (use name+tags for higher confidence than blob alone).
          const specialty = SPECIALTY.find((s) => s.pattern.test(haystack));
          if (specialty) {
            if (ALWAYS_EXCLUDE.has(specialty.id)) return null;
            // Hospital is single-specialty. Only include it if the user's
            // emergency keywords actually overlap with that specialty.
            const overlap = specialty.terms.some((t) =>
              kw.some((k) => k.includes(t) || t.includes(k))
            );
            if (!overlap) return null;
          }

          const matched = kw.filter((k) => blob.includes(k));
          const distanceMeters = haversine({ lat: data.lat, lng: data.lng }, { lat, lng });
          const addrParts = [
            tags["addr:housenumber"],
            tags["addr:street"],
            tags["addr:suburb"] || tags["addr:neighbourhood"],
            tags["addr:city"] || tags["addr:district"],
            tags["addr:state"],
            tags["addr:postcode"],
          ].filter(Boolean);
          const address =
            tags["addr:full"] ||
            (addrParts.length > 0 ? addrParts.join(", ") : undefined);
          return {
            id: `${el.type}/${el.id}`,
            name,
            lat,
            lng,
            distanceMeters,
            phone: tags.phone || tags["contact:phone"] || tags["contact:mobile"],
            address,
            emergency: tags.emergency === "yes" || tags["emergency:phone"] !== undefined,
            matchedKeywords: matched,
          } as Hospital;
        })
        .filter((h): h is Hospital => !!h)
        .sort((a, b) => {
          // Primary: nearest first. Specialty match gets a small 500m credit;
          // verified emergency departments get 750m credit.
          const eff = (h: Hospital) =>
            h.distanceMeters - h.matchedKeywords.length * 500 - (h.emergency ? 750 : 0);
          return eff(a) - eff(b);
        })
        .slice(0, 10);

      return { hospitals, error: null as string | null, searchRadiusMeters: usedRadius };
    } catch (e) {
      console.error("Overpass fetch failed", e);
      return { hospitals: [] as Hospital[], error: "Unable to query hospital directory." };
    }
  });

const RouteSchema = z.object({
  from: z.object({ lat: z.number(), lng: z.number() }),
  to: z.object({ lat: z.number(), lng: z.number() }),
});

export const getRoute = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => RouteSchema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.OPENROUTESERVICE_API_KEY;
    if (!key) return { route: null, error: "Routing service not configured." };
    try {
      const res = await fetch(
        "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
        {
          method: "POST",
          headers: {
            Authorization: key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            coordinates: [
              [data.from.lng, data.from.lat],
              [data.to.lng, data.to.lat],
            ],
            instructions: false,
          }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        console.error("ORS error", res.status, text);
        return { route: null, error: `Routing failed (${res.status}).` };
      }
      const json = (await res.json()) as any;
      const feature = json.features?.[0];
      if (!feature) return { route: null, error: "No route found." };
      const coords: [number, number][] = feature.geometry.coordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng]
      );
      const summary = feature.properties?.summary ?? {};
      return {
        route: {
          coordinates: coords,
          distanceMeters: summary.distance ?? 0,
          durationSeconds: summary.duration ?? 0,
        },
        error: null as string | null,
      };
    } catch (e) {
      console.error("ORS fetch failed", e);
      return { route: null, error: "Unable to compute route." };
    }
  });

const AltRouteSchema = z.object({
  from: z.object({ lat: z.number(), lng: z.number() }),
  to: z.object({ lat: z.number(), lng: z.number() }),
});

export type RouteOption = {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
};

export const getAlternativeRoutes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AltRouteSchema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.OPENROUTESERVICE_API_KEY;
    if (!key) return { routes: [] as RouteOption[], error: "Routing service not configured." };
    try {
      const res = await fetch(
        "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
        {
          method: "POST",
          headers: { Authorization: key, "Content-Type": "application/json" },
          body: JSON.stringify({
            coordinates: [
              [data.from.lng, data.from.lat],
              [data.to.lng, data.to.lat],
            ],
            instructions: false,
            alternative_routes: { target_count: 3, share_factor: 0.5, weight_factor: 1.8 },
          }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        console.error("ORS alt error", res.status, text);
        // Fallback: single route
        const single = await fetch(
          "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
          {
            method: "POST",
            headers: { Authorization: key, "Content-Type": "application/json" },
            body: JSON.stringify({
              coordinates: [
                [data.from.lng, data.from.lat],
                [data.to.lng, data.to.lat],
              ],
              instructions: false,
            }),
          }
        );
        if (!single.ok) return { routes: [], error: `Routing failed (${res.status}).` };
        const sj = (await single.json()) as any;
        const routes: RouteOption[] = (sj.features ?? []).map((f: any) => ({
          coordinates: f.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
          distanceMeters: f.properties?.summary?.distance ?? 0,
          durationSeconds: f.properties?.summary?.duration ?? 0,
        }));
        return { routes, error: null as string | null };
      }
      const json = (await res.json()) as any;
      const routes: RouteOption[] = (json.features ?? []).map((f: any) => ({
        coordinates: f.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]),
        distanceMeters: f.properties?.summary?.distance ?? 0,
        durationSeconds: f.properties?.summary?.duration ?? 0,
      }));
      // Sort by duration so shortest-by-time is first; cap at top 3 fastest
      routes.sort((a, b) => a.durationSeconds - b.durationSeconds);
      return { routes: routes.slice(0, 3), error: null as string | null };
    } catch (e) {
      console.error("ORS alt fetch failed", e);
      return { routes: [] as RouteOption[], error: "Unable to compute routes." };
    }
  });

const GeoSchema = z.object({ query: z.string().min(2).max(200) });

export const geocodeAddress = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GeoSchema.parse(d))
  .handler(async ({ data }) => {
    const headers = { "User-Agent": "MedRouteEmergencyApp/1.0 (contact@medroute.app)" };
    const tryFetch = async (url: string) => {
      const res = await fetch(url, { headers });
      if (!res.ok) return null;
      const json = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      return json[0] ?? null;
    };
    try {
      // Bias toward India first (handles short queries like "Andheri East", "Banjara Hills")
      const indiaUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(data.query)}`;
      let first = await tryFetch(indiaUrl);
      if (!first) {
        const globalUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(data.query)}`;
        first = await tryFetch(globalUrl);
      }
      if (!first) return { result: null, error: "Location not found. Try adding a city or state." };
      return {
        result: {
          lat: parseFloat(first.lat),
          lng: parseFloat(first.lon),
          label: first.display_name,
        },
        error: null as string | null,
      };
    } catch (e) {
      console.error("Geocode failed", e);
      return { result: null, error: "Unable to look up address." };
    }
  });

const MatrixSchema = z.object({
  from: z.object({ lat: z.number(), lng: z.number() }),
  destinations: z.array(z.object({ lat: z.number(), lng: z.number() })).min(1).max(20),
});

export const getRouteMatrix = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => MatrixSchema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.OPENROUTESERVICE_API_KEY;
    if (!key) return { results: [] as Array<{ distanceMeters: number; durationSeconds: number } | null>, error: "Routing service not configured." };
    try {
      const locations = [
        [data.from.lng, data.from.lat],
        ...data.destinations.map((d) => [d.lng, d.lat]),
      ];
      const res = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
        method: "POST",
        headers: { Authorization: key, "Content-Type": "application/json" },
        body: JSON.stringify({
          locations,
          sources: [0],
          destinations: data.destinations.map((_, i) => i + 1),
          metrics: ["distance", "duration"],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("ORS matrix error", res.status, text);
        return { results: data.destinations.map(() => null), error: `Matrix failed (${res.status}).` };
      }
      const json = (await res.json()) as { distances?: number[][]; durations?: number[][] };
      const distances = json.distances?.[0] ?? [];
      const durations = json.durations?.[0] ?? [];
      const results = data.destinations.map((_, i) => {
        const d = distances[i];
        const t = durations[i];
        if (typeof d !== "number" || typeof t !== "number") return null;
        return { distanceMeters: d, durationSeconds: t };
      });
      return { results, error: null as string | null };
    } catch (e) {
      console.error("ORS matrix fetch failed", e);
      return { results: data.destinations.map(() => null), error: "Unable to compute distances." };
    }
  });
