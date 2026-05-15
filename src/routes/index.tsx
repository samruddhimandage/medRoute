import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Phone,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Zap,
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
import { VoiceInput } from "@/components/VoiceInput";
import { SymptomAI } from "@/components/SymptomAI";
import type { SymptomAnalysis } from "@/lib/symptom.functions";
import { useT, translateInjury, useLang } from "@/lib/i18n";

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
  Brain, HeartPulse, Droplet, Bone, Flame, Wind, Baby, Stethoscope, Plus,
};

// Top 3 most common life-threatening emergencies — surfaced first.
const PRIORITY_IDS = ["cardiac", "bleeding", "respiratory"];

function HomePage() {
  const navigate = useNavigate();
  const stored = useEmergencyState();
  const t = useT();
  const lang = useLang();

  const [location, setLocation] = useState<Coords | null>(stored.location);
  const [locationLabel, setLocationLabel] = useState<string>(stored.locationLabel);
  const [manualAddress, setManualAddress] = useState("");
  const [injuryId, setInjuryId] = useState<string>(stored.injury?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [emergencyMode, setEmergencyMode] = useState<boolean>(stored.emergencyMode);
  const autoTried = useRef(false);

  const injury = useMemo(() => INJURY_TYPES.find((i) => i.id === injuryId), [injuryId]);

  const detectLocation = useCallback((silent = false) => {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      const m = "Geolocation is not supported. Please enter your address manually.";
      setLocationError(m);
      if (!silent) toast.error(m);
      setAutoDetecting(false);
      return;
    }
    if (silent) setAutoDetecting(true);
    else setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLabel("Detected current location");
        setLoading(false);
        setAutoDetecting(false);
        setLocationError(null);
        if (!silent) toast.success("Location detected.");
      },
      (err) => {
        setLoading(false);
        setAutoDetecting(false);
        const inIframe = typeof window !== "undefined" && window.self !== window.top;
        let msg = "";
        if (err.code === 1) {
          msg = inIframe
            ? "Location is blocked inside the preview. Open in a new tab, or type your city below."
            : "Permission denied. Allow access, or enter your city below.";
        } else if (err.code === 2) msg = "Position unavailable. Please type your city below.";
        else if (err.code === 3) msg = "Location request timed out. Please type your city below.";
        else msg = err.message || "Could not detect location.";
        setLocationError(msg);
        if (!silent) toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // Auto-detect on mount (silent — no toast spam if blocked)
  useEffect(() => {
    if (autoTried.current) return;
    autoTried.current = true;
    if (!location) detectLocation(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitManualAddress = useCallback(
    async (override?: string) => {
      const q = (override ?? manualAddress).trim();
      if (q.length < 2) return toast.error("Enter a city, address or landmark.");
      setLoading(true);
      try {
        const res = await geocodeAddress({ data: { query: q } });
        if (res.error || !res.result) return toast.error(res.error || "Could not find that location.");
        setLocation({ lat: res.result.lat, lng: res.result.lng });
        setLocationLabel(res.result.label);
        setLocationError(null);
        toast.success("Location set.");
      } catch (e) {
        console.error(e);
        toast.error("Geocoding service unreachable.");
      } finally {
        setLoading(false);
      }
    },
    [manualAddress]
  );

  const handleSearch = useCallback(
    (overrideInjuryId?: string) => {
      const finalInjury = overrideInjuryId
        ? INJURY_TYPES.find((i) => i.id === overrideInjuryId) ?? null
        : injury;
      if (!location) return toast.error("Please set your location first.");
      if (!finalInjury) return toast.error("Please tell us the type of emergency, or tap 'I don't know'.");
      emergencyStore.set({
        location,
        locationLabel,
        injury: finalInjury,
        hospitals: null,
        etas: {},
        selectedHospital: null,
        emergencyMode,
      });
      navigate({ to: "/hospitals" });
    },
    [location, locationLabel, injury, emergencyMode, navigate]
  );

  const handleNotSure = useCallback(() => {
    setInjuryId("general");
    handleSearch("general");
  }, [handleSearch]);

  const handleAIResult = useCallback(
    (r: SymptomAnalysis) => {
      setInjuryId(r.injuryId);
      if (r.emergency_mode) setEmergencyMode(true);
      const localLabel =
        translateInjury(r.injuryId, lang) ??
        INJURY_TYPES.find((i) => i.id === r.injuryId)?.label ??
        r.injuryId;
      toast.success(`${r.detected_issue} → ${localLabel}`);
      if (location) {
        // Auto-route immediately — zero clicks
        setTimeout(() => handleSearch(r.injuryId), 350);
      } else {
        toast.message("Set your location to continue.");
      }
    },
    [handleSearch, lang, location]
  );

  const ready = !!location && !!injury;

  // Auto-advance to Step 2 the moment an emergency type is picked manually
  const pickInjury = useCallback(
    (id: string) => {
      setInjuryId(id);
      if (location) {
        setTimeout(() => handleSearch(id), 200);
      } else {
        toast.message("Set your location to continue.");
      }
    },
    [handleSearch, location]
  );

  const priority = INJURY_TYPES.filter((i) => PRIORITY_IDS.includes(i.id))
    .sort((a, b) => PRIORITY_IDS.indexOf(a.id) - PRIORITY_IDS.indexOf(b.id));
  const rest = INJURY_TYPES.filter((i) => !PRIORITY_IDS.includes(i.id));

  return (
    <div className="min-h-screen bg-background text-foreground pb-10">
      <Toaster richColors position="top-center" />
      <SiteHeader step={1} stepLabel={t("step_triage")} />

      {/* Reassurance hero */}
      <section className="border-b border-border bg-gradient-to-b from-accent/30 to-transparent">
        <div className="mx-auto max-w-6xl px-6 pt-10 pb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {t("step_of")}
          </div>
          <h1 className="mt-5 text-3xl md:text-4xl font-semibold tracking-tight max-w-2xl">
            {t("hero_title")}
          </h1>
          <p className="mt-3 max-w-xl text-[15px] text-muted-foreground">
            {t("reassure_hero")}
          </p>
          <div className="gold-rule mt-6" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 md:px-6 py-8 space-y-6">
        {/* Step 1 — Location (collapsed when set) */}
        <div className={`rounded-2xl border bg-card shadow-[var(--shadow-card)] p-5 md:p-6 transition ${
          location ? "border-emerald-500/30" : "border-border"
        }`}>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`h-8 w-8 rounded-full text-sm font-semibold flex items-center justify-center ${
                location ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"
              }`}>
                {location ? <CheckCircle2 className="h-4 w-4" /> : "1"}
              </div>
              <h2 className="text-lg md:text-xl font-semibold">{t("your_location")}</h2>
            </div>
            {location && (
              <div className="text-xs text-muted-foreground truncate max-w-[260px]">
                {locationLabel}
              </div>
            )}
          </div>

          {!location && (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Button
                  onClick={() => detectLocation(false)}
                  disabled={loading || autoDetecting}
                  size="lg"
                  className="w-full h-14 text-base bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                >
                  <Locate className="h-5 w-5" />
                  {autoDetecting || loading ? t("detecting") : t("detect_location")}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground text-center">{t("detect_hint")}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="addr" className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("enter_manually")}
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="addr"
                      placeholder={t("addr_placeholder")}
                      value={manualAddress}
                      onChange={(e) => setManualAddress(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submitManualAddress()}
                      className="h-14 pl-9 text-base"
                    />
                  </div>
                  <Button type="button" onClick={() => submitManualAddress()} disabled={loading} variant="outline" size="lg" className="h-14">
                    {t("set")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {location && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground font-mono text-xs">
                {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
              </span>
              <button
                onClick={() => { setLocation(null); setLocationLabel(""); }}
                className="ml-auto text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Change
              </button>
            </div>
          )}

          {locationError && !location && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm flex gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-muted-foreground">{locationError}</div>
            </div>
          )}
        </div>

        {/* AI Symptom Understanding — primary path */}
        <SymptomAI onResult={handleAIResult} />

        {/* Step 2 — Triage (manual fallback) */}
        <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] p-5 md:p-6">
          <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
            <div className="flex items-center gap-3">
              <div className={`h-8 w-8 rounded-full text-sm font-semibold flex items-center justify-center ${
                injury ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"
              }`}>
                {injury ? <CheckCircle2 className="h-4 w-4" /> : "2"}
              </div>
              <h2 className="text-lg md:text-xl font-semibold">{t("nature")}</h2>
            </div>
          </div>
          <p className="text-sm text-muted-foreground ml-11 mb-4">{t("speak_instead")}</p>

          {/* Voice — primary input */}
          <div className="ml-11 mb-5">
            <VoiceInput onMatch={(id) => setInjuryId(id)} />
          </div>

          {/* Top 3 + I don't know */}
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 ml-11">
            {t("common_emergencies")}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {priority.map((tp) => {
              const Icon = ICON_MAP[tp.icon];
              const active = tp.id === injuryId;
              const localLabel = translateInjury(tp.id, lang) ?? tp.label;
              return (
                <button
                  key={tp.id}
                  type="button"
                  onClick={() => pickInjury(tp.id)}
                  className={`relative text-left rounded-xl border-2 p-4 transition-all active:scale-[0.98] min-h-[112px] ${
                    active
                      ? "border-primary bg-primary/[0.05] ring-2 ring-primary/30"
                      : "border-border bg-card hover:border-destructive/40 hover:shadow-md"
                  }`}
                >
                  <div className={`h-11 w-11 rounded-lg flex items-center justify-center mb-3 ${
                    active ? "bg-primary text-primary-foreground" : "bg-destructive/10 text-destructive"
                  }`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="font-semibold text-base leading-tight">{localLabel}</div>
                </button>
              );
            })}

            {/* "I don't know" — instant escape hatch */}
            <button
              type="button"
              onClick={handleNotSure}
              disabled={!location}
              className="relative text-left rounded-xl border-2 border-dashed border-primary/40 bg-accent/40 p-4 transition-all hover:bg-accent active:scale-[0.98] min-h-[112px] disabled:opacity-50"
            >
              <div className="h-11 w-11 rounded-lg flex items-center justify-center mb-3 bg-primary text-primary-foreground">
                <HelpCircle className="h-6 w-6" />
              </div>
              <div className="font-semibold text-base leading-tight">{t("not_sure")}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{t("not_sure_sub")}</div>
            </button>
          </div>

          {/* Show more */}
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-5 inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
          >
            {showAll ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {showAll ? t("show_less") : t("more_emergencies")}
          </button>

          {showAll && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {rest.map((tp) => {
                const Icon = ICON_MAP[tp.icon];
                const active = tp.id === injuryId;
                const localLabel = translateInjury(tp.id, lang) ?? tp.label;
                return (
                  <button
                    key={tp.id}
                    type="button"
                    onClick={() => pickInjury(tp.id)}
                    className={`text-left rounded-lg border p-3 transition active:scale-[0.98] ${
                      active
                        ? "border-primary bg-primary/[0.04] ring-1 ring-primary/30"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`h-8 w-8 rounded-md flex items-center justify-center ${
                        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="font-medium text-sm leading-tight">{localLabel}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
