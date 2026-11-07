import { BarChart3, BookOpenCheck, GraduationCap, Lightbulb, Lock, Upload, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DemoTag, ErrorBox, Loading, Notice, Stat } from "../../components/ui";
import { useDemo } from "../../context/DemoContext";
import { api } from "../../lib/api";

export interface ModuleJson {
  id: number; code: string; name: string; analytics_enabled: boolean; min_cohort_size: number; is_demo: boolean;
  assignments: { id: number; title: string; number: number; rubric_id: number; rubric_name: string; published: boolean; description: string | null }[];
}
interface Dash {
  user: { display_name: string }; rubric_count: number; pending_reviews: number;
  modules: { module: ModuleJson; status: string; students_assessed: number | null; insights: string[]; teaching_focus: string | null; message?: string }[];
}

export default function ProfDashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { demo, setDemo } = useDemo();
  useEffect(() => {
    api<Dash>("/professor/dashboard").then(setD).catch((e) => setError(e.message));
    if (demo.active && demo.step < 8) setDemo({ step: 8 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <ErrorBox message={error} />;
  if (!d) return <Loading />;
  const assessed = d.modules.reduce((s, m) => s + (m.students_assessed || 0), 0);
  return (
    <div className="space-y-6 fade-in">
      <div className="relative overflow-hidden rounded-xl2 bg-[#0f2147] p-6 text-white md:p-8">
        <div aria-hidden className="absolute inset-0 opacity-50" style={{ background: "radial-gradient(600px 260px at 100% 0%, rgba(59,130,246,.45), transparent 60%)" }} />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div><p className="text-sm text-white/70">Lecturer dashboard</p><h1 className="font-display text-3xl font-extrabold">Welcome, {d.user.display_name}</h1>
            <p className="mt-1 text-white/75">Anonymised, aggregate insights only - you never see a student's work unless they choose to share it.</p></div>
          <div className="flex flex-wrap gap-2">
            <Link to="/professor/rubrics/import" className="btn !bg-[#2dd4bf] !text-[#04201d]"><Upload className="h-4 w-4" /> Import questions</Link>
            <Link to="/professor/analytics" className="btn !bg-white/10 !text-white hover:!bg-white/20"><BarChart3 className="h-4 w-4" /> Class analytics</Link>
          </div>
        </div>
      </div>
      <DemoTag text="Demonstration data: one demo student plus a synthetic, anonymised cohort" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Modules" value={d.modules.length} icon={<GraduationCap className="h-5 w-5 text-accent" />} />
        <Stat label="Students assessed" value={assessed} hint="Consenting students in modules above the privacy threshold" icon={<Users className="h-5 w-5 text-accent" />} />
        <Stat label="Your rubrics" value={d.rubric_count} hint={<Link className="font-semibold text-accent hover:underline" to="/professor/rubrics/report">Manage rubrics</Link>} icon={<BookOpenCheck className="h-5 w-5 text-accent" />} />
        <Stat label="Shared for review" value={d.pending_reviews} hint={<Link className="font-semibold text-accent hover:underline" to="/professor/reviews">Open queue</Link>} icon={<Lightbulb className="h-5 w-5 text-accent" />} />
      </div>
      {d.modules.map((m) => (
        <section key={m.module.id} className="card p-6" aria-labelledby={`mod-${m.module.id}`}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 id={`mod-${m.module.id}`} className="text-xl font-extrabold">MODULE: {m.module.name} <span className="text-muted">({m.module.code})</span></h2>
            {m.status === "ok" && <span className="chip bg-accent/10 text-accent">Students assessed: {m.students_assessed}</span>}
            <Link to={`/professor/analytics?module=${m.module.id}`} className="ml-auto text-sm font-semibold text-accent hover:underline">Full analytics →</Link>
          </div>
          {m.status === "ok" ? (
            <div className="mt-4 grid gap-4 md:grid-cols-[1.3fr_1fr]">
              <div><p className="text-sm font-semibold text-muted">Class-level insights</p>
                <ul className="mt-2 space-y-1.5">{m.insights.map((i) => <li key={i} className="flex gap-2"><span className="text-accent">•</span>{i}</li>)}</ul></div>
              {m.teaching_focus && <div className="rounded-xl border border-accent/40 bg-accent/5 p-4"><p className="flex items-center gap-2 font-bold text-accent"><Lightbulb className="h-4 w-4" aria-hidden /> Teaching focus</p><p className="mt-1 text-sm">{m.teaching_focus}</p></div>}
            </div>
          ) : (
            <div className="mt-4"><Notice tone="warn" icon={<Lock className="mt-0.5 h-5 w-5 shrink-0 text-okay" />} title={m.status === "suppressed" ? "Hidden to protect privacy" : "Analytics switched off"}>{m.message}</Notice></div>
          )}
        </section>
      ))}
    </div>
  );
}
