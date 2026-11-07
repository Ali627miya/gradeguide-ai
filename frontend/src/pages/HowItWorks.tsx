import { ArrowDown, Ban, Check, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeader } from "../components/ui";
import { api } from "../lib/api";

const FLOW = [
  ["Upload", "Draft and rubric are extracted to text. Files are never stored or changed."],
  ["Rubric validation", "Up to 6 code + 6 report questions; weights must total 100%."],
  ["Marker Agent", "Rates each criterion 1-5 with an exact quote, reason, gap and coaching question."],
  ["Evidence verification", "Code checks every quote really appears in your document; unverifiable ones are flagged."],
  ["Integrity Agent", "Removes any suggested wording, paraphrase or code before you see it."],
  ["Feedback-Quality Agent", "Automated checks score how verifiable the feedback is - separate from your mark."],
  ["Coach & revise", "Socratic questions, your own plan, your own edits - then reassess and compare."],
];

export default function HowItWorks() {
  const [policy, setPolicy] = useState<{ will: string[]; will_not: string[]; limitations: string[] } | null>(null);
  useEffect(() => { api<typeof policy>("/integrity/policy").then(setPolicy).catch(() => {}); }, []);
  return (
    <div className="space-y-6 fade-in">
      <PageHeader title="How GradeGuide works" subtitle="A learning tool, not an essay-writing tool. Here is exactly what happens to your work." />
      <ol className="card space-y-1 p-6">
        {FLOW.map(([t, d], i) => (
          <li key={t}>
            <div className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 font-bold text-accent">{i + 1}</span>
              <div><p className="font-bold">{t}</p><p className="text-sm text-muted">{d}</p></div></div>
            {i < FLOW.length - 1 && <ArrowDown className="ml-2 my-1 h-4 w-4 text-muted" aria-hidden />}
          </li>
        ))}
      </ol>
      {policy && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="card p-6"><h2 className="flex items-center gap-2 font-bold text-strong"><Check className="h-5 w-5" aria-hidden /> GradeGuide will</h2>
            <ul className="mt-3 space-y-2 text-sm">{policy.will.map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-strong" aria-hidden />{x}</li>)}</ul></section>
          <section className="card p-6"><h2 className="flex items-center gap-2 font-bold text-weak"><Ban className="h-5 w-5" aria-hidden /> GradeGuide will not</h2>
            <ul className="mt-3 space-y-2 text-sm">{policy.will_not.map((x) => <li key={x} className="flex gap-2"><Ban className="mt-0.5 h-4 w-4 shrink-0 text-weak" aria-hidden />{x}</li>)}</ul></section>
          <section className="card p-6 md:col-span-2"><h2 className="flex items-center gap-2 font-bold"><ShieldCheck className="h-5 w-5 text-info" aria-hidden /> Honest limitations</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted">{policy.limitations.map((x) => <li key={x}>{x}</li>)}
              <li>Ratings are estimates. AI can misread work, and the offline simulator only measures surface signals. Your lecturer's judgement always wins.</li></ul></section>
        </div>
      )}
    </div>
  );
}
