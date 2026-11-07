import {
  AlertTriangle, ArrowRight, Calculator, CheckCircle2, ChevronRight, GitCompareArrows, ListChecks, MessageCircleQuestion,
  Pencil, Share2, Volume2, Workflow, XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { QualityCard, Reliability } from "../../components/Quality";
import {
  DemoTag, ErrorBox, Loading, ModeBadge, Notice, PageHeader, QuoteBlock, RatingBadge, ScoreRing, SpeakButton,
  issueLabels, ratingMeta,
} from "../../components/ui";
import { useDemo } from "../../context/DemoContext";
import { useSpeech } from "../../context/SpeechContext";
import { api } from "../../lib/api";
import type { Assessment, Rating } from "../../lib/types";

export const ratingSpeech = (r: Rating) =>
  `${r.criterion_name}. Weight ${r.weight} percent. Rating ${r.rating}, ${r.score} out of 5. ` +
  (r.evidence_quote ? `Evidence from your work: ${r.evidence_quote}. ` : "No quotation was available. ") +
  `${r.explanation} ${r.missing ? "What is missing: " + r.missing + "." : ""} Coaching question: ${r.coaching_question}`;

export function CriterionCard({ r, assessmentId }: { r: Rating; assessmentId: number }) {
  const m = ratingMeta[r.rating];
  return (
    <article className={`card overflow-hidden fade-in`} aria-labelledby={`crit-${r.id}`}>
      <div className={`flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 ${m.pat}`}>
        <RatingBadge rating={r.rating} score={r.score} />
        <h3 id={`crit-${r.id}`} className="text-base font-bold">{r.criterion_name}</h3>
        <span className="chip bg-surface text-muted border border-line">{r.weight}% of rubric</span>
        <span className="chip bg-surface text-muted border border-line">{issueLabels[r.issue_type]}</span>
        {r.flagged && <span className="chip bg-okay/15 text-okay border border-okay/40"><AlertTriangle className="h-3 w-3" aria-hidden />Needs human review</span>}
        <span className="ml-auto"><SpeakButton id={`r-${r.id}`} text={ratingSpeech(r)} label={`Read feedback for ${r.criterion_name}`} /></span>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-2">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Rubric criterion</p>
          <p className="text-sm italic">{r.criterion_text}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Evidence from your work</p>
          <QuoteBlock quote={r.evidence_quote} status={r.quote_status} />
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{r.score >= 4 ? "Why this is strong" : "Why this needs improvement"}</p>
            <p className="mt-1">{r.explanation}</p>
          </div>
          {r.missing && <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">What is missing</p><p className="mt-1">{r.missing}</p></div>}
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent"><MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden />Coaching question</p>
            <p className="mt-1 font-medium">{r.coaching_question}</p>
          </div>
          {r.flag_reasons.length > 0 && <ul className="space-y-1 text-xs text-okay">{r.flag_reasons.map((f) => <li key={f}>⚠ {f}</li>)}</ul>}
          <div className="flex flex-wrap gap-2 pt-1">
            {r.improvement_area_id && <Link to={`/student/coach/${r.improvement_area_id}`} className="btn-primary !py-1.5">Coach me on this <ArrowRight className="h-4 w-4" /></Link>}
            <Link to={`/student/results/${assessmentId}/criterion/${r.id}`} className="btn-ghost !py-1.5">Details <ChevronRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export function WeightedTable({ a }: { a: Assessment }) {
  return (
    <section className="card p-6" aria-labelledby="calc">
      <h2 id="calc" className="flex items-center gap-2 text-xl font-extrabold"><Calculator className="h-5 w-5 text-accent" aria-hidden /> How your estimate is calculated</h2>
      <p className="mt-1 text-sm text-muted">Weighted score = sum of (rating ÷ 5 × criterion weight). This is an estimate to guide revision - not a predicted grade.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Weighted score calculation</caption>
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr><th className="py-2 pr-4">Criterion</th><th className="pr-4 text-right">Weight</th><th className="pr-4">Rating</th><th className="pr-4">Calculation</th><th className="text-right">Contribution</th></tr>
          </thead>
          <tbody>
            {a.ratings.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-2.5 pr-4 font-medium">{r.criterion_name}</td>
                <td className="pr-4 text-right">{r.weight}%</td>
                <td className="pr-4"><RatingBadge rating={r.rating} score={r.score} size="sm" /></td>
                <td className="pr-4 font-mono text-xs text-muted">{r.score}/5 × {r.weight}</td>
                <td className="text-right font-semibold">{r.contribution.toFixed(1)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-ink/30 font-bold"><td className="py-2.5">Estimated total</td><td className="pr-4 text-right">100%</td><td /><td /><td className="text-right">{a.weighted_score.toFixed(1)}%</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Results() {
  const { id } = useParams();
  const [a, setA] = useState<Assessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const { demo, setDemo } = useDemo();
  const sp = useSpeech();

  const load = useCallback(() => {
    setError(null);
    api<Assessment>(`/assessment/${id}`).then(setA).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => {
    if (a && demo.active && a.assignment.is_demo) {
      if (a.draft.round_number === 1 && demo.step < 3) setDemo({ step: 3, assessment1Id: a.id });
      if (a.draft.round_number >= 2 && demo.step < 6) setDemo({ step: 6, assessment2Id: a.id });
      if (a.draft.round_number >= 2 && !demo.assessment2Id) setDemo({ assessment2Id: a.id });
    }
  }, [a, demo.active, demo.step, setDemo]);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!a) return <Loading text="Loading your feedback..." />;
  const counts = { STRONG: 0, OKAY: 0, WEAK: 0 } as Record<string, number>;
  a.ratings.forEach((r) => counts[r.rating]++);
  const readAll = () => sp.speakAll([
    { id: "summary", text: `Estimated performance ${Math.round(a.weighted_score)} percent. ${a.overall_summary}` },
    ...a.ratings.map((r) => ({ id: `r-${r.id}`, text: ratingSpeech(r) })),
  ]);
  const share = async () => {
    setSharing(true);
    try { const r = await api<{ shared_with_lecturer: boolean }>(`/assessment/${a.id}/share`, { method: "POST" }); setA({ ...a, shared_with_lecturer: r.shared_with_lecturer }); }
    catch (e) { setError((e as Error).message); } finally { setSharing(false); }
  };

  return (
    <div className="space-y-6 fade-in">
      <PageHeader title={`${a.assignment.title} · Round ${a.draft.round_number}`}
        eyebrow={<><ModeBadge mode={a.mode} model={a.model_name} />{a.is_demo && <DemoTag />}<span className="chip bg-surface2 text-muted">A{a.assignment.number} · {a.assignment.module_name}</span></>}
        subtitle={a.overall_summary}
        actions={<>
          <button className="btn-ghost" onClick={readAll} disabled={!sp.supported}><Volume2 className="h-4 w-4" /> Read all feedback</button>
          {a.previous_assessment_id && <Link className="btn-ghost" to={`/student/compare/${a.previous_assessment_id}/${a.id}`}><GitCompareArrows className="h-4 w-4" /> Compare with previous draft</Link>}
          <Link className="btn-primary" to={`/student/edit/${a.assignment.id}${a.is_demo ? "?demo=1" : ""}`} onClick={() => demo.active && setDemo({ step: Math.max(demo.step, 5) })}><Pencil className="h-4 w-4" /> Revise my draft</Link>
        </>} />

      <Notice tone={a.mode === "simulated" ? "warn" : "info"} title={a.mode === "simulated" ? "Simulated feedback - not AI analysis" : "Estimated feedback, not an official mark"}>{a.disclaimer}</Notice>
      {a.needs_human_review && <Notice tone="warn" title="Some feedback needs human review">One or more criteria could not be fully validated (see the ⚠ notes). Check them with your lecturer before relying on them.</Notice>}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="card flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          <ScoreRing value={a.weighted_score} label="Estimated rubric performance" sub="Estimate" size={150} />
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-muted">Your estimated rubric performance</p>
            <p className="mt-1 text-sm text-muted">Weighted across {a.ratings.length} criteria · not an official grade</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {(["STRONG", "OKAY", "WEAK"] as const).map((k) => {
                const M = ratingMeta[k];
                return (
                  <div key={k} className={`rounded-xl border p-3 text-center ${M.bg} ${M.pat}`}>
                    <M.Icon className={`mx-auto h-5 w-5 ${M.text}`} aria-hidden />
                    <p className="mt-1 font-display text-2xl font-extrabold">{counts[k]}</p>
                    <p className={`text-xs font-bold uppercase ${M.text}`}>{M.label}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/student/checklist" className="btn-ghost !py-1.5"><ListChecks className="h-4 w-4" /> Improvement checklist</Link>
              {a.assignment.module_id && (
                <button className="btn-ghost !py-1.5" onClick={share} disabled={sharing} aria-pressed={a.shared_with_lecturer}>
                  <Share2 className="h-4 w-4" /> {a.shared_with_lecturer ? "Shared with lecturer (undo)" : "Ask lecturer to review"}
                </button>
              )}
            </div>
          </div>
        </div>
        {a.quality && <QualityCard q={a.quality} mode={a.mode} />}
      </div>

      {a.lecturer_review && (
        <section className="card p-5">
          <h2 className="text-lg font-extrabold">Lecturer review</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {a.lecturer_review.items.map((it) => {
              const r = a.ratings.find((x) => x.id === it.rating_id);
              return <li key={it.rating_id} className="flex flex-wrap items-center gap-2"><span className="font-semibold">{r?.criterion_name}</span><span className="chip bg-surface2">{it.rating}/5</span>{it.comment && <span className="text-muted">&ldquo;{it.comment}&rdquo;</span>}</li>;
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="crit-heading" className="space-y-4">
        <h2 id="crit-heading" className="text-xl font-extrabold">Criterion-by-criterion feedback</h2>
        {[...a.ratings].sort((x, y) => x.score - y.score || y.weight - x.weight).map((r) => <CriterionCard key={r.id} r={r} assessmentId={a.id} />)}
      </section>

      <WeightedTable a={a} />
      {a.quality && <Reliability q={a.quality} />}

      <details className="card p-5">
        <summary className="flex cursor-pointer items-center gap-2 font-bold"><Workflow className="h-5 w-5 text-accent" aria-hidden /> Agent workflow for this assessment</summary>
        <ol className="mt-4 space-y-2 text-sm">
          {a.pipeline_log.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              {s.status === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-strong" aria-hidden /> : <XCircle className="mt-0.5 h-4 w-4 text-weak" aria-hidden />}
              <span><b>{s.step}</b> - {s.detail} {s.ms ? <span className="text-muted">({s.ms} ms)</span> : null}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
