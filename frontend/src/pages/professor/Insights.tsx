import { Lightbulb, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { DemoTag, ErrorBox, Loading, PageHeader } from "../../components/ui";
import { GateNotice, useModuleAnalytics } from "./Analytics";

const ACTIVITIES: [RegExp, string][] = [
  [/evidence|research/i, "Run a 15-minute workshop on finding a peer-reviewed source and linking it to a specific claim."],
  [/referenc/i, "Share a one-page referencing guide and a 'spot the missing citation' exercise."],
  [/critical|evaluat/i, "Model a 'limitations and trade-offs' paragraph structure using an anonymised example."],
  [/method/i, "Ask pairs to defend their tool choice against one alternative in two minutes."],
  [/test/i, "Live-code a test for an edge case and invalid input, then let students extend it."],
  [/structure|readab|present/i, "Show how headings and topic sentences let a reader skim the argument."],
  [/error/i, "Demonstrate input validation and helpful error messages on a broken example."],
  [/problem|objective/i, "Ask students to write their objectives as checkable statements before drafting."],
];
const activityFor = (c: string) => ACTIVITIES.find(([re]) => re.test(c))?.[1] ?? "Discuss what a strong answer to this criterion looks like, with an exemplar.";

export default function ProfInsights() {
  const { data, error, picker, mods } = useModuleAnalytics();
  if (error) return <ErrorBox message={error} />;
  if (!mods || (!data && mods.length)) return <Loading />;
  return (
    <div className="space-y-6 fade-in">
      <PageHeader title="Teaching insights" subtitle="Where the class most needs support, turned into suggestions for your next session."
        eyebrow={data?.module.is_demo ? <DemoTag text="Demonstration data" /> : undefined} actions={picker} />
      {data && data.status !== "ok" && <GateNotice d={data} />}
      {data?.status === "ok" && (
        <>
          {data.teaching_focus && (
            <div className="rounded-xl2 border border-accent/40 bg-accent/10 p-6">
              <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-accent"><Target className="h-4 w-4" aria-hidden /> Suggested teaching focus</p>
              <p className="mt-2 font-display text-xl font-bold">{data.teaching_focus}</p>
            </div>
          )}
          <ul className="space-y-2">{data.insights?.map((i) => <li key={i} className="card p-4 font-medium">{i}</li>)}</ul>
          <div className="grid gap-4 md:grid-cols-3">
            {data.criteria?.slice(0, 3).map((c, i) => (
              <article key={c.criterion} className="card p-5">
                <p className="text-xs font-bold uppercase tracking-widest text-muted">Priority {i + 1}</p>
                <h2 className="mt-1 text-lg font-bold">{c.criterion}</h2>
                <p className="text-sm text-muted">{c.needs_improvement_pct}% not yet strong · average {c.average}/5</p>
                <p className="mt-3 flex gap-2 text-sm"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />{activityFor(c.criterion)}</p>
              </article>
            ))}
          </div>
          <p className="text-sm text-muted">Insights are generated from anonymised aggregates only. <Link to="/professor/analytics" className="font-semibold text-accent">See the full analytics</Link>.</p>
        </>
      )}
    </div>
  );
}
