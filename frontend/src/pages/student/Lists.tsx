// Assignments, History and Improvement Checklist pages.
import { CheckCircle2, Circle, CircleDot, MessageCircleQuestion, Pencil, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DemoTag, Empty, ErrorBox, Loading, ModeBadge, PageHeader, RatingBadge } from "../../components/ui";
import { api } from "../../lib/api";
import type { AssignmentSummary, ImprovementArea, RatingLabel } from "../../lib/types";

export function Assignments() {
  const [rows, setRows] = useState<AssignmentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<AssignmentSummary[]>("/student/assignments").then(setRows).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorBox message={error} />;
  if (!rows) return <Loading />;
  return (
    <div className="fade-in">
      <PageHeader title="My assignments" subtitle="Assignments your lecturers published in GradeGuide, plus any you added yourself."
        actions={<Link to="/student/new" className="btn-primary">Start New Assessment</Link>} />
      {rows.length === 0 && <Empty title="No assignments yet" />}
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((a) => {
          const latest = a.assessments[a.assessments.length - 1];
          return (
            <article key={a.id} className="card flex flex-col p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip bg-accent/10 text-accent">Assignment {a.number}</span>
                {a.published ? <span className="chip bg-surface2 text-muted">Published by lecturer</span> : <span className="chip bg-surface2 text-muted">Added by you</span>}
                {a.is_demo && <DemoTag text="Demo" />}
              </div>
              <h2 className="mt-2 text-lg font-bold">{a.title}</h2>
              <p className="text-sm text-muted">{a.module_name}</p>
              {a.description && <p className="mt-2 text-sm">{a.description}</p>}
              <p className="mt-3 text-sm text-muted">{a.drafts.length} draft(s) · {latest ? `latest estimate ${Math.round(latest.weighted_score)}%` : "not assessed yet"}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                {latest && <Link to={`/student/results/${latest.id}`} className="btn-primary !py-1.5">Latest feedback</Link>}
                {a.drafts.length > 0
                  ? <Link to={`/student/edit/${a.id}`} className="btn-ghost !py-1.5"><Pencil className="h-4 w-4" /> Revise</Link>
                  : <Link to={`/student/new?assignment=${a.id}`} className="btn-ghost !py-1.5"><Upload className="h-4 w-4" /> Upload draft</Link>}
                <Link to={`/student/rubric/${a.rubric_id}`} className="btn-ghost !py-1.5">Rubric</Link>
                {a.assessments.length > 1 && <Link to={`/student/compare/${a.assessments[0].id}/${latest.id}`} className="btn-ghost !py-1.5">Compare drafts</Link>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

interface Hist { assessment_id: number; title: string; module_name: string; number: number; round: number; weighted_score: number; mode: string; is_demo: boolean; needs_human_review: boolean; created_at: string; ratings: { criterion: string; rating: RatingLabel; score: number }[] }

export function History() {
  const [rows, setRows] = useState<Hist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Hist[]>("/student/history").then(setRows).catch((e) => setError(e.message)); }, []);
  if (error) return <ErrorBox message={error} />;
  if (!rows) return <Loading />;
  return (
    <div className="fade-in">
      <PageHeader title="Assignment history" subtitle="Every assessment you have run, newest first." />
      {rows.length === 0 && <Empty title="No history yet" action={<Link to="/student/new" className="btn-primary">Start New Assessment</Link>} />}
      <ol className="space-y-3">
        {rows.map((h) => (
          <li key={h.assessment_id} className="card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-2xl font-extrabold">{Math.round(h.weighted_score)}%</span>
              <div className="min-w-0 flex-1">
                <Link to={`/student/results/${h.assessment_id}`} className="font-semibold hover:text-accent">A{h.number}: {h.title} · round {h.round}</Link>
                <p className="text-xs text-muted">{h.module_name} · {new Date(h.created_at).toLocaleString("en-GB")}</p>
              </div>
              <ModeBadge mode={h.mode} />{h.is_demo && <DemoTag text="Demo" />}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {h.ratings.map((r) => <span key={r.criterion} className="flex items-center gap-1.5 text-xs"><span className="text-muted">{r.criterion}</span><RatingBadge rating={r.rating} score={r.score} size="sm" /></span>)}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const STATUS = {
  open: { label: "To do", Icon: Circle, cls: "text-muted" },
  in_progress: { label: "In progress", Icon: CircleDot, cls: "text-okay" },
  completed: { label: "Completed", Icon: CheckCircle2, cls: "text-strong" },
} as const;

export function Checklist() {
  const [rows, setRows] = useState<ImprovementArea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { api<ImprovementArea[]>("/student/improvements").then(setRows).catch((e) => setError(e.message)); }, []);
  const setStatus = async (a: ImprovementArea, status: ImprovementArea["status"]) => {
    try {
      const upd = await api<ImprovementArea>(`/student/improvements/${a.id}`, { method: "PATCH", body: { status } });
      setRows((rs) => rs!.map((r) => (r.id === a.id ? upd : r)));
    } catch (e) { setError((e as Error).message); }
  };
  if (error && !rows) return <ErrorBox message={error} />;
  if (!rows) return <Loading />;
  const latestByAssignment = new Map<number, number>();
  rows.forEach((r) => latestByAssignment.set(r.assignment_id, Math.max(latestByAssignment.get(r.assignment_id) ?? 0, r.assessment_id)));
  const visible = showAll ? rows : rows.filter((r) => latestByAssignment.get(r.assignment_id) === r.assessment_id);
  const groups = new Map<string, ImprovementArea[]>();
  visible.forEach((r) => { const k = `${r.assignment_title} · round ${r.round}`; groups.set(k, [...(groups.get(k) || []), r]); });
  const done = visible.filter((r) => r.status === "completed").length;
  return (
    <div className="fade-in">
      <PageHeader title="Improvement checklist" subtitle={`${done} of ${visible.length} improvement areas completed. Each one comes from a criterion rated Okay or Weak.`}
        actions={<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show earlier rounds</label>} />
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}
      {visible.length === 0 && <Empty title="Nothing to improve yet">Run an assessment and your improvement areas will appear here.</Empty>}
      <div className="space-y-6">
        {[...groups.entries()].map(([g, items]) => (
          <section key={g} className="card p-5" aria-label={g}>
            <h2 className="flex items-center gap-2 font-bold">{g}{items[0].is_demo && <DemoTag text="Demo" />}</h2>
            <ul className="mt-3 divide-y divide-line">
              {items.map((a) => {
                const S = STATUS[a.status];
                return (
                  <li key={a.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center">
                    <div className="flex flex-1 items-start gap-3">
                      <S.Icon className={`mt-0.5 h-5 w-5 shrink-0 ${S.cls}`} aria-hidden />
                      <div>
                        <p className={`font-semibold ${a.status === "completed" ? "line-through opacity-70" : ""}`}>{a.criterion_name} {a.rating && <RatingBadge rating={a.rating} score={a.score ?? undefined} size="sm" />}</p>
                        <p className="text-sm text-muted">{a.coaching_question}</p>
                        {a.student_plan && <p className="mt-1 text-sm"><b>My plan:</b> {a.student_plan}</p>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`st-${a.id}`}>Status for {a.criterion_name}</label>
                      <select id={`st-${a.id}`} className="input !w-auto !py-1.5" value={a.status} onChange={(e) => setStatus(a, e.target.value as ImprovementArea["status"])}>
                        <option value="open">To do</option><option value="in_progress">In progress</option><option value="completed">Completed</option>
                      </select>
                      <Link to={`/student/coach/${a.id}`} className="btn-ghost !py-1.5"><MessageCircleQuestion className="h-4 w-4" /> Coach</Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
