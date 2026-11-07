import { Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DemoTag, ErrorBox, Loading, Notice, PageHeader } from "../../components/ui";
import { useSettings } from "../../context/SettingsContext";
import { api } from "../../lib/api";

export interface Analytics {
  module: { id: number; code: string; name: string; is_demo: boolean; analytics_enabled: boolean; min_cohort_size: number };
  status: "ok" | "suppressed" | "consent_required"; message?: string; students_assessed?: number | null; privacy_note?: string;
  criteria?: { criterion: string; section: string; n: number | string; average: number; needs_improvement_pct: number; weak_pct: number; okay_pct: number; strong_pct: number }[];
  trends?: { assignment: string; status: string; students?: number; avg_first_draft?: number; avg_latest_draft?: number; revised_pct?: number }[];
  insights?: string[]; teaching_focus?: string | null;
}

export function useModuleAnalytics() {
  const [params, setParams] = useSearchParams();
  const [mods, setMods] = useState<{ id: number; code: string; name: string }[] | null>(null);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const moduleId = Number(params.get("module")) || mods?.[0]?.id;
  useEffect(() => { api<{ id: number; code: string; name: string }[]>("/professor/modules").then(setMods).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!moduleId) return;
    setData(null);
    api<Analytics>(`/professor/analytics?module_id=${moduleId}`).then(setData).catch((e) => setError(e.message));
  }, [moduleId]);
  const picker = mods && (
    <div><label htmlFor="mod" className="sr-only">Module</label>
      <select id="mod" className="input !w-auto" value={moduleId ?? ""} onChange={(e) => setParams({ module: e.target.value })}>
        {mods.map((m) => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}
      </select></div>
  );
  return { data, error, picker, mods };
}

export function GateNotice({ d }: { d: Analytics }) {
  return (
    <Notice tone="warn" icon={<Lock className="mt-0.5 h-5 w-5 shrink-0 text-okay" />} title={d.status === "suppressed" ? "Hidden to protect student privacy" : "Analytics are switched off for this module"}>
      {d.message} {d.status === "consent_required" && <Link to="/professor/modules" className="font-semibold text-accent">Change consent settings</Link>}
    </Notice>
  );
}

export default function ProfAnalytics() {
  const { data, error, picker, mods } = useModuleAnalytics();
  const { settings } = useSettings();
  if (error) return <ErrorBox message={error} />;
  if (!mods || (!data && mods.length)) return <Loading text="Aggregating anonymised results..." />;
  const grid = settings.theme === "dark" ? "#28344f" : "#e2e8f0";
  const tick = { fontSize: 12, fill: "rgb(var(--muted))" };
  return (
    <div className="space-y-6 fade-in">
      <PageHeader title="Class performance analytics" subtitle="Aggregated, anonymised results per rubric criterion (latest draft of each consenting student)."
        eyebrow={data?.module.is_demo ? <DemoTag text="Demonstration data · synthetic cohort" /> : undefined} actions={picker} />
      {data && data.status !== "ok" && <GateNotice d={data} />}
      {data?.status === "ok" && data.criteria && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="chip bg-accent/10 text-accent">Students assessed: {data.students_assessed}</span>
            <span className="flex items-center gap-1.5 text-sm text-muted"><ShieldCheck className="h-4 w-4 text-strong" aria-hidden />{data.privacy_note}</span>
          </div>
          <section className="card p-6" aria-labelledby="dist-h">
            <h2 id="dist-h" className="text-lg font-extrabold">Rating distribution by criterion</h2>
            <p className="sub">Percent of students rated Weak (1-2), Okay (3) or Strong (4-5).</p>
            <div className="mt-4" style={{ height: Math.max(280, data.criteria.length * 34) }} role="img"
              aria-label={data.criteria.map((c) => `${c.criterion}: ${c.weak_pct}% weak, ${c.okay_pct}% okay, ${c.strong_pct}% strong`).join("; ")}>
              <ResponsiveContainer>
                <BarChart data={data.criteria} layout="vertical" margin={{ left: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} unit="%" tick={tick} />
                  <YAxis type="category" dataKey="criterion" width={170} tick={tick} />
                  <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="weak_pct" name="✕ Weak" stackId="a" fill="rgb(var(--weak))" isAnimationActive={!settings.reducedMotion} />
                  <Bar dataKey="okay_pct" name="△ Okay" stackId="a" fill="rgb(var(--okay))" isAnimationActive={!settings.reducedMotion} />
                  <Bar dataKey="strong_pct" name="✓ Strong" stackId="a" fill="rgb(var(--strong))" isAnimationActive={!settings.reducedMotion} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="card overflow-x-auto p-6">
            <h2 className="text-lg font-extrabold">Common weaknesses</h2>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted"><tr><th className="py-2 pr-4">Criterion</th><th className="pr-4">Section</th><th className="pr-4">Need improvement</th><th className="pr-4">Average</th><th>Students</th></tr></thead>
              <tbody>{data.criteria.map((c) => (
                <tr key={c.criterion} className="border-t border-line"><td className="py-2 pr-4 font-medium">{c.criterion}</td><td className="pr-4 capitalize">{c.section}</td>
                  <td className="pr-4"><div className="flex items-center gap-2"><div className="h-2 w-28 overflow-hidden rounded bg-surface2"><div className="pat-weak h-full bg-weak/60" style={{ width: `${c.needs_improvement_pct}%` }} /></div>{c.needs_improvement_pct}%</div></td>
                  <td className="pr-4">{c.average}/5</td><td>{c.n}</td></tr>))}</tbody>
            </table>
          </section>
          {data.trends && (
            <section className="card p-6" aria-labelledby="tr-h">
              <h2 id="tr-h" className="text-lg font-extrabold">Improvement trends</h2>
              <p className="sub">Average estimated score on students' first draft vs their latest draft, per assignment.</p>
              <div className="mt-4 h-72" role="img" aria-label={data.trends.filter((t) => t.status === "ok").map((t) => `${t.assignment}: first ${t.avg_first_draft}%, latest ${t.avg_latest_draft}%`).join("; ")}>
                <ResponsiveContainer>
                  <BarChart data={data.trends.filter((t) => t.status === "ok")}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                    <XAxis dataKey="assignment" tick={tick} /><YAxis domain={[0, 100]} tick={tick} />
                    <Tooltip contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8 }} /><Legend />
                    <Bar dataKey="avg_first_draft" name="First draft" fill="rgb(var(--muted))" fillOpacity={0.5} radius={[4, 4, 0, 0]} isAnimationActive={!settings.reducedMotion} />
                    <Bar dataKey="avg_latest_draft" name="Latest draft" fill="rgb(var(--accent))" radius={[4, 4, 0, 0]} isAnimationActive={!settings.reducedMotion} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-muted">{data.trends.map((t) => <li key={t.assignment}>{t.assignment}: {t.status === "ok" ? `${t.revised_pct}% of students revised and reassessed their draft` : "hidden (too few students)"}</li>)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
