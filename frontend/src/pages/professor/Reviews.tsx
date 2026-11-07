import { ChevronDown, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Empty, ErrorBox, Loading, ModeBadge, Notice, PageHeader, QuoteBlock, RatingBadge, scoreWords } from "../../components/ui";
import { api } from "../../lib/api";
import type { RatingLabel } from "../../lib/types";

interface Item {
  assessment_id: number; student: string; assignment: string; module_name: string; round: number; weighted_score: number; mode: string;
  needs_human_review: boolean; draft_text: string; review: { rating_id: number; rating: number; comment: string }[] | null;
  ratings: { id: number; criterion_name: string; criterion_text: string; score: number; rating: RatingLabel; evidence_quote: string; quote_status: string; explanation: string; flagged: boolean }[];
}
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

function ReviewForm({ it, onSaved }: { it: Item; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<number, { rating: number; comment: string }>>(() =>
    Object.fromEntries(it.ratings.map((r) => { const ex = it.review?.find((x) => x.rating_id === r.id); return [r.id, { rating: ex?.rating ?? r.score, comment: ex?.comment ?? "" }]; })));
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const tooLong = Object.values(vals).some((v) => words(v.comment) > 10);
  const submit = async () => {
    setError(null);
    try { await api(`/professor/reviews/${it.assessment_id}`, { body: { items: Object.entries(vals).map(([k, v]) => ({ rating_id: Number(k), ...v })) } }); setOk(true); onSaved(); }
    catch (e) { setError((e as Error).message); }
  };
  return (
    <div className="space-y-3">
      {it.ratings.map((r) => (
        <div key={r.id} className="grid gap-3 rounded-lg border border-line p-3 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2"><b>{r.criterion_name}</b><span className="text-muted">AI estimate:</span><RatingBadge rating={r.rating} score={r.score} size="sm" />{r.flagged && <span className="chip bg-okay/15 text-okay">flagged</span>}</div>
            <p className="text-xs italic text-muted">{r.criterion_text}</p>
            <QuoteBlock quote={r.evidence_quote} status={r.quote_status} />
            <p className="text-muted">{r.explanation}</p>
          </div>
          <div className="space-y-2">
            <label className="label" htmlFor={`rt-${r.id}`}>Your rating</label>
            <select id={`rt-${r.id}`} className="input" value={vals[r.id].rating} onChange={(e) => setVals({ ...vals, [r.id]: { ...vals[r.id], rating: Number(e.target.value) } })}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} – {scoreWords[n]}</option>)}
            </select>
            <label className="label" htmlFor={`cm-${r.id}`}>Comment <span className="font-normal text-muted">(optional, max 10 words)</span></label>
            <input id={`cm-${r.id}`} className={`input ${words(vals[r.id].comment) > 10 ? "!border-weak" : ""}`} value={vals[r.id].comment} placeholder="e.g. Input validation is missing."
              onChange={(e) => setVals({ ...vals, [r.id]: { ...vals[r.id], comment: e.target.value } })} aria-describedby={`wc-${r.id}`} />
            <p id={`wc-${r.id}`} className={`text-xs ${words(vals[r.id].comment) > 10 ? "font-bold text-weak" : "text-muted"}`}>{words(vals[r.id].comment)}/10 words</p>
          </div>
        </div>
      ))}
      {error && <ErrorBox message={error} />}
      {ok && <Notice tone="ok">Review saved. The student will see your ratings and comments next to the AI feedback.</Notice>}
      <button className="btn-primary" disabled={tooLong} onClick={submit}><Send className="h-4 w-4" /> Save review</button>
    </div>
  );
}

export default function ProfReviews() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = () => api<Item[]>("/professor/reviews").then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  if (error) return <ErrorBox message={error} />;
  if (!items) return <Loading />;
  return (
    <div className="space-y-4 fade-in">
      <PageHeader title="Shared for review" subtitle="Students can choose to share an assessment with you - for example when feedback was flagged for human review. Nothing else is visible to you." />
      {items.length === 0 && <Empty title="Nothing shared with you yet">When a student presses "Ask lecturer to review" on their results, it appears here. Try it from the student demo.</Empty>}
      {items.map((it) => (
        <article key={it.assessment_id} className="card">
          <button className="flex w-full flex-wrap items-center gap-3 p-5 text-left" aria-expanded={open === it.assessment_id} onClick={() => setOpen(open === it.assessment_id ? null : it.assessment_id)}>
            <span className="font-display text-2xl font-extrabold">{Math.round(it.weighted_score)}%</span>
            <span className="flex-1"><b>{it.assignment}</b> · round {it.round}<span className="block text-sm text-muted">{it.module_name} · {it.student} (pseudonymous)</span></span>
            <ModeBadge mode={it.mode} />{it.needs_human_review && <span className="chip bg-okay/15 text-okay">needs human review</span>}
            {it.review ? <span className="chip bg-strong/10 text-strong">reviewed</span> : <span className="chip bg-surface2 text-muted">awaiting review</span>}
            <ChevronDown className={`h-5 w-5 transition ${open === it.assessment_id ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {open === it.assessment_id && (
            <div className="space-y-4 border-t border-line p-5">
              <details><summary className="cursor-pointer font-semibold text-accent">Read the shared draft</summary>
                <div className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-surface2/60 p-4 font-[Georgia,serif] text-sm">{it.draft_text}</div></details>
              <ReviewForm it={it} onSaved={load} />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
