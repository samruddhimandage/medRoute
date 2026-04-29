import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { geocodeAddress } from "@/server/emergency.functions";
import { INJURY_TYPES } from "@/lib/injuryTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { emergencyStore, useEmergencyState, type Coords } from "@/lib/emergencyStore";

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
            ? "Location is blocked inside the preview. Open this app in a new browser tab, or simply type your city below (e.g. “Mumbai”, “Delhi”, “Andheri East”)."
            : "Location permission was denied. Allow access in your browser settings, or enter your city/address below.";
        } else if (err.code === 2) {
          msg = "Your device couldn’t determine your position. Please type your city or address below.";
        } else if (err.code === 3) {
          msg = "Locating timed out. Please type your city or address below.";
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-center" />

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

      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          <p className="text-xs uppercase tracking-[0.2em] text-secondary mb-4">
            Step 1 of 3 · Triage
          </p>
          <h1 className="font-display text-4xl md:text-5xl leading-tight max-w-3xl">
            The nearest qualified care, on the fastest possible route.
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Provide your location and the nature of the emergency. We'll then suggest matched
            hospitals and the fastest ambulance route.
          </p>
          <div className="gold-rule mt-8 max-w-md" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-6 md:grid-cols-2">
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
                <Label htmlFor="addr">City, address or landmark (India supported)</Label>
                <div className="flex gap-2">
                  <Input
                    id="addr"
                    placeholder="e.g. Andheri East, Mumbai or Connaught Place, Delhi"
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitManualAddress()}
                  />
                  <Button
                    type="button"
                    onClick={() => submitManualAddress()}
                    disabled={loading}
                    variant="outline"
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
                        className="text-[11px] px-2 py-1 rounded-full border border-border hover:bg-accent"
                      >
                        {c}
                      </button>
                    )
                  )}
                </div>
              </div>
              {locationError && !location && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                  <div className="text-xs uppercase tracking-wider text-destructive font-semibold mb-1">
                    Location unavailable
                  </div>
                  <p className="text-foreground/90">{locationError}</p>
                </div>
              )}
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
                            active
                              ? "bg-gold text-gold-foreground"
                              : "bg-destructive text-destructive-foreground"
                          }`}
                        >
                          Critical
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs mt-1 ${active ? "opacity-80" : "text-muted-foreground"}`}
                    >
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
              We'll suggest the nearest hospitals matched to your emergency on the next page.
            </p>
          </div>
          <Button
            onClick={handleSearch}
            disabled={loading || !location || !injury}
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-8 py-6 text-base"
          >
            {loading ? "Please wait…" : "Find care now →"}
          </Button>
        </div>
      </section>
    </div>
  );
}
