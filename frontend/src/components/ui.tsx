import { AlertTriangle, CheckCircle2, CircleHelp, FlaskConical, Info, Loader2, Pause, Play, Sparkles, Square, Volume2, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSpeech } from "../context/SpeechContext";
import type { RatingLabel } from "../lib/types";

export const ratingMeta: Record<RatingLabel, { label: string; Icon: typeof CheckCircle2; text: string; bg: string; pat: string }> = {
  STRONG: { label: "Strong", Icon: CheckCircle2, text: "text-strong", bg: "bg-strong/10 border-strong/40", pat: "pat-strong" },
  OKAY: { label: "Okay", Icon: AlertTriangle, text: "text-okay", bg: "bg-okay/10 border-okay/40", pat: "pat-okay" },
  WEAK: { label: "Weak", Icon: XCircle, text: "text-weak", bg: "bg-weak/10 border-weak/40", pat: "pat-weak" },
};
export const scoreWords = ["", "Very weak", "Weak", "Satisfactory", "Good", "Excellent"];
export const labelFor = (s: number): RatingLabel => (s >= 4 ? "STRONG" : s === 3 ? "OKAY" : "WEAK");

export function RatingBadge({ rating, score, size = "md" }: { rating: RatingLabel; score?: number; size?: "sm" | "md" | "lg" }) {
  const m = ratingMeta[rating];
  const pad = size === "lg" ? "px-3 py-1.5 text-sm" : size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-bold uppercase tracking-wide ${pad} ${m.bg} ${m.text}`}>
      <m.Icon aria-hidden className={size === "lg" ? "h-4 w-4" : "h-3.5 w-3.5"} />
      {m.label}
      {score !== undefined && <span className="font-semibold normal-case tracking-normal opacity-90">· {score}/5</span>}
    </span>
  );
}

export function ScoreRing({ value, size = 132, label, sub, tone }: { value: number; size?: number; label?: string; sub?: string; tone?: RatingLabel }) {
  const [shown, setShown] = useState(0);
  useEffect(() => { const t = setTimeout(() => setShown(value), 60); return () => clearTimeout(t); }, [value]);
  const r = size / 2 - 10, c = 2 * Math.PI * r;
  const t = tone || (value >= 70 ? "STRONG" : value >= 50 ? "OKAY" : "WEAK");
  const color = `rgb(var(--${t === "STRONG" ? "strong" : t === "OKAY" ? "okay" : "weak"}))`;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img"
      aria-label={`${label ?? "Score"}: ${Math.round(value)} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(var(--line))" strokeWidth="10" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="10" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * shown) / 100} style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.8,.2,1)" }} />
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-3xl font-extrabold leading-none" style={{ fontSize: size / 4.2 }}>{Math.round(value)}<span className="text-base text-muted">%</span></div>
        {sub && <div className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{sub}</div>}
      </div>
    </div>
  );
}

export function Bar({ value, max = 100, rating }: { value: number; max?: number; rating?: RatingLabel }) {
  const t = rating ? ratingMeta[rating] : null;
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface2" role="presentation">
      <div className={`grow-bar h-full rounded-full ${t ? "" : "bg-accent"}`}
        style={{ width: `${Math.max(2, (value / max) * 100)}%`, background: t ? `rgb(var(--${rating === "STRONG" ? "strong" : rating === "OKAY" ? "okay" : "weak"}))` : undefined }} />
    </div>
  );
}

export function ModeBadge({ mode, model }: { mode: "live" | "simulated" | string; model?: string }) {
  return mode === "live" ? (
    <span className="chip bg-info/10 text-info border border-info/30" title={model}><Sparkles className="h-3.5 w-3.5" aria-hidden /> Live AI{model ? ` · ${model}` : ""}</span>
  ) : (
    <span className="chip bg-okay/10 text-okay border border-okay/40" title="Rule-based simulator - not AI analysis">
      <FlaskConical className="h-3.5 w-3.5" aria-hidden /> Simulated · not AI
    </span>
  );
}

export function DemoTag({ text = "Demonstration data" }: { text?: string }) {
  return <span className="chip border border-dashed border-accent/60 bg-accent/10 text-accent"><Info className="h-3 w-3" aria-hidden />{text}</span>;
}

