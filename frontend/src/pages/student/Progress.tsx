import { Flag, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DemoTag, Empty, ErrorBox, Loading, PageHeader } from "../../components/ui";
import { api } from "../../lib/api";
import type { Comparison } from "../../lib/types";
import { ComparisonView } from "./Compare";

interface ModuleProgress {
  module: string; comparison_unavailable: string | null; comparisons: Comparison[];
  assignments: { assessment_id: number; title: string; number: number; weighted_score: number; mode: string; round: number; is_demo: boolean; created_at: string }[];
}

export default function Progress() {
  const [data, setData] = useState<ModuleProgress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<ModuleProgress[]>("/student/progress").then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;
  return (
    <div className="space-y-8 fade-in">
      <PageHeader title="Progress across assignments" subtitle="How the improvement areas from earlier assignments in a module changed in later ones. Criteria are matched only when they assess the same skill." />
      {data.length === 0 && <Empty title="Nothing to compare yet" action={<Link to="/student/new" className="btn-primary">Start New Assessment</Link>}>Assess assignments in the same module to track your progress.</Empty>}
      {data.map((m) => (
        <section key={m.module} className="space-y-4" aria-label={`Module ${m.module}`}>
          <h2 className="text-xl font-extrabold">{m.module}</h2>
          <ol className="card flex flex-col gap-0 p-5 md:flex-row" aria-label="Assignment timeline">
            {m.assignments.map((a, i) => (
              <li key={a.assessment_id} className="relative flex flex-1 items-start gap-3 pb-4 md:flex-col md:pb-0 md:pr-4">
                <div className="flex items-center gap-3 md:w-full">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accentink">A{a.number}</span>
                  {i < m.assignments.length - 1 && <span className="hidden h-0.5 flex-1 bg-line md:block" aria-hidden />}
                </div>
                <div>
                  <Link to={`/student/results/${a.assessment_id}`} className="font-semibold hover:text-accent">{a.title}</Link>
                  <p className="text-sm text-muted">Latest round {a.round} · {Math.round(a.weighted_score)}% estimate · {new Date(a.created_at).toLocaleDateString("en-GB")}</p>
                  {a.is_demo && <DemoTag text="Demo" />}
                </div>
              </li>
            ))}
          </ol>
          {m.comparison_unavailable && <p className="text-sm text-muted">{m.comparison_unavailable}</p>}
          {m.comparisons.map((c) => (
            <div key={`${c.from.assessment_id}-${c.to.assessment_id}`} className="space-y-4">
              <div className="card space-y-2 p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-muted">Since Assignment {c.from.number}</p>
                {c.rows.filter((r) => r.delta > 0).map((r) => <p key={r.criterion} className="flex gap-2 font-medium"><TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-strong" aria-hidden />{r.message}</p>)}
                {c.rows.filter((r) => r.delta <= 0 && r.to_score <= 3).map((r) => <p key={r.criterion} className="flex gap-2 font-medium"><Flag className="mt-0.5 h-5 w-5 shrink-0 text-okay" aria-hidden />{r.message}</p>)}
                {c.unmatched_from.filter((u) => u.score <= 2).map((u) => <p key={u.criterion} className="flex gap-2 font-medium"><Flag className="mt-0.5 h-5 w-5 shrink-0 text-okay" aria-hidden />{u.criterion} was weak in Assignment {c.from.number} ({u.score}/5) and isn't assessed separately in Assignment {c.to.number} - it remains an area to focus on.</p>)}
              </div>
              <ComparisonView c={c} />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
