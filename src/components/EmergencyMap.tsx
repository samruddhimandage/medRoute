import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import type { Hospital } from "@/server/emergency.functions";

// Fix default icon paths for bundlers
const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const userIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#c9a84c;border:3px solid #0c2340;box-shadow:0 0 0 3px rgba(201,168,76,0.35)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const hospitalIcon = L.divIcon({
  className: "",
  html: `<div style="width:30px;height:30px;border-radius:6px;background:#0c2340;color:#f5f0e0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;border:2px solid #c9a84c;">+</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, points]);
  return null;
}

type Props = {
  user: { lat: number; lng: number };
  hospitals: Hospital[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  routeCoords?: [number, number][] | null;
  alternativeRoutes?: { coordinates: [number, number][]; highlighted?: boolean; label?: string }[];
};

export function EmergencyMap({
  user,
  hospitals,
  selectedId,
  onSelect,
  routeCoords,
  alternativeRoutes,
}: Props) {
  const fitPoints: [number, number][] = [
    [user.lat, user.lng],
    ...hospitals.map((h) => [h.lat, h.lng] as [number, number]),
    ...(routeCoords ?? []),
    ...(alternativeRoutes?.flatMap((r) => r.coordinates) ?? []),
  ];

  return (
    <MapContainer
      center={[user.lat, user.lng]}
      zoom={13}
      style={{ height: "100%", width: "100%", minHeight: 420 }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[user.lat, user.lng]} icon={userIcon}>
        <Popup>Your location</Popup>
      </Marker>
      {hospitals.map((h) => (
        <Marker
          key={h.id}
          position={[h.lat, h.lng]}
          icon={hospitalIcon}
          eventHandlers={{ click: () => onSelect?.(h.id) }}
        >
          <Popup>
            <div style={{ minWidth: 180 }}>
              <strong>{h.name}</strong>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {(h.distanceMeters / 1000).toFixed(1)} km away
              </div>
              {h.phone && <div style={{ fontSize: 12 }}>📞 {h.phone}</div>}
            </div>
          </Popup>
        </Marker>
      ))}
      {alternativeRoutes?.map((r, i) => (
        <Polyline
          key={i}
          positions={r.coordinates}
          pathOptions={{
            color: r.highlighted ? "#c9a84c" : "#5a7a9e",
            weight: r.highlighted ? 6 : 4,
            opacity: r.highlighted ? 0.95 : 0.55,
            dashArray: r.highlighted ? undefined : "8 6",
          }}
        />
      ))}
      {routeCoords && routeCoords.length > 1 && !alternativeRoutes && (
        <Polyline positions={routeCoords} pathOptions={{ color: "#c9a84c", weight: 5, opacity: 0.9 }} />
      )}
      <FitBounds points={fitPoints} />
    </MapContainer>
  );
}

export default EmergencyMap;
