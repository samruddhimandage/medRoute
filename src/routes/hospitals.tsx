import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  ArrowLeft,
  RefreshCw,
  ArrowRight,
  Phone,
  Clock,
  Navigation,
  Loader2,
  MapPin,
  Sparkles,
  Ambulance,
  WifiOff,
} from "lucide-react";
import { findNearbyHospitals, getRouteMatrix, type Hospital } from "@/server/emergency.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { emergencyStore, useEmergencyState } from "@/lib/emergencyStore";
import { SiteHeader } from "@/components/SiteHeader";
import { useT } from "@/lib/i18n";
import { useOnline } from "@/hooks/useOnline";
import { saveHospitalCache, loadHospitalCache } from "@/lib/hospitalCache";
import { withTraffic, ambulanceEta, trafficFactor } from "@/lib/traffic";

const EmergencyMap = lazy(() => import("@/components/EmergencyMap"));

export const Route = createFileRoute("/hospitals")({
  head: () => ({
    meta: [
      { title: "Suggested Hospitals — MedRoute" },
      {
        name: "description",
        content: "Specialty-matched hospitals near you, sorted by driving time.",
      },
    ],
  }),
  component: HospitalsPage,
});

function formatKm(m: number) {
  return (m / 1000).toFixed(1) + " km";
}
function formatMin(s: number) {
  const min = Math.round(s / 60);
  return min < 1 ? "< 1" : `${min}`;
}

