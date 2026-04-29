import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState, lazy, Suspense } from "react";
import {
  findNearbyHospitals,
  geocodeAddress,
  getRoute,
  getRouteMatrix,
  type Hospital,
} from "@/server/emergency.functions";
import { INJURY_TYPES } from "@/lib/injuryTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

const EmergencyMap = lazy(() => import("@/components/EmergencyMap"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MedRoute — Emergency Hospital & Ambulance Routing" },
      {
        name: "description",
        content:
          "Find the nearest hospital matched to your medical emergency and get the fastest ambulance route, instantly.",
      },
      { property: "og:title", content: "MedRoute — Emergency Routing" },
      {
        property: "og:description",
        content: "Locate emergency-ready hospitals and the fastest ambulance route in seconds.",
      },
    ],
  }),
  component: HomePage,
});

type Coords = { lat: number; lng: number };

function formatKm(m: number) {
  return (m / 1000).toFixed(1) + " km";
}
function formatMin(s: number) {
  const min = Math.round(s / 60);
  return min < 1 ? "< 1 min" : `${min} min`;
}

function HomePage() {
  const [location, setLocation] = useState<Coords | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>("");
  const [manualAddress, setManualAddress] = useState("");
  const [injuryId, setInjuryId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [hospitals, setHospitals] = useState<Hospital[] | null>(null);
  const [selectedHospital, setSelectedHospital] = useState<Hospital | null>(null);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [routeMeta, setRouteMeta] = useState<{ distance: number; duration: number } | null>(null);

  const injury = useMemo(() => INJURY_TYPES.find((i) => i.id === injuryId), [injuryId]);

  const detectLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation not supported by your browser.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLabel("Detected current location");
        setLoading(false);
        toast.success("Location detected.");
      },
      (err) => {
        setLoading(false);
        const inIframe = window.self !== window.top;
        if (err.code === 1) {
          toast.error(
            inIframe
              ? "Location is blocked in the preview iframe. Open the app in a new tab, or enter your address manually below."
              : "Location permission denied. Allow access or enter your address manually."
          );
        } else if (err.code === 2) {
          toast.error("Location unavailable. Please enter your address manually.");
        } else if (err.code === 3) {
          toast.error("Location request timed out. Please enter your address manually.");
        } else {
          toast.error(err.message || "Could not detect location.");
        }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  const submitManualAddress = useCallback(async () => {
    const q = manualAddress.trim();
    if (q.length < 2) {
      toast.error("Enter a city, address or landmark.");
      return;
    }
    setLoading(true);
    try {
      const res = await geocodeAddress({ data: { query: q } });
      if (res.error || !res.result) {
        toast.error(res.error || "Could not find that location.");
        return;
      }
      setLocation({ lat: res.result.lat, lng: res.result.lng });
      setLocationLabel(res.result.label);
      toast.success("Location set.");
    } catch (e) {
      console.error("geocode failed", e);
      toast.error("Geocoding service unreachable. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [manualAddress]);

  const selectHospital = useCallback(
    async (h: Hospital) => {
      if (!location) return;
      setSelectedHospital(h);
      setRouteCoords(null);
      setRouteMeta(null);
      try {
        const res = await getRoute({
          data: { from: location, to: { lat: h.lat, lng: h.lng } },
        });
        if (res.error || !res.route) {
          toast.error(res.error || "Could not compute route.");
          return;
        }
        setRouteCoords(res.route.coordinates);
        setRouteMeta({ distance: res.route.distanceMeters, duration: res.route.durationSeconds });
      } catch (e) {
        console.error("route failed", e);
        toast.error("Routing service unreachable.");
      }
    },
    [location]
  );

  const handleSearch = useCallback(async () => {
    if (!location) return toast.error("Please set your location first.");
    if (!injury) return toast.error("Please select the type of emergency.");
    setLoading(true);
    setHospitals(null);
    setSelectedHospital(null);
    setRouteCoords(null);
    setRouteMeta(null);
    try {
      const res = await findNearbyHospitals({
        data: {
          lat: location.lat,
          lng: location.lng,
          keywords: injury.facilityKeywords,
          radiusMeters: 15000,
        },
      });
      if (res.error) toast.error(res.error);
      if (res.hospitals.length === 0) {
        toast.error("No hospitals found within 15 km.");
        return;
      }
      setHospitals(res.hospitals);
      void selectHospital(res.hospitals[0]);
    } catch (e) {
      console.error("find hospitals failed", e);
      toast.error("Could not load hospitals. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [location, injury, selectHospital]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-center" />

      {/* Header */}
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-gold text-gold-foreground flex items-center justify-center font-display text-xl font-semibold">
              M
            </div>
            <div>
              <div className="font-display text-xl leading-none">MedRoute</div>
              <div className="text-xs opacity-70 tracking-wide uppercase">
                Emergency Response System
              </div>
            </div>
          </div>
          <a
            href="tel:112"
            className="hidden sm:inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 transition"
          >
            Call 112 / 911
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          <p className="text-xs uppercase tracking-[0.2em] text-secondary mb-4">
            Triage · Locate · Route
          </p>
          <h1 className="font-display text-4xl md:text-5xl leading-tight max-w-3xl">
            The nearest qualified care, on the fastest possible route.
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Provide your location and the nature of the emergency. MedRoute identifies
            specialty-matched hospitals nearby and computes the fastest ambulance route in real
            time.
          </p>
          <div className="gold-rule mt-8 max-w-md" />
        </div>
      </section>

      {/* Form */}
      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Step 1 — Location */}
          <Card className="p-6 shadow-soft">
            <div className="flex items-center gap-3 mb-4">
              <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">
                1
              </span>
              <h2 className="font-display text-2xl">Your location</h2>
            </div>
            <div className="space-y-4">
              <Button
                onClick={detectLocation}
                disabled={loading}
                className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
              >
                Detect my current location
              </Button>
              <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
                <span className="flex-1 h-px bg-border" />
                or enter manually
                <span className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr">Address, city or landmark</Label>
                <div className="flex gap-2">
                  <Input
                    id="addr"
                    placeholder="e.g. 221B Baker Street, London"
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitManualAddress()}
                  />
                  <Button type="button" onClick={submitManualAddress} disabled={loading} variant="outline">
                    Set
                  </Button>
                </div>
              </div>
              {location && (
                <div className="rounded-md border border-border bg-accent p-3 text-sm">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Confirmed location
                  </div>
                  <div className="text-foreground line-clamp-2">{locationLabel}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Step 2 — Injury */}
          <Card className="p-6 shadow-soft">
            <div className="flex items-center gap-3 mb-4">
              <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">
                2
              </span>
              <h2 className="font-display text-2xl">Nature of emergency</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {INJURY_TYPES.map((t) => {
                const active = t.id === injuryId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setInjuryId(t.id)}
                    className={`text-left rounded-md border p-3 transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:border-secondary"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{t.label}</span>
                      {t.severity === "critical" && (
                        <span
                          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            active ? "bg-gold text-gold-foreground" : "bg-destructive text-destructive-foreground"
                          }`}
                        >
                          Critical
                        </span>
                      )}
                    </div>
                    <p className={`text-xs mt-1 ${active ? "opacity-80" : "text-muted-foreground"}`}>
                      {t.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-md border border-border bg-card p-5">
          <div>
            <div className="font-display text-xl">Find care now</div>
            <p className="text-sm text-muted-foreground">
              We will match specialty-equipped hospitals within 15 km and route the fastest path.
            </p>
          </div>
          <Button
            onClick={handleSearch}
            disabled={loading || !location || !injury}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-6 text-base"
          >
            {loading ? "Searching…" : "Locate hospital & ambulance route"}
          </Button>
        </div>
      </section>

      {/* Results */}
      {hospitals && location && (
        <section className="mx-auto max-w-6xl px-6 pb-16">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.2em] text-secondary">Recommended care</p>
            <h2 className="font-display text-3xl mt-1">Matched hospitals & live route</h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {hospitals.map((h, i) => {
                const active = selectedHospital?.id === h.id;
                return (
                  <button
                    key={h.id}
                    onClick={() => selectHospital(h)}
                    className={`w-full text-left rounded-md border p-4 transition ${
                      active
                        ? "border-gold bg-card shadow-elevated"
                        : "border-border bg-card hover:border-secondary"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          #{i + 1} · {formatKm(h.distanceMeters)} away
                        </div>
                        <div className="font-display text-lg leading-tight mt-0.5">{h.name}</div>
                        {h.address && (
                          <div className="text-xs text-muted-foreground mt-1">{h.address}</div>
                        )}
                      </div>
                      {h.matchedKeywords.length > 0 && (
                        <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-gold text-gold-foreground whitespace-nowrap">
                          Specialty match
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      {h.emergency && (
                        <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground">
                          ER available
                        </span>
                      )}
                      {h.phone && (
                        <a
                          href={`tel:${h.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-0.5 rounded border border-border hover:bg-accent"
                        >
                          📞 {h.phone}
                        </a>
                      )}
                      {active && routeMeta && (
                        <span className="ml-auto font-medium text-foreground">
                          ETA {formatMin(routeMeta.duration)} · {formatKm(routeMeta.distance)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-lg border border-border overflow-hidden bg-card shadow-soft">
              <Suspense
                fallback={
                  <div className="h-[520px] flex items-center justify-center text-muted-foreground">
                    Loading map…
                  </div>
                }
              >
                <EmergencyMap
                  user={location}
                  hospitals={hospitals}
                  selectedId={selectedHospital?.id}
                  onSelect={(id) => {
                    const h = hospitals.find((x) => x.id === id);
                    if (h) selectHospital(h);
                  }}
                  routeCoords={routeCoords}
                />
              </Suspense>
              {selectedHospital && routeMeta && (
                <div className="border-t border-border p-4 flex flex-wrap items-center justify-between gap-3 bg-accent">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      Fastest ambulance route
                    </div>
                    <div className="font-display text-lg">{selectedHospital.name}</div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Distance</div>
                      <div className="font-medium">{formatKm(routeMeta.distance)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">ETA</div>
                      <div className="font-medium">{formatMin(routeMeta.duration)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm flex flex-col sm:flex-row justify-between gap-3 opacity-90">
          <div>© {new Date().getFullYear()} MedRoute · For informational use. In a life-threatening emergency, call your local emergency number.</div>
          <div className="opacity-70">
            Map data © OpenStreetMap · Routing by OpenRouteService
          </div>
        </div>
      </footer>
    </div>
  );
}
