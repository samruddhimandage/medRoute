import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  MapPin,
  Locate,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Brain,
  HeartPulse,
  Droplet,
  Bone,
  Flame,
  Wind,
  Baby,
  Stethoscope,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { geocodeAddress } from "@/server/emergency.functions";
import { INJURY_TYPES, type InjuryType } from "@/lib/injuryTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { emergencyStore, useEmergencyState, type Coords } from "@/lib/emergencyStore";
import { SiteHeader } from "@/components/SiteHeader";

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

const ICON_MAP: Record<InjuryType["icon"], LucideIcon> = {
  Brain,
  HeartPulse,
  Droplet,
  Bone,
  Flame,
  Wind,
  Baby,
  Stethoscope,
  Plus,
};

function HomePage() {
  const navigate = useNavigate();
  const stored = useEmergencyState();

  const [location, setLocation] = useState<Coords | null>(stored.location);
  const [locationLabel, setLocationLabel] = useState<string>(stored.locationLabel);
  const [manualAddress, setManualAddress] = useState("");
  const [injuryId, setInjuryId] = useState<string>(stored.injury?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const injury = useMemo(() => INJURY_TYPES.find((i) => i.id === injuryId), [injuryId]);

  const detectLocation = useCallback(() => {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      const m = "Geolocation is not supported by your browser. Please enter your address manually.";
      setLocationError(m);
      toast.error(m);
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLabel("Detected current location");
        setLoading(false);
        setLocationError(null);
        toast.success("Location detected.");
      },
      (err) => {
        setLoading(false);
        const inIframe = window.self !== window.top;
        let msg = "";
        if (err.code === 1) {
          msg = inIframe
            ? "Location is blocked inside the preview. Open in a new tab, or type your city below."
            : "Permission denied. Allow access in browser settings, or enter your city below.";
        } else if (err.code === 2) {
          msg = "Position unavailable. Please type your city or address below.";
        } else if (err.code === 3) {
          msg = "Location request timed out. Please type your city or address below.";
        } else {
          msg = err.message || "Could not detect location. Please enter your address manually.";
        }
        setLocationError(msg);
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const submitManualAddress = useCallback(
    async (override?: string) => {
      const q = (override ?? manualAddress).trim();
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
        setLocationError(null);
        toast.success("Location set.");
      } catch (e) {
        console.error("geocode failed", e);
        toast.error("Geocoding service unreachable. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [manualAddress]
  );

  const handleSearch = useCallback(() => {
    if (!location) return toast.error("Please set your location first.");
    if (!injury) return toast.error("Please select the type of emergency.");
    emergencyStore.set({
      location,
      locationLabel,
      injury,
      hospitals: null,
      etas: {},
      selectedHospital: null,
    });
    navigate({ to: "/hospitals" });
  }, [location, locationLabel, injury, navigate]);

  const ready = !!location && !!injury;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <SiteHeader step={1} stepLabel="Triage" />

      {/* Hero */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 pt-12 pb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/60 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[--gold]" />
            Step 1 of 3
          </div>
          <h1 className="mt-5 text-3xl md:text-4xl font-semibold tracking-tight max-w-2xl">
            Get to the right hospital, fast.
          </h1>
          <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">
            Set your location and the type of emergency. We'll match you with
            the nearest qualified hospital and the fastest ambulance route.
          </p>
          <div className="gold-rule mt-6" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10 space-y-8">
        {/* Step 1 — Location */}
        <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center">
              1
            </div>
            <h2 className="text-xl font-semibold">Your location</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <Button
                onClick={detectLocation}
                disabled={loading}
                size="lg"
                className="w-full h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
              >
                <Locate className="h-4 w-4" />
                {loading ? "Detecting…" : "Detect my location"}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground text-center">
                Uses your device GPS · permission required
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="addr" className="text-xs uppercase tracking-wider text-muted-foreground">
                Or enter manually
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="addr"
                    placeholder="City, address or landmark"
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitManualAddress()}
                    className="h-12 pl-9"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => submitManualAddress()}
                  disabled={loading}
                  variant="outline"
                  size="lg"
                  className="h-12"
                >
                  Set
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {["Mumbai", "Delhi", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune"].map(
                  (c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setManualAddress(c);
                        submitManualAddress(c);
                      }}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-card hover:bg-accent hover:border-accent transition"
                    >
                      {c}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          {locationError && !location && (
            <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm flex gap-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-destructive">Location unavailable</div>
                <p className="text-muted-foreground mt-0.5">{locationError}</p>
              </div>
            </div>
          )}

          {location && (
            <div className="mt-5 rounded-lg border border-[--gold]/30 bg-accent/40 p-4 text-sm flex gap-3">
              <CheckCircle2 className="h-4 w-4 text-[--gold] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Location confirmed
                </div>
                <div className="font-medium truncate">{locationLabel}</div>
                <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                  {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Step 2 — Emergency */}
        <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] p-6 md:p-8">
          <div className="flex items-center gap-3 mb-5">
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center">
              2
            </div>
            <h2 className="text-xl font-semibold">Nature of emergency</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {INJURY_TYPES.map((t) => {
              const Icon = ICON_MAP[t.icon];
              const active = t.id === injuryId;
              const critical = t.severity === "critical";
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setInjuryId(t.id)}
                  className={`group relative text-left rounded-xl border p-4 transition-all ${
                    active
                      ? "border-primary bg-primary/[0.04] ring-2 ring-primary/30 shadow-sm"
                      : "border-border bg-card hover:border-primary/40 hover:shadow-sm"
                  }`}
                >
                  {critical && (
                    <span className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-destructive">
                      <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                      Critical
                    </span>
                  )}
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 transition ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : critical
                          ? "bg-destructive/10 text-destructive"
                          : "bg-accent text-accent-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="font-semibold text-sm leading-tight">{t.label}</div>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">
                    {t.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* CTA bar */}
        <div className="sticky bottom-4 z-20">
          <div className="rounded-2xl border border-border bg-card/95 backdrop-blur shadow-[var(--shadow-elevated)] p-4 md:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm">
              <div className={`h-2 w-2 rounded-full ${ready ? "bg-[--gold]" : "bg-muted-foreground/30"}`} />
              <div>
                <div className="font-medium">
                  {ready ? "Ready to find care" : "Complete both steps to continue"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {location ? "✓ Location" : "○ Location"} · {injury ? `✓ ${injury.label}` : "○ Emergency type"}
                </div>
              </div>
            </div>
            <Button
              onClick={handleSearch}
              disabled={loading || !ready}
              size="lg"
              className="w-full sm:w-auto h-12 px-8 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold disabled:opacity-50"
            >
              {loading ? "Please wait…" : "Find care now"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
