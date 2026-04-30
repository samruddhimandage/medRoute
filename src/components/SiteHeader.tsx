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

        <a
          href="tel:112"
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 hover:bg-destructive hover:text-destructive-foreground text-destructive px-3 py-1.5 text-sm font-semibold transition border border-destructive/20"
        >
          <Phone className="h-3.5 w-3.5" />
          112
          <span className="hidden sm:inline text-xs opacity-70 font-normal">/ 911</span>
        </a>
      </div>
    </header>
  );
}

export default SiteHeader;
