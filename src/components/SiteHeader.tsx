import { Link } from "@tanstack/react-router";
import { Phone, Plus, X } from "lucide-react";
import { useState } from "react";

type Props = {
  step?: 1 | 2 | 3;
  stepLabel?: string;
};

const STEPS = ["Triage", "Hospitals", "Route"];

export function SiteHeader({ step, stepLabel }: Props) {
  const [showCall, setShowCall] = useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-foreground">
              MedRoute
            </div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Emergency Response
            </div>
          </div>
        </Link>

        {step && (
          <nav className="hidden md:flex items-center gap-1.5 text-xs">
            {STEPS.map((s, i) => {
              const n = (i + 1) as 1 | 2 | 3;
              const active = n === step;
              const done = n < step;
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium transition ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`h-4 w-4 rounded-full text-[10px] flex items-center justify-center ${
                        active
                          ? "bg-primary-foreground text-primary"
                          : done
                            ? "bg-accent-foreground/20 text-accent-foreground"
                            : "bg-muted"
                      }`}
                    >
                      {n}
                    </span>
                    {stepLabel && active ? stepLabel : s}
                  </div>
                  {i < 2 && <span className="text-border">·</span>}
                </div>
              );
            })}
          </nav>
        )}

        <button
          type="button"
          onClick={() => setShowCall(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 hover:bg-destructive hover:text-destructive-foreground text-destructive px-3 py-1.5 text-sm font-semibold transition border border-destructive/20"
        >
          <Phone className="h-3.5 w-3.5" />
          112
          <span className="hidden sm:inline text-xs opacity-70 font-normal">/ 911</span>
        </button>
      </div>

      {showCall && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4"
          onClick={() => setShowCall(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-destructive font-semibold">
                  Emergency
                </div>
                <h2 className="mt-1 text-lg font-semibold tracking-tight">Call emergency services?</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  This will dial the local emergency number on your device.
                </p>
              </div>
              <button
                onClick={() => setShowCall(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-2">
              <a
                href="tel:112"
                onClick={() => setShowCall(false)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-3 text-base font-semibold transition"
              >
                <Phone className="h-4 w-4" />
                Call 112
              </a>
              <a
                href="tel:911"
                onClick={() => setShowCall(false)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border hover:bg-accent px-4 py-3 text-sm font-semibold transition"
              >
                <Phone className="h-4 w-4" />
                Call 911
              </a>
              <button
                type="button"
                onClick={() => setShowCall(false)}
                className="text-xs text-muted-foreground hover:text-foreground mt-1 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export default SiteHeader;
