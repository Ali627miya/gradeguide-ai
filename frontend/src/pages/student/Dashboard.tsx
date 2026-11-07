import { ArrowRight, ClipboardList, FileCheck2, Gauge, PlayCircle, Plus, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DemoTag, Empty, ErrorBox, Loading, ModeBadge, Stat, labelFor, RatingBadge } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useDemo } from "../../context/DemoContext";
import { useSettings } from "../../context/SettingsContext";
import { api } from "../../lib/api";
import type { User } from "../../lib/types";

interface Dash {
  user: { display_name: string; is_demo: boolean }; total_assessed: number; total_assessments: number; average_score: number | null;
  improvement_since_previous: number | null;
  outstanding_areas: { id: number; criterion_name: string; status: string; assignment_title: string }[];
  recent: { assessment_id: number; title: string; module_name: string; number: number; round: number; weighted_score: number; mode: string; is_demo: boolean; created_at: string }[];
  progress: { label: string; score: number; title: string }[];
}

export default function StudentDashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSettings();
  const { adopt } = useAuth();
  const { setDemo } = useDemo();
  const nav = useNavigate();
  const load = () => { setError(null); api<Dash>("/student/dashboard").then(setD).catch((e) => setError(e.message)); };
  useEffect(load, []);
  const startDemo = async () => {
    const r = await api<{ token: string; user: User; assignment_id: number; draft_id: number }>("/demo/start", { method: "POST" });
    adopt(r.token, r.user);
    setDemo({ active: true, step: 1, assignmentId: r.assignment_id, draft1Id: r.draft_id, assessment1Id: undefined, assessment2Id: undefined, minimised: false });
    nav(`/student/draft/${r.draft_id}`);
  };
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!d) return <Loading />;
  const first = d.user.display_name.split(" ")[0];
  return (
    <div className="space-y-6 fade-in">
      <div className="relative overflow-hidden rounded-xl2 bg-[#0f2147] p-6 text-white md:p-8">
        <div aria-hidden className="absolute inset-0 opacity-50" style={{ background: "radial-gradient(600px 260px at 100% 0%, rgba(45,212,191,.4), transparent 60%)" }} />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-white/70">Welcome back</p>
            <h1 className="font-display text-3xl font-extrabold">Hi {first} 👋</h1>
            <p className="mt-1 max-w-xl text-white/75">Check your draft against the rubric before you submit - then improve it yourself with the coach.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/student/new" className="btn !bg-[#2dd4bf] !px-6 !py-3.5 !text-base !text-[#04201d] hover:brightness-110"><Plus className="h-5 w-5" /> Start New Assessment</Link>
            <button onClick={startDemo} className="btn !bg-white/10 !py-3.5 !text-white hover:!bg-white/20"><PlayCircle className="h-5 w-5" /> Guided demo</button>
          </div>
        </div>
      </div>
      {d.user.is_demo && <DemoTag text="Demo account - includes a seeded Assignment 1 (demonstration data)" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Assignments assessed" value={d.total_assessed} hint={`${d.total_assessments} assessment rounds in total`} icon={<FileCheck2 className="h-5 w-5 text-accent" />} />
        <Stat label="Average rubric performance" value={d.average_score !== null ? `${Math.round(d.average_score)}%` : "-"}
          hint={d.average_score !== null ? <RatingBadge rating={labelFor(d.average_score >= 70 ? 4 : d.average_score >= 50 ? 3 : 2)} size="sm" /> : "Latest draft of each assignment"} icon={<Gauge className="h-5 w-5 text-accent" />} />
        <Stat label="Improvement across drafts" value={d.improvement_since_previous !== null ? `${d.improvement_since_previous >= 0 ? "+" : ""}${d.improvement_since_previous} pts` : "-"}
          hint="Average change from first to latest draft" icon={<TrendingUp className="h-5 w-5 text-accent" />} />
        <Stat label="Outstanding improvement areas" value={d.outstanding_areas.length} hint={<Link to="/student/checklist" className="font-semibold text-accent hover:underline">Open checklist</Link>} icon={<ClipboardList className="h-5 w-5 text-accent" />} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="card p-6" aria-labelledby="prog-h">
          <h2 id="prog-h" className="text-lg font-extrabold">Progress over time</h2>
          {d.progress.length < 2 ? <p className="mt-6 text-sm text-muted">Assess at least two drafts to see your progress line.</p> : (
            <div className="mt-4 h-64" role="img" aria-label={`Line chart of estimated scores: ${d.progress.map((p) => `${p.label} ${Math.round(p.score)}%`).join(", ")}`}>
              <ResponsiveContainer>
                <LineChart data={d.progress} margin={{ left: -20, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={settings.theme === "dark" ? "#28344f" : "#e2e8f0"} />
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: "rgb(var(--muted))" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "rgb(var(--muted))" }} />
                  <Tooltip formatter={(v: number) => `${Math.round(v)}%`} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.title ?? ""}`}
                    contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8 }} />
                  <Line type="monotone" dataKey="score" stroke="rgb(var(--accent))" strokeWidth={3} dot={{ r: 5 }} isAnimationActive={!settings.reducedMotion} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
        <section className="card p-6" aria-labelledby="areas-h">
          <h2 id="areas-h" className="text-lg font-extrabold">Focus next on</h2>
          {d.outstanding_areas.length === 0 ? <p className="mt-3 text-sm text-muted">No outstanding areas - great work.</p> : (
            <ul className="mt-3 space-y-2">
              {d.outstanding_areas.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <Link to={`/student/coach/${a.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm hover:border-accent">
                    <span><span className="font-semibold">{a.criterion_name}</span><span className="block text-xs text-muted">{a.assignment_title}</span></span>
                    <span className="chip bg-surface2 text-muted">{a.status.replace("_", " ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section aria-labelledby="recent-h">
        <h2 id="recent-h" className="mb-3 text-lg font-extrabold">Recent activity</h2>
        {d.recent.length === 0 ? <Empty title="No assessments yet" action={<Link to="/student/new" className="btn-primary">Start New Assessment</Link>}>Upload a draft and your lecturer's rubric to get started.</Empty> : (
          <div className="grid gap-3 md:grid-cols-2">
            {d.recent.map((r) => (
              <Link key={r.assessment_id} to={`/student/results/${r.assessment_id}`} className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:border-accent">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface2 font-display text-lg font-extrabold">{Math.round(r.weighted_score)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">A{r.number}: {r.title} <span className="text-muted">· round {r.round}</span></p>
                  <p className="truncate text-xs text-muted">{r.module_name} · {new Date(r.created_at).toLocaleDateString("en-GB")}</p>
                  <div className="mt-1 flex gap-1.5"><ModeBadge mode={r.mode} />{r.is_demo && <DemoTag text="Demo" />}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted" aria-hidden />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
