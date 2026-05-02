import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  ArrowLeft,
  RefreshCw,
  Clock,
  Navigation,
  Sparkles,
  Loader2,
  CheckCircle2,
  Ambulance,
  Phone,
} from "lucide-react";
import { getAlternativeRoutes, type RouteOption } from "@/server/emergency.functions";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useEmergencyState } from "@/lib/emergencyStore";
import { SiteHeader } from "@/components/SiteHeader";
import { useT } from "@/lib/i18n";
import { withTraffic, ambulanceEta, trafficFactor } from "@/lib/traffic";
import { useOnline } from "@/hooks/useOnline";

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
  return min < 1 ? "< 1" : `${min}`;
}

function RoutePage() {
  const { hospitalId } = Route.useParams();
  const decodedId = decodeURIComponent(hospitalId);
  const state = useEmergencyState();
  const navigate = useNavigate();
  const t = useT();
  const online = useOnline();

  const hospital =
    state.selectedHospital?.id === decodedId
      ? state.selectedHospital
      : state.hospitals?.find((h) => h.id === decodedId) ?? null;

  const [routes, setRoutes] = useState<RouteOption[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const lastUpdate = useRef<number>(Date.now());

  useEffect(() => {
    if (!state.location || !hospital) {
      navigate({ to: "/" });
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hospital?.id]);

  // Live ETA tick (5s) for traffic refresh; periodic refetch (every 60s) for live recomputation.
  useEffect(() => {
    const t1 = setInterval(() => setTick((x) => x + 1), 5000);
    const t2 = setInterval(() => {
      if (online) void load();
    }, 60000);
    return () => { clearInterval(t1); clearInterval(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

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
      lastUpdate.current = Date.now();
    } catch (e) {
      console.error("alt routes failed", e);
      setErrorMsg("Routing service unreachable. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!state.location || !hospital) return null;

  void tick;
  const factor = trafficFactor();

  // Sort by traffic-adjusted duration so "Fastest Right Now" is correct
  const ranked = (routes ?? [])
    .map((r, originalIdx) => ({
      r,
      originalIdx,
      liveDur: withTraffic(r.durationSeconds),
    }))
    .sort((a, b) => a.liveDur - b.liveDur);

  const fastestOriginalIdx = ranked[0]?.originalIdx ?? 0;

  const altRoutes = (routes ?? []).map((r, i) => ({
    coordinates: r.coordinates,
    highlighted: i === selectedIdx,
    label: i === fastestOriginalIdx ? t("fastest_now") : `${t("option")} ${i + 1}`,
  }));

  const fastest = ranked[0]?.r;
  const fastestLive = ranked[0]?.liveDur;
  const ambEta = fastest ? ambulanceEta(fastest.durationSeconds) : null;

  const secondsAgo = Math.floor((Date.now() - lastUpdate.current) / 1000);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster richColors position="top-center" />
      <SiteHeader step={3} stepLabel={t("step_route")} />

      <section className="mx-auto max-w-6xl px-6 py-8">
        {/* Title bar */}
        <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2 py-0.5 font-semibold text-[10px]">
                {state.injury?.label}
              </span>
              <span>{t("destination")}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 font-semibold text-[10px]">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                {t("live")} · ×{factor.toFixed(2)}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight leading-tight">
              {hospital.name}
            </h1>
            {hospital.address && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{hospital.address}</p>
            )}
          </div>
          <div className="flex gap-2">
            {hospital.phone ? (
              <a
                href={`tel:${hospital.phone}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 px-3 py-2 text-xs font-semibold"
              >
                <Phone className="h-3.5 w-3.5" /> {t("call_ambulance")}
              </a>
            ) : (
              <a
                href="tel:102"
                className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive hover:text-destructive-foreground px-3 py-2 text-xs font-semibold"
              >
                <Phone className="h-3.5 w-3.5" /> {t("call_102")}
              </a>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/hospitals" })}>
              <ArrowLeft className="h-3.5 w-3.5" /> {t("hospitals_back")}
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              {t("refresh")}
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            {errorMsg}
          </div>
        )}

        {loading && !routes && (
          <div className="flex flex-col items-center justify-center text-muted-foreground py-20">
            <Loader2 className="h-6 w-6 animate-spin mb-3 text-primary" />
            <div className="text-sm">{t("calculating_routes")}</div>
          </div>
        )}

        {routes && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <div className="space-y-3">
              {/* Recommended banner */}
              {fastest && (
                <div className="rounded-xl border-2 border-primary/40 bg-primary/[0.04] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
                      <Sparkles className="h-3 w-3" /> {t("fastest_now")}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {t("updated")} {secondsAgo}s
                    </div>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">🚗 {t("car_eta")}</div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-foreground">
                          {formatMin(fastestLive!)}
                        </span>
                        <span className="text-sm text-muted-foreground">{t("min")}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatKm(fastest.distanceMeters)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-destructive flex items-center gap-1">
                        <Ambulance className="h-3 w-3" /> 🚑 {t("ambulance_eta")}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-foreground">
                          {ambEta != null ? formatMin(ambEta) : "—"}
                        </span>
                        <span className="text-sm text-muted-foreground">{t("min")}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">dispatch + travel</div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {t("fastest_caption")}
                  </p>
                  <Button
                    onClick={() => setSelectedIdx(fastestOriginalIdx)}
                    className="mt-3 w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {t("show_fastest")}
                  </Button>
                </div>
              )}

              <div className="text-[11px] uppercase tracking-wider text-muted-foreground pt-2 px-1">
                {t("top_n", { n: routes.length })}
              </div>

              {ranked.map((entry, rankIdx) => {
                const i = entry.originalIdx;
                const r = entry.r;
                const liveDur = entry.liveDur;
                const active = selectedIdx === i;
                const isFastest = rankIdx === 0;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedIdx(i)}
                    className={`w-full text-left rounded-xl border p-4 transition-all bg-card ${
                      active
                        ? "border-primary ring-2 ring-primary/20 shadow-[var(--shadow-soft)]"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-9 w-9 rounded-lg flex items-center justify-center text-sm font-bold ${
                            isFastest
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {rankIdx + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground">
                              {t("option")} {i + 1}
                            </span>
                            {isFastest && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary text-primary-foreground">
                                {t("fastest_now")}
                              </span>
                            )}
                          </div>
                          <div className="flex items-baseline gap-3 mt-0.5">
                            <div className="flex items-baseline gap-1">
                              <Clock className="h-3.5 w-3.5 text-primary self-center" />
                              <span className="text-xl font-bold">
                                {formatMin(liveDur)}
                              </span>
                              <span className="text-xs text-muted-foreground">{t("min")}</span>
                            </div>
                            <div className="flex items-baseline gap-1 text-sm text-muted-foreground">
                              <Navigation className="h-3 w-3 self-center" />
                              {formatKm(r.distanceMeters)}
                            </div>
                          </div>
                        </div>
                      </div>
                      {active && <CheckCircle2 className="h-5 w-5 text-primary" />}
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
