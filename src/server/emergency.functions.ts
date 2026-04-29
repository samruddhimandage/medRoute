import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const NearbySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  keywords: z.array(z.string().min(1).max(40)).min(1).max(10),
  radiusMeters: z.number().min(1000).max(50000).default(15000),
});

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
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="hospital"](around:${data.radiusMeters},${data.lat},${data.lng});
        way["amenity"="hospital"](around:${data.radiusMeters},${data.lat},${data.lng});
        relation["amenity"="hospital"](around:${data.radiusMeters},${data.lat},${data.lng});
      );
      out center tags 50;
    `;
    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) {
        return { hospitals: [] as Hospital[], error: `Overpass error ${res.status}` };
      }
      const json = (await res.json()) as { elements: Array<any> };
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
          return {
            id: `${el.type}/${el.id}`,
            name: tags.name || tags["name:en"] || "Unnamed Hospital",
            lat,
            lng,
            distanceMeters,
            phone: tags.phone || tags["contact:phone"],
            address: [tags["addr:street"], tags["addr:city"]].filter(Boolean).join(", ") || undefined,
            emergency: tags.emergency === "yes",
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
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(data.query)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": "EmergencyResponseApp/1.0" },
      });
      if (!res.ok) return { result: null, error: `Geocoding failed (${res.status}).` };
      const json = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      const first = json[0];
      if (!first) return { result: null, error: "Location not found." };
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
