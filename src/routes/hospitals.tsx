import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";
import { findNearbyHospitals, getRouteMatrix, type Hospital } from "@/server/emergency.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { emergencyStore, useEmergencyState } from "@/lib/emergencyStore";

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
  return min < 1 ? "< 1 min" : `${min} min`;
}

function HospitalsPage() {
  const state = useEmergencyState();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Guard: must have location + injury to be on this page
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

  // Sort hospitals by ETA when available, fallback to straight-line distance
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
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-md bg-gold text-gold-foreground flex items-center justify-center font-display text-xl font-semibold">
              M
            </div>
            <div>
              <div className="font-display text-xl leading-none">MedRoute</div>
              <div className="text-xs opacity-70 tracking-wide uppercase">
                Step 2 of 3 · Suggested hospitals
              </div>
            </div>
          </Link>
          <a
            href="tel:112"
            className="hidden sm:inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 transition"
          >
            Call 112 / 911
          </a>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-secondary">
              {state.injury.label} · {state.locationLabel}
            </p>
            <h1 className="font-display text-3xl mt-1">Recommended hospitals nearby</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/" })}>
              ← Change details
            </Button>
            <Button variant="outline" onClick={runSearch} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">
            {errorMsg}
          </div>
        )}

        {loading && !hospitals.length && (
          <div className="text-center text-muted-foreground py-16">
            Locating specialty-matched hospitals…
          </div>
        )}

        {hospitals.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {hospitals.map((h, i) => {
                const eta = state.etas[h.id];
                return (
                  <Card
                    key={h.id}
                    className="p-4 cursor-pointer hover:border-secondary transition"
                    onClick={() => choose(h)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">
                          #{i + 1}
                          {i === 0 && eta && (
                            <span className="ml-2 text-gold-foreground bg-gold px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">
                              Fastest
                            </span>
                          )}
                        </div>
                        <div className="font-display text-lg leading-tight mt-0.5">{h.name}</div>
                        {h.address && (
                          <div className="text-xs text-muted-foreground mt-1 break-words">
                            {h.address}
                          </div>
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
                      <span className="text-muted-foreground ml-auto">
                        {eta ? (
                          <>
                            🚑 {formatMin(eta.duration)} · {formatKm(eta.distance)} by road
                          </>
                        ) : (
                          <>{formatKm(h.distanceMeters)} away</>
                        )}
                      </span>
                    </div>
                    <Button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        choose(h);
                      }}
                      className="mt-3 w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      Select & view routes →
                    </Button>
                  </Card>
                );
              })}
            </div>

            <div className="rounded-md overflow-hidden border border-border h-[600px]">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    Loading map…
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
