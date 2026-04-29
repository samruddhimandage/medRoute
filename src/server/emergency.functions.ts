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

      const hospitals: Hospital[] = json.elements
        .map((el) => {
          const lat = el.lat ?? el.center?.lat;
          const lng = el.lon ?? el.center?.lon;
          if (typeof lat !== "number" || typeof lng !== "number") return null;
          const tags = el.tags ?? {};
          const blob = JSON.stringify(tags).toLowerCase();
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
            name: tags.name || tags["name:en"] || tags["operator"] || "Unnamed Hospital",
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
          // prioritize keyword match, then emergency flag, then distance
          const score = (h: Hospital) =>
            h.matchedKeywords.length * 5000 + (h.emergency ? 3000 : 0) - h.distanceMeters / 100;
          return score(b) - score(a);
        })
        .slice(0, 8);

      return { hospitals, error: null as string | null };
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
