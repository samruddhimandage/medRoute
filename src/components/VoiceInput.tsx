import { Mic, MicOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { INJURY_TYPES } from "@/lib/injuryTypes";
import { useT, useLang, VOICE_KEYWORDS } from "@/lib/i18n";

type Props = {
  onMatch: (injuryId: string) => void;
};

const LANG_TO_BCP47: Record<string, string> = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
  ta: "ta-IN",
  bn: "bn-IN",
  te: "te-IN",
};

function detectInjury(transcript: string): string | null {
  const text = transcript.toLowerCase();
  let best: { id: string; score: number } | null = null;
  for (const inj of INJURY_TYPES) {
    const kws = VOICE_KEYWORDS[inj.id] ?? [];
    let score = 0;
    for (const kw of kws) {
      if (text.includes(kw.toLowerCase())) score += kw.length;
    }
    if (score > 0 && (!best || score > best.score)) best = { id: inj.id, score };
  }
  return best?.id ?? null;
}

export function VoiceInput({ onMatch }: Props) {
  const t = useT();
  const lang = useLang();
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const SR =
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      null;
    setSupported(!!SR);
  }, []);

  const start = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error(t("voice_unsupported"));
      return;
    }
    try {
      const rec = new SR();
      rec.lang = LANG_TO_BCP47[lang] ?? "en-IN";
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 3;
      rec.onresult = (e: any) => {
        const alts: string[] = [];
        const r = e.results[0];
        for (let i = 0; i < r.length; i++) alts.push(r[i].transcript);
        const transcript = alts.join(" ");
        const id = detectInjury(transcript);
        if (id) {
          const inj = INJURY_TYPES.find((x) => x.id === id);
          toast.success(`${t("voice_matched")} ${inj?.label ?? id}`);
          onMatch(id);
        } else {
          toast.error(`${t("voice_no_match")} "${transcript}"`);
        }
      };
      rec.onerror = (e: any) => {
        setListening(false);
        if (e.error !== "no-speech" && e.error !== "aborted") {
          toast.error(`Voice: ${e.error}`);
        }
      };
      rec.onend = () => setListening(false);
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (err) {
      console.error(err);
      toast.error(t("voice_unsupported"));
    }
  }, [lang, onMatch, t]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition ${
        listening
          ? "bg-destructive text-destructive-foreground border-destructive animate-pulse"
          : "bg-card hover:bg-accent border-border text-foreground"
      }`}
      aria-pressed={listening}
    >
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      {listening ? t("voice_listening") : t("voice_speak")}
    </button>
  );
}

export default VoiceInput;
