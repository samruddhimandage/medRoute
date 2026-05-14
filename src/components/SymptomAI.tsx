import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Sparkles, Loader2, Send, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeSymptoms, type SymptomAnalysis } from "@/lib/symptom.functions";
import { useT, useLang } from "@/lib/i18n";

const LANG_TO_BCP47: Record<string, string> = {
  en: "en-IN", hi: "hi-IN", mr: "mr-IN", ta: "ta-IN", bn: "bn-IN", te: "te-IN",
};

type Props = {
  onResult: (r: SymptomAnalysis) => void;
};

export function SymptomAI({ onResult }: Props) {
  const t = useT();
  const lang = useLang();
  const analyze = useServerFn(analyzeSymptoms);

  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supportsVoice, setSupportsVoice] = useState(true);
  const [lastResult, setLastResult] = useState<SymptomAnalysis | null>(null);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const SR =
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      null;
    setSupportsVoice(!!SR);
  }, []);

  const runAnalysis = useCallback(
    async (input: string) => {
      const v = input.trim();
      if (v.length < 2) {
        toast.error("Please describe what's happening.");
        return;
      }
      setLoading(true);
      try {
        const res = await analyze({ data: { text: v, language: lang } });
        if (!res?.result) {
          toast.error(res?.error ?? "Could not understand. Try again.");
          return;
        }
        setLastResult(res.result);
        onResult(res.result);
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message ?? "AI request failed.");
      } finally {
        setLoading(false);
      }
    },
    [analyze, lang, onResult]
  );

  const startVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Voice input is not supported on this browser.");
      return;
    }
    try {
      const rec = new SR();
      rec.lang = LANG_TO_BCP47[lang] ?? "en-IN";
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      let finalText = "";
      rec.onresult = (e: any) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript + " ";
          else interim += r[0].transcript;
        }
        setText((finalText + interim).trim());
      };
      rec.onerror = (e: any) => {
        setListening(false);
        if (e.error !== "no-speech" && e.error !== "aborted") toast.error(`Voice: ${e.error}`);
      };
      rec.onend = () => {
        setListening(false);
        const v = (finalText || text).trim();
        if (v.length >= 2) runAnalysis(v);
      };
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (err) {
      console.error(err);
      toast.error("Could not start voice input.");
    }
  }, [lang, runAnalysis, text]);

  const stopVoice = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
  }, []);

  const placeholder =
    lang === "hi"
      ? "जैसे: सीने में दर्द और पसीना आ रहा है"
      : lang === "mr"
      ? "उदा: छातीत दुखत आहे"
      : "e.g. chest pain and sweating, can't breathe, bike accident…";

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/[0.04] via-card to-card p-5 md:p-6 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
          <Sparkles className="h-4 w-4" />
        </div>
        <h2 className="text-lg md:text-xl font-semibold">Describe what's happening</h2>
        <span className="ml-auto text-[10px] uppercase tracking-wider rounded-full bg-primary/10 text-primary px-2 py-0.5 font-semibold">
          AI
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Speak or type in your own words. Hindi, Marathi & Hinglish supported.
      </p>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={listening ? stopVoice : startVoice}
          disabled={loading || !supportsVoice}
          className={`inline-flex items-center justify-center gap-2 rounded-xl h-14 px-5 font-semibold transition active:scale-[0.98] border-2 ${
            listening
              ? "bg-destructive text-destructive-foreground border-destructive animate-pulse"
              : "bg-card hover:bg-accent border-border text-foreground"
          } disabled:opacity-50`}
          aria-pressed={listening}
        >
          {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          {listening ? "Listening… tap to stop" : "Speak Symptoms"}
        </button>

        <div className="relative flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runAnalysis(text);
              }
            }}
            placeholder={placeholder}
            rows={2}
            disabled={loading}
            className="w-full rounded-xl border-2 border-border bg-background px-4 py-3 pr-12 text-base resize-none focus:outline-none focus:border-primary/60 disabled:opacity-50"
          />
          {text && (
            <button
              type="button"
              onClick={() => setText("")}
              className="absolute right-2 top-2 h-7 w-7 rounded-md hover:bg-muted text-muted-foreground"
              aria-label="Clear"
            >
              <X className="h-4 w-4 mx-auto" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => runAnalysis(text)}
          disabled={loading || text.trim().length < 2}
          className="inline-flex items-center justify-center gap-2 rounded-xl h-14 px-5 font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </div>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          We're understanding your symptoms…
        </div>
      )}

      {lastResult && !loading && (
        <div
          className={`mt-4 rounded-xl border p-4 ${
            lastResult.urgency_level === "Critical"
              ? "border-destructive/40 bg-destructive/5"
              : lastResult.urgency_level === "Urgent"
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-emerald-500/30 bg-emerald-500/5"
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`h-5 w-5 mt-0.5 shrink-0 ${
                lastResult.urgency_level === "Critical"
                  ? "text-destructive"
                  : lastResult.urgency_level === "Urgent"
                  ? "text-amber-600"
                  : "text-emerald-600"
              }`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-semibold text-base">{lastResult.detected_issue}</div>
                <span
                  className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 font-bold ${
                    lastResult.urgency_level === "Critical"
                      ? "bg-destructive text-destructive-foreground"
                      : lastResult.urgency_level === "Urgent"
                      ? "bg-amber-500 text-white"
                      : "bg-emerald-500 text-white"
                  }`}
                >
                  {lastResult.urgency_level}
                </span>
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                <span className="font-medium text-foreground">{lastResult.medical_department}</span>{" "}
                · {lastResult.recommended_hospital_type}
              </div>
              <div className="text-sm mt-2">{lastResult.recommended_action}</div>
              <div className="text-xs text-muted-foreground italic mt-2">
                {lastResult.reassurance_message}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SymptomAI;