export function Loading({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status" aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> {text}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-weak/40 bg-weak/10 p-4 text-sm text-ink">
      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-weak" aria-hidden />
      <div className="flex-1"><p className="font-semibold">Something went wrong</p><p className="mt-0.5 text-muted">{message}</p></div>
      {onRetry && <button className="btn-ghost !py-1.5" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Notice({ tone = "info", title, children, icon }: { tone?: "info" | "warn" | "ok"; title?: string; children: ReactNode; icon?: ReactNode }) {
  const cls = tone === "warn" ? "border-okay/40 bg-okay/10" : tone === "ok" ? "border-strong/40 bg-strong/10" : "border-info/30 bg-info/5";
  const Icon = tone === "warn" ? AlertTriangle : tone === "ok" ? CheckCircle2 : CircleHelp;
  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-sm ${cls}`}>
      {icon ?? <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone === "warn" ? "text-okay" : tone === "ok" ? "text-strong" : "text-info"}`} aria-hidden />}
      <div className="flex-1">{title && <p className="font-semibold text-ink">{title}</p>}<div className="text-muted">{children}</div></div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <div className="mb-2 flex flex-wrap gap-2">{eyebrow}</div>}
        <h1 className="h-page">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SpeakButton({ id, text, label = "Read aloud" }: { id: string; text: string; label?: string }) {
  const sp = useSpeech();
  if (!sp.supported) return null;
  const active = sp.currentId === id && sp.state !== "idle";
  return (
    <button type="button" onClick={() => (active ? sp.stop() : sp.speak(id, text))}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${active ? "border-accent bg-accent text-accentink" : "border-line text-muted hover:text-accent hover:border-accent"}`}
      aria-label={active ? "Stop reading" : label} title={active ? "Stop reading" : label} aria-pressed={active}>
      {active ? <Square className="h-3.5 w-3.5" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
    </button>
  );
}

export function SpeechControls() {
  const sp = useSpeech();
  if (!sp.supported || sp.state === "idle") return null;
  return (
    <div className="flex items-center gap-1 rounded-full border border-accent/50 bg-accent/10 px-2 py-1 text-xs font-semibold text-accent" role="group" aria-label="Read-aloud controls">
      <Volume2 className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Reading</span>
      {sp.state === "speaking"
        ? <button className="rounded-full p-1 hover:bg-accent/20" onClick={sp.pause} aria-label="Pause reading"><Pause className="h-4 w-4" /></button>
        : <button className="rounded-full p-1 hover:bg-accent/20" onClick={sp.resume} aria-label="Resume reading"><Play className="h-4 w-4" /></button>}
      <button className="rounded-full p-1 hover:bg-accent/20" onClick={sp.stop} aria-label="Stop reading"><Square className="h-4 w-4" /></button>
    </div>
  );
}

export function QuoteBlock({ quote, status }: { quote: string; status: string }) {
  if (!quote) {
    return <p className="rounded-lg border border-dashed border-line p-3 text-sm italic text-muted">No quotation - the marker found insufficient evidence in your submission for this criterion.</p>;
  }
  const badge = status === "verified" ? <span className="chip bg-strong/10 text-strong"><CheckCircle2 className="h-3 w-3" aria-hidden /> Verified in your document</span>
    : status === "near" ? <span className="chip bg-okay/10 text-okay"><AlertTriangle className="h-3 w-3" aria-hidden /> Close match only</span>
      : <span className="chip bg-weak/10 text-weak"><XCircle className="h-3 w-3" aria-hidden /> Not found in your document</span>;
  return (
    <figure className="rounded-lg border-l-4 border-accent bg-surface2/70 p-3">
      <blockquote className="text-sm leading-relaxed text-ink">&ldquo;{quote}&rdquo;</blockquote>
      <figcaption className="mt-2">{badge}</figcaption>
    </figure>
  );
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between text-sm font-medium text-muted">{label}{icon}</div>
      <div className="mt-2 font-display text-3xl font-extrabold text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <p className="font-display text-lg font-bold">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export const issueLabels: Record<string, string> = {
  missing: "Missing content", incorrect: "Incorrect content", unsupported: "Unsupported claim",
  good: "Good-quality work", ambiguous: "Ambiguous / can't judge reliably",
};
