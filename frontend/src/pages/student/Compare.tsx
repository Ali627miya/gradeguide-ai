import { ArrowRight, GraduationCap, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DemoTag, ErrorBox, Loading, Notice, PageHeader, RatingBadge, ScoreRing } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useDemo } from "../../context/DemoContext";
import { useSettings } from "../../context/SettingsContext";
import { api } from "../../lib/api";
import type { Comparison } from "../../lib/types";

export function ComparisonView({ c }: { c: Comparison }) {
  const { settings } = useSettings();
  const data = c.rows.map((r) => ({ name: r.to_criterion.replace(" & ", " &\n"), [c.kind === "draft" ? `Round ${c.from.round}` : `A${c.from.number}`]: r.from_score, [c.kind === "draft" ? `Round ${c.to.round}` : `A${c.to.number}`]: r.to_score }));
  const k1 = c.kind === "draft" ? `Round ${c.from.round}` : `A${c.from.number}`;
  const k2 = c.kind === "draft" ? `Round ${c.to.round}` : `A${c.to.number}`;
  const grid = settings.theme === "dark" ? "#28344f" : "#e2e8f0";
  return (
    <div className="space-y-6">
      {c.note && <Notice title="Different rubrics">{c.note}</Notice>}
      {c.modes_differ && <Notice tone="warn" title="Different assessment modes">One assessment was simulated and the other used live AI, so differences may partly reflect the method.</Notice>}
      <div className="card grid items-center gap-6 p-6 md:grid-cols-[1fr_auto_1fr_1.2fr]">
        <div className="text-center"><ScoreRing value={c.from.weighted_score} sub={k1} size={120} /><p className="mt-2 text-sm text-muted">{c.from.title}</p></div>
        <ArrowRight className="mx-auto h-8 w-8 text-muted" aria-hidden />
        <div className="text-center"><ScoreRing value={c.to.weighted_score} sub={k2} size={120} /><p className="mt-2 text-sm text-muted">{c.to.title}</p></div>
        <div className="rounded-xl bg-surface2 p-4">
          {c.weighted_delta !== null ? (
            <>
              <p className="text-xs font-bold uppercase tracking-widest text-muted">Weighted score change</p>
              <p className={`font-display text-4xl font-extrabold ${c.weighted_delta >= 0 ? "text-strong" : "text-weak"}`}>{c.weighted_delta >= 0 ? "+" : ""}{c.weighted_delta} pts</p>
            </>
          ) : <p className="text-sm text-muted">Overall scores are not directly comparable across different rubrics - compare matched criteria below.</p>}
          <p className="mt-2 text-sm"><b>{c.improved.length}</b> criteria improved · <b>{c.still_needs_attention.length}</b> still need attention</p>
        </div>
      </div>
      {data.length > 0 && (
        <section className="card p-6" aria-labelledby="chart-h">
          <h2 id="chart-h" className="text-lg font-extrabold">Criterion scores (out of 5)</h2>
          <div className="mt-4 h-72" role="img" aria-label={`Bar chart comparing ${k1} and ${k2} scores for each criterion`}>
            <ResponsiveContainer>
              <BarChart data={data} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgb(var(--muted))" }} interval={0} />
                <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fill: "rgb(var(--muted))" }} />
                <Tooltip contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 8 }} />
                <Legend />
                <Bar dataKey={k1} fill="rgb(var(--muted))" fillOpacity={0.55} radius={[4, 4, 0, 0]} isAnimationActive={!settings.reducedMotion} />
                <Bar dataKey={k2} fill="rgb(var(--accent))" radius={[4, 4, 0, 0]} isAnimationActive={!settings.reducedMotion} animationDuration={1200} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
      <section className="card overflow-x-auto p-6">
        <h2 className="text-lg font-extrabold">What changed</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted"><tr><th className="py-2 pr-4">Criterion</th><th className="pr-4">{k1}</th><th className="pr-4">{k2}</th><th className="pr-4">Change</th><th>What it means</th></tr></thead>
          <tbody>
            {c.rows.map((r) => (
              <tr key={r.criterion + r.to_criterion} className="border-t border-line align-top">
                <td className="py-3 pr-4 font-medium">{r.criterion}{r.basis === "related_category" && <span className="block text-xs text-muted">≈ {r.to_criterion} (partial match)</span>}</td>
                <td className="pr-4"><RatingBadge rating={r.from_rating} score={r.from_score} size="sm" /></td>
                <td className="pr-4"><RatingBadge rating={r.to_rating} score={r.to_score} size="sm" /></td>
                <td className="pr-4">
                  <span className={`inline-flex items-center gap-1 font-bold ${r.delta > 0 ? "text-strong" : r.delta < 0 ? "text-weak" : "text-muted"}`}>
                    {r.delta > 0 ? <TrendingUp className="h-4 w-4" aria-hidden /> : r.delta < 0 ? <TrendingDown className="h-4 w-4" aria-hidden /> : <Minus className="h-4 w-4" aria-hidden />}
                    {r.delta > 0 ? "+" : ""}{r.delta} <span className="sr-only">{r.status}</span>
                  </span>
                </td>
                <td className="text-muted">{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(c.unmatched_from.length > 0 || c.unmatched_to.length > 0) && (
          <div className="mt-4 rounded-lg border border-dashed border-line p-4 text-sm">
            <p className="font-semibold">Comparison unavailable for:</p>
            <ul className="mt-1 list-disc pl-5 text-muted">
              {c.unmatched_from.map((u) => <li key={"f" + u.criterion}><b>{u.criterion}</b> ({u.score}/5) - {u.reason}</li>)}
              {c.unmatched_to.map((u) => <li key={"t" + u.criterion}><b>{u.criterion}</b> ({u.score}/5) - {u.reason}</li>)}
            </ul>
          </div>
        )}
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5"><p className="flex items-center gap-2 font-bold text-strong"><TrendingUp className="h-5 w-5" aria-hidden /> Improved</p>
          <ul className="mt-2 list-disc pl-5 text-sm">{c.improved.length ? c.improved.map((x) => <li key={x}>{x}</li>) : <li className="text-muted">No criteria improved yet.</li>}</ul></div>
        <div className="card p-5"><p className="flex items-center gap-2 font-bold text-okay"><TrendingDown className="h-5 w-5 rotate-180" aria-hidden /> Still needs attention</p>
          <ul className="mt-2 list-disc pl-5 text-sm">{c.still_needs_attention.length ? c.still_needs_attention.map((x) => <li key={x}>{x}</li>) : <li className="text-muted">Nothing below "Strong" - great work.</li>}</ul></div>
      </div>
    </div>
  );
}

export default function Compare() {
  const { fromId, toId } = useParams();
  const [c, setC] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { demo, setDemo } = useDemo();
  const { login } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    api<Comparison>("/assessment/compare", { body: { from_assessment_id: Number(fromId), to_assessment_id: Number(toId) } })
      .then(setC).catch((e) => setError(e.message));
    if (demo.active && demo.step < 7) setDemo({ step: 7 });
  }, [fromId, toId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <ErrorBox message={error} />;
  if (!c) return <Loading text="Comparing drafts..." />;
  return (
    <div className="fade-in">
      <PageHeader title={c.kind === "draft" ? "Draft comparison" : "Assignment comparison"}
        subtitle={c.kind === "draft" ? `${c.to.title}: round ${c.from.round} vs round ${c.to.round}` : `A${c.from.number} ${c.from.title} vs A${c.to.number} ${c.to.title}`}
        eyebrow={demo.active ? <DemoTag /> : undefined}
        actions={<>
          <Link to="/student/progress" className="btn-ghost">Progress since Assignment 1</Link>
          <Link to={`/student/results/${c.to.assessment_id}`} className="btn-ghost">Latest feedback</Link>
          {demo.active && <button className="btn-brand" onClick={async () => { setDemo({ step: 8 }); await login("professor"); nav("/professor"); }}><GraduationCap className="h-4 w-4" /> Lecturer view (step 8)</button>}
        </>} />
      <ComparisonView c={c} />
    </div>
  );
}
