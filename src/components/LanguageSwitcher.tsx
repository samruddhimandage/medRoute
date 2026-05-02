import { Globe, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LANGS, i18n, useLang, type LangCode } from "@/lib/i18n";

export function LanguageSwitcher() {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card hover:bg-accent px-2.5 py-1.5 text-xs font-medium text-foreground transition"
        aria-label="Select language"
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{cur.native}</span>
        <span className="sm:hidden uppercase">{cur.code}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-lg border border-border bg-popover shadow-[var(--shadow-elevated)] py-1 z-50">
          {LANGS.map((l) => {
            const active = l.code === lang;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => { i18n.set(l.code as LangCode); setOpen(false); }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-accent ${
                  active ? "text-primary font-semibold" : "text-foreground"
                }`}
              >
                <span>{l.native}</span>
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default LanguageSwitcher;