function HospitalsPage() {
  const state = useEmergencyState();
  const navigate = useNavigate();
  const t = useT();
  const online = useOnline();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usingCache, setUsingCache] = useState(false);
  const [tick, setTick] = useState(0); // re-render every few seconds for live ETA
  const lastRefresh = useRef<number>(Date.now());

  useEffect(() => {
    if (!state.location || !state.injury) {
      navigate({ to: "/" });
      return;
    }
    if (state.hospitals && state.hospitals.length > 0) return;
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live ETA tick — re-renders ETA every 5 seconds with new traffic factor
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const runSearch = async () => {
    if (!state.location || !state.injury) return;
    setLoading(true);
    setErrorMsg(null);
    setUsingCache(false);

    // If offline, try cache first
    if (!online) {
      const cached = loadHospitalCache(state.location, state.injury.id);
      if (cached && cached.length) {
        emergencyStore.set({ hospitals: cached, etas: {} });
        setUsingCache(true);
        setErrorMsg(null);
        setLoading(false);
        return;
      }
      setErrorMsg(t("offline_banner"));
      setLoading(false);
      return;
    }

    try {
      const res = await findNearbyHospitals({
        data: {
          lat: state.location.lat,
          lng: state.location.lng,
          keywords: state.injury.facilityKeywords,
          radiusMeters: 50000,
        },
      });
      if (res.error) setErrorMsg(res.error);
      if (!res.hospitals || res.hospitals.length === 0) {
        // Try cache as last resort
        const cached = loadHospitalCache(state.location, state.injury.id);
        if (cached && cached.length) {
          emergencyStore.set({ hospitals: cached, etas: {} });
          setUsingCache(true);
        } else {
          setErrorMsg("No hospitals found nearby. Please try a different location.");
          emergencyStore.set({ hospitals: [], etas: {} });
        }
        return;
      }
      emergencyStore.set({ hospitals: res.hospitals, etas: {} });
      saveHospitalCache({
        location: state.location,
        injuryId: state.injury.id,
        hospitals: res.hospitals,
      });

      try {
        const mx = await getRouteMatrix({
          data: {
            from: state.location,
            destinations: res.hospitals.map((h) => ({ lat: h.lat, lng: h.lng })),
          },
        });
        if (!mx.error) {
          const map: Record<string, { distance: number; duration: number } | null> = {};
          res.hospitals.forEach((h, i) => {
            const r = mx.results[i];
            map[h.id] = r ? { distance: r.distanceMeters, duration: r.durationSeconds } : null;
          });
          emergencyStore.set({ etas: map });
          lastRefresh.current = Date.now();
        }
      } catch (e) {
        console.error("matrix failed", e);
      }
    } catch (e) {
      console.error("find hospitals failed", e);
      const cached = loadHospitalCache(state.location, state.injury.id);
      if (cached && cached.length) {
        emergencyStore.set({ hospitals: cached, etas: {} });
        setUsingCache(true);
      } else {
        setErrorMsg("Could not load hospitals. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const choose = (h: Hospital) => {
    emergencyStore.set({ selectedHospital: h });
    navigate({ to: "/route/$hospitalId", params: { hospitalId: encodeURIComponent(h.id) } });
  };

  if (!state.location || !state.injury) return null;

  // Use traffic-adjusted duration for sorting & display
  const factor = trafficFactor();
  const hospitals = [...(state.hospitals ?? [])].sort((a, b) => {
    const ea = state.etas[a.id]?.duration;
    const eb = state.etas[b.id]?.duration;
    if (ea != null && eb != null) return ea - eb;
    if (ea != null) return -1;
    if (eb != null) return 1;
    return a.distanceMeters - b.distanceMeters;
  });

  void tick; // referenced to force re-render via dependency

  // Emergency Mode auto-route to fastest once ETAs are in
  const autoRoutedRef = useRef(false);
  useEffect(() => {
    if (autoRoutedRef.current) return;
    if (!state.emergencyMode) return;
    if (!hospitals.length) return;
    const top = hospitals[0];
    if (state.etas[top.id] == null) return;
    autoRoutedRef.current = true;
    toast.success(t("auto_routing"));
    const id = setTimeout(() => choose(top), 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospitals.length, state.etas, state.emergencyMode]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <SiteHeader step={2} stepLabel={t("step_hospitals")} />

      <section className="mx-auto max-w-6xl px-6 py-8">
        {hospitals.length > 0 && (
          <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 text-sm flex items-start gap-3">
            <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div className="text-foreground">{t("reassure_hospitals")}</div>
          </div>
        )}

        {/* Title bar */}
        <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 font-semibold uppercase tracking-wider text-[10px]">
                {state.injury.label}
              </span>
              <MapPin className="h-3 w-3" />
              <span className="truncate max-w-[260px]">{state.locationLabel}</span>
              {usingCache && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 font-semibold uppercase tracking-wider text-[10px]">
                  <WifiOff className="h-2.5 w-2.5" /> {t("offline_short")}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 font-semibold uppercase tracking-wider text-[10px]">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                {t("live")}
              </span>
              {state.emergencyMode && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive text-destructive-foreground px-2 py-0.5 font-bold uppercase tracking-wider text-[10px]">
                  ⚡ {t("emergency_mode")}
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              {t("recommended_hospitals")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t("sorted_by")}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/" })}>
              <ArrowLeft className="h-3.5 w-3.5" /> {t("back")}
            </Button>
            <Button variant="outline" size="sm" onClick={runSearch} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? t("refreshing") : t("refresh")}
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
            {errorMsg}
          </div>
        )}

        {loading && !hospitals.length && (
          <div className="flex flex-col items-center justify-center text-muted-foreground py-20">
            <Loader2 className="h-6 w-6 animate-spin mb-3 text-primary" />
            <div className="text-sm">{t("locating")}</div>
          </div>
        )}

        {hospitals.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            {/* List */}
            <div className="space-y-3 max-h-[640px] overflow-y-auto pr-1 -mr-1">
              {hospitals.map((h, i) => {
                const eta = state.etas[h.id];
                const isFastest = i === 0;
                const matched = h.matchedKeywords.length > 0;
                const liveCar = eta ? withTraffic(eta.duration) : null;
                const liveAmb = eta ? ambulanceEta(eta.duration) : null;
                return (
                  <div
                    key={h.id}
                    className={`w-full text-left rounded-xl border bg-card transition-all ${
                      isFastest
                        ? "border-destructive/50 ring-2 ring-destructive/30 shadow-[var(--shadow-elevated)]"
                        : "border-border hover:shadow-[var(--shadow-soft)] hover:border-primary/40"
                    }`}
                  >
                    {isFastest && (
                      <div className="px-4 pt-3 pb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-destructive">
                        <Sparkles className="h-3.5 w-3.5" />
                        {t("primary_pick")}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => choose(h)}
                      className="w-full text-left p-4 pt-2"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`shrink-0 h-10 w-10 rounded-lg flex flex-col items-center justify-center font-bold text-sm ${
                            isFastest
                              ? "bg-destructive text-destructive-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          #{i + 1}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-[15px] leading-tight truncate">
                              {h.name}
                            </h3>
                            {isFastest && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground">
                                {t("fastest_now")}
                              </span>
                            )}
                            {matched && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                                {t("match")}
                              </span>
                            )}
                          </div>
                          {h.address && (
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {h.address}
                            </div>
                          )}
                          {isFastest && (
                            <p className="text-xs text-muted-foreground mt-1.5">{t("why_picked")}</p>
                          )}
                        </div>
                      </div>

                      {/* Live ETAs */}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-lg bg-muted/50 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> 🚗 {t("car_eta")}
                          </div>
                          <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-lg font-bold text-foreground">
                              {liveCar != null ? formatMin(liveCar) : "—"}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{t("min")}</span>
                          </div>
                        </div>
                        <div className="rounded-lg bg-destructive/5 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-destructive flex items-center gap-1">
                            <Ambulance className="h-3 w-3" /> 🚑 {t("ambulance_eta")}
                          </div>
                          <div className="flex items-baseline gap-1 mt-0.5">
                            <span className="text-lg font-bold text-foreground">
                              {liveAmb != null ? formatMin(liveAmb) : "—"}
                            </span>
                            <span className="text-[11px] text-muted-foreground">{t("min")}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Navigation className="h-3 w-3" />
                          {eta ? formatKm(eta.distance) : formatKm(h.distanceMeters)}
                        </span>
                        {h.emergency && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                            ER
                          </span>
                        )}
                        <span className="ml-auto">×{factor.toFixed(2)} traffic</span>
                      </div>
                    </button>

                    <div className="px-4 pb-4 flex items-center gap-2">
                      {h.phone ? (
                        <a
                          href={`tel:${h.phone}`}
                          className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground px-3 py-2 text-xs font-semibold transition border border-destructive/20"
                          title={h.phone}
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {t("call_ambulance")}
                        </a>
                      ) : (
                        <a
                          href="tel:102"
                          className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground px-3 py-2 text-xs font-semibold transition border border-destructive/20"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {t("call_102")}
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => choose(h)}
                        className={`ml-auto inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-bold transition active:scale-[0.98] ${
                          isFastest
                            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-md shadow-destructive/20"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        }`}
                      >
                        {isFastest ? t("go_here_now") : t("routes")}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Map */}
            <div className="lg:sticky lg:top-20 self-start rounded-xl overflow-hidden border border-border shadow-[var(--shadow-card)] h-[640px] bg-card">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                }
              >
                <EmergencyMap
                  user={state.location}
                  hospitals={hospitals}
                  onSelect={(id) => {
                    const h = hospitals.find((x) => x.id === id);
                    if (h) choose(h);
                  }}
                />
              </Suspense>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
