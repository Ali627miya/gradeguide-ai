import { BadgeCheck, ShieldAlert } from "lucide-react";
import type { Quality } from "../lib/types";
import { Bar, DemoTag, SpeakButton } from "./ui";

const ORDER = ["evidence_accuracy", "rubric_alignment", "reasoning_quality", "feedback_relevance", "integrity_compliance"];

export function QualityCard({ q, mode }: { q: Quality; mode: string }) {
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-1 bg-info" aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-info">AI feedback quality</p>
          <p className="text-xs text-muted">How trustworthy is <i>our</i> feedback - not your mark</p>
        </div>
        <BadgeCheck className="h-6 w-6 text-info" aria-hidden />
      </div>
      <p className="mt-3 font-display text-5xl font-extrabold">{Math.round(q.overall)}<span className="text-xl text-muted">/100</span></p>
      {(q.is_demonstration || mode === "simulated") && <div className="mt-2"><DemoTag text={q.is_demonstration ? "Demonstration result" : "Simulated feedback"} /></div>}
      <ul className="mt-4 space-y-2.5">
        {ORDER.map((k) => (
          <li key={k}>
            <div className="mb-1 flex justify-between text-xs"><span className="font-medium">{q.labels?.[k] ?? k}</span><span className="font-bold">{q.scores[k]}/5</span></div>
            <Bar value={q.scores[k]} max={5} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Reliability({ q }: { q: Quality }) {
  const text = `How reliable is this feedback? ${q.disclaimer} ${ORDER.map((k) => `${q.labels?.[k]}: ${q.scores[k]} out of 5. ${q.explanations?.[k] ?? ""}`).join(" ")}`;
  return (
    <section className="card p-6" aria-labelledby="reliability">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-info" aria-hidden />
        <h2 id="reliability" className="text-xl font-extrabold">How reliable is this feedback?</h2>
        <span className="ml-auto"><SpeakButton id="reliability" text={text} /></span>
      </div>
      <p className="mt-2 text-sm text-muted">{q.disclaimer}</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {ORDER.map((k) => (
          <div key={k} className="rounded-xl border border-line p-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{q.labels?.[k]} <span className="text-xs font-normal text-muted">· weight {q.weights?.[k]}%</span></p>
              <span className="chip bg-info/10 text-info">{q.scores[k]}/5</span>
            </div>
            <p className="mt-1 text-sm text-muted">{q.explanations?.[k]}</p>
          </div>
        ))}
        <div className="rounded-xl border border-dashed border-line p-4 text-sm">
          <p className="font-semibold">In plain English</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
            <li>Every quote was matched against your document by code, not by the AI.</li>
            <li>The AI never scores itself - these numbers come from automated checks.</li>
            <li>A high score means the feedback is consistent and verifiable, not that every rating is correct.</li>
            <li>If something looks wrong, trust your lecturer and the module handbook over this tool.</li>
          </ul>
        </div>
      </div>
      {q.caps?.length > 0 && <ul className="mt-4 space-y-1 text-xs text-muted">{q.caps.map((c) => <li key={c}>• {c}</li>)}</ul>}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold text-accent">Per-criterion validation checks</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted"><tr><th className="py-2 pr-4">Criterion</th><th className="pr-4">Quote</th><th className="pr-4">Rubric-aligned</th><th className="pr-4">Reasoning</th><th>Relevance</th></tr></thead>
            <tbody>
              {q.per_criterion?.map((p) => (
                <tr key={p.criterion} className="border-t border-line">
                  <td className="py-2 pr-4 font-medium">{p.criterion}</td><td className="pr-4">{p.quote_status}</td>
                  <td className="pr-4">{p.aligned ? "Yes" : "No"}</td><td className="pr-4">{p.reasoning_checks_passed}</td><td>{p.relevance_checks_passed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
