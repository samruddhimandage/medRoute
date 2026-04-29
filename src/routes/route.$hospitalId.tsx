import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";
import {
  getAlternativeRoutes,
  type RouteOption,
} from "@/server/emergency.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { useEmergencyState } from "@/lib/emergencyStore";

const EmergencyMap = lazy(() => import("@/components/EmergencyMap"));

export const Route = createFileRoute("/route/$hospitalId")({
  head: () => ({
    meta: [
      { title: "Ambulance Route — MedRoute" },
      { name: "description", content: "Compare ambulance routes and choose the fastest path." },
    ],
  }),
  component: RoutePage,
});

function formatKm(m: number) {
  return (m / 1000).toFixed(1) + " km";
}
function formatMin(s: number) {
  const min = Math.round(s / 60);
  return min < 1 ? "< 1 min" : `${min} min`;
}

function RoutePage() {
  const { hospitalId } = Route.useParams();
  const decodedId = decodeURIComponent(hospitalId);
  const state = useEmergencyState();
  const navigate = useNavigate();

  const hospital =
    state.selectedHospital?.id === decodedId
      ? state.selectedHospital
      : state.hospitals?.find((h) => h.id === decodedId) ?? null;

  const [routes, setRoutes] = useState<RouteOption[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!state.location || !hospital) {
      navigate({ to: "/" });
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospital?.id]);

  const load = async () => {
    if (!state.location || !hospital) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await getAlternativeRoutes({
        data: {
          from: state.location,
          to: { lat: hospital.lat, lng: hospital.lng },
        },
      });
      if (res.error) setErrorMsg(res.error);
      setRoutes(res.routes ?? []);
      setSelectedIdx(0);
    } catch (e) {
      console.error("alt routes failed", e);
      setErrorMsg("Routing service unreachable. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!state.location || !hospital) return null;

  const fastestIdx = 0; // routes are sorted by duration asc
  const altRoutes = (routes ?? []).map((r, i) => ({
    coordinates: r.coordinates,
    highlighted: i === selectedIdx,
    label: i === fastestIdx ? "Fastest" : `Option ${i + 1}`,
  }));

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
                Step 3 of 3 · Ambulance route
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
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.2em] text-secondary">
              Destination · {state.injury?.label}
            </p>
            <h1 className="font-display text-3xl mt-1 leading-tight">{hospital.name}</h1>
            {hospital.address && (
              <p className="text-sm text-muted-foreground mt-1">{hospital.address}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/hospitals" })}>
              ← Choose another hospital
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh routes"}
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
            {errorMsg}
          </div>
        )}

        {loading && !routes && (
          <div className="text-center text-muted-foreground py-16">
            Calculating possible ambulance routes…
          </div>
        )}

        {routes && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {routes.length} possible route{routes.length === 1 ? "" : "s"} · sorted by time
              </div>
              {routes.map((r, i) => {
                const active = selectedIdx === i;
                const isFastest = i === fastestIdx;
                return (
                  <Card
                    key={i}
                    onClick={() => setSelectedIdx(i)}
                    className={`p-4 cursor-pointer transition ${
                      active ? "border-gold shadow-elevated" : "hover:border-secondary"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-muted-foreground">
                          Option {i + 1}
                          {isFastest && (
                            <span className="ml-2 bg-gold text-gold-foreground px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider">
                              Shortest by time
                            </span>
                          )}
                        </div>
                        <div className="font-display text-2xl mt-1">
                          {formatMin(r.durationSeconds)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatKm(r.distanceMeters)} by road
                        </div>
                      </div>
                      <div
                        className={`h-3 w-3 rounded-full ${
                          active ? "bg-gold" : "bg-muted"
                        }`}
                      />
                    </div>
                  </Card>
                );
              })}

              {routes.length > 0 && (
                <div className="rounded-md border border-gold bg-card p-4 mt-4">
                  <div className="text-xs uppercase tracking-wider text-secondary mb-1">
                    Recommended
                  </div>
                  <div className="font-display text-lg">
                    Take the fastest route — {formatMin(routes[0].durationSeconds)} (
                    {formatKm(routes[0].distanceMeters)})
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Based on current driving estimates from OpenRouteService.
                  </p>
                  <Button
                    onClick={() => setSelectedIdx(0)}
                    className="mt-3 w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    Show fastest on map
                  </Button>
                </div>
              )}
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
                  hospitals={[hospital]}
                  alternativeRoutes={altRoutes}
                />
              </Suspense>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
