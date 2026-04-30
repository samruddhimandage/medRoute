import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";
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
} from "lucide-react";
import { findNearbyHospitals, getRouteMatrix, type Hospital } from "@/server/emergency.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { emergencyStore, useEmergencyState } from "@/lib/emergencyStore";
import { SiteHeader } from "@/components/SiteHeader";

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
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!state.location || !state.injury) {
      navigate({ to: "/" });
      return;
    }
    if (state.hospitals && state.hospitals.length > 0) return;
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async () => {
    if (!state.location || !state.injury) return;
    setLoading(true);
    setErrorMsg(null);
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
        setErrorMsg("No hospitals found nearby. Please try a different location.");
        emergencyStore.set({ hospitals: [], etas: {} });
        return;
      }
      emergencyStore.set({ hospitals: res.hospitals, etas: {} });

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
        }
      } catch (e) {
        console.error("matrix failed", e);
      }
    } catch (e) {
      console.error("find hospitals failed", e);
      setErrorMsg("Could not load hospitals. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const choose = (h: Hospital) => {
    emergencyStore.set({ selectedHospital: h });
    navigate({ to: "/route/$hospitalId", params: { hospitalId: encodeURIComponent(h.id) } });
  };

  if (!state.location || !state.injury) return null;

  const hospitals = [...(state.hospitals ?? [])].sort((a, b) => {
    const ea = state.etas[a.id]?.duration;
    const eb = state.etas[b.id]?.duration;
    if (ea != null && eb != null) return ea - eb;
    if (ea != null) return -1;
    if (eb != null) return 1;
    return a.distanceMeters - b.distanceMeters;
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <SiteHeader step={2} stepLabel="Hospitals" />

      <section className="mx-auto max-w-6xl px-6 py-8">
        {/* Title bar */}
        <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 font-semibold uppercase tracking-wider text-[10px]">
                {state.injury.label}
              </span>
              <MapPin className="h-3 w-3" />
              <span className="truncate max-w-[260px]">{state.locationLabel}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Recommended hospitals
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sorted by driving time · specialty-matched first
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/" })}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <Button variant="outline" size="sm" onClick={runSearch} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Refreshing" : "Refresh"}
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
            <div className="text-sm">Locating specialty-matched hospitals…</div>
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
                return (
                  <button
                    key={h.id}
                    onClick={() => choose(h)}
                    className={`w-full text-left rounded-xl border bg-card transition-all hover:shadow-[var(--shadow-soft)] hover:border-primary/40 ${
                      isFastest ? "border-primary/50 ring-1 ring-primary/20" : "border-border"
                    }`}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Rank badge */}
                        <div
                          className={`shrink-0 h-10 w-10 rounded-lg flex flex-col items-center justify-center font-bold text-sm ${
                            isFastest
                              ? "bg-primary text-primary-foreground"
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
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                <Sparkles className="h-2.5 w-2.5" /> Fastest
                              </span>
                            )}
                            {matched && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                                Match
                              </span>
                            )}
                          </div>
                          {h.address && (
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                              {h.address}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="mt-3 flex items-center gap-4 pl-13">
                        <div className="flex items-baseline gap-1">
                          <Clock className="h-3.5 w-3.5 text-primary" />
                          <span className="text-lg font-bold text-foreground">
                            {eta ? formatMin(eta.duration) : "—"}
                          </span>
                          <span className="text-xs text-muted-foreground">min</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <Navigation className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-semibold">
                            {eta ? formatKm(eta.distance) : formatKm(h.distanceMeters)}
                          </span>
                        </div>
                        <div className="ml-auto flex items-center gap-1.5">
                          {h.emergency && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                              ER
                            </span>
                          )}
                          {h.phone && (
                            <a
                              href={`tel:${h.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-border hover:bg-accent text-foreground"
                              title={h.phone}
                            >
                              <Phone className="h-3 w-3" />
                              Call
                            </a>
                          )}
                        </div>
                      </div>

                      <div
                        className={`mt-3 inline-flex items-center gap-1.5 text-xs font-semibold ${
                          isFastest ? "text-primary" : "text-muted-foreground"
                        }`}
                      >
                        Select & view routes <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                  </button>
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
