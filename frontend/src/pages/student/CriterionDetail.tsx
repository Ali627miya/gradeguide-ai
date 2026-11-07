import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBox, Loading, PageHeader, scoreWords } from "../../components/ui";
import { api } from "../../lib/api";
import type { Assessment } from "../../lib/types";
import { CriterionCard } from "./Results";

function highlight(text: string, quote: string) {
  if (!quote) return [text];
  const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLowerCase();
  const idx = norm(text).indexOf(norm(quote));
  if (idx < 0) return [text];
  return [text.slice(0, idx), <mark key="m" className="rounded bg-accent/25 px-0.5 text-ink ring-2 ring-accent/40">{text.slice(idx, idx + quote.length)}</mark>, text.slice(idx + quote.length)];
}

export default function CriterionDetail() {
  const { id, ratingId } = useParams();
  const [a, setA] = useState<Assessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Assessment>(`/assessment/${id}`).then(setA).catch((e) => setError(e.message)); }, [id]);
  const r = useMemo(() => a?.ratings.find((x) => String(x.id) === ratingId), [a, ratingId]);
  const pc = a?.quality?.per_criterion?.find((p) => p.criterion === r?.criterion_name);
  useEffect(() => {
    const t = setTimeout(() => document.querySelector("mark")?.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
    return () => clearTimeout(t);
  }, [r]);

  if (error) return <ErrorBox message={error} />;
  if (!a) return <Loading />;
  if (!r) return <ErrorBox message="That criterion was not found in this assessment." />;
  return (
    <div className="space-y-6 fade-in">
      <Link to={`/student/results/${a.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"><ArrowLeft className="h-4 w-4" /> Back to all feedback</Link>
      <PageHeader title={r.criterion_name} subtitle={`${a.assignment.title} · Round ${a.draft.round_number}`} />
      <CriterionCard r={r} assessmentId={a.id} />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="card p-5" aria-label="Where the evidence appears in your draft">
          <h2 className="font-bold">Where this appears in your draft</h2>
          <p className="sub">The highlighted text is the quotation used as evidence. Your draft is shown read-only - it is never changed.</p>
          <div className="mt-3 max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-lg bg-surface2/60 p-4 font-[Georgia,serif] text-[15px] leading-relaxed">
            {highlight(a.draft.text || "", r.evidence_quote)}
          </div>
        </section>
        <aside className="space-y-4">
          <div className="card p-5 text-sm">
            <h2 className="font-bold">Rating scale</h2>
            <ol className="mt-2 space-y-1">
              {[5, 4, 3, 2, 1].map((n) => (
                <li key={n} className={`flex justify-between rounded px-2 py-1 ${n === r.score ? "bg-accent/15 font-bold" : ""}`}>
                  <span>{n} - {scoreWords[n]}</span><span className="text-muted">{n >= 4 ? "Strong" : n === 3 ? "Okay" : "Weak"}</span>
                </li>
              ))}
            </ol>
          </div>
          {pc && (
            <div className="card p-5 text-sm">
              <h2 className="font-bold">Validation checks</h2>
              <ul className="mt-2 space-y-1 text-muted">
                <li>Quote status: <b className="text-ink">{pc.quote_status}</b></li>
                <li>Uses rubric language: <b className="text-ink">{pc.aligned ? "yes" : "no"}</b></li>
                <li>Reasoning checks: <b className="text-ink">{pc.reasoning_checks_passed}</b></li>
                <li>Relevance checks: <b className="text-ink">{pc.relevance_checks_passed}</b></li>
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
