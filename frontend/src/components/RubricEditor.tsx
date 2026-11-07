import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import type { Question } from "../lib/types";

export const blankQuestion = (section: "code" | "report"): Question => ({ section, text: "", short_name: "", category: "", weight: 0 });

export function totalWeight(qs: Question[]) { return Math.round(qs.reduce((s, q) => s + (Number(q.weight) || 0), 0) * 100) / 100; }

export function rubricErrors(qs: Question[], max = 6): string[] {
  const e: string[] = [];
  if (!qs.length) e.push("Add at least one question.");
  (["code", "report"] as const).forEach((s) => { const n = qs.filter((q) => q.section === s).length; if (n > max) e.push(`The ${s} section has ${n} questions (maximum ${max}).`); });
  qs.forEach((q, i) => { if ((q.text || "").trim().length < 5) e.push(`Question ${i + 1} needs text.`); if (!(Number(q.weight) > 0)) e.push(`Question ${i + 1} needs a weight above 0%.`); });
  const t = totalWeight(qs);
  if (Math.abs(t - 100) > 0.01) e.push(`Weights must add up to 100% (currently ${t}%).`);
  return e;
}

export function WeightMeter({ qs }: { qs: Question[] }) {
  const t = totalWeight(qs), ok = Math.abs(t - 100) <= 0.01;
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${ok ? "border-strong/40 bg-strong/10 text-strong" : "border-okay/40 bg-okay/10 text-okay"}`} role="status" aria-live="polite">
      {ok ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
      Total weight: {t}% {ok ? "- valid" : "- must equal 100%"}
    </div>
  );
}

interface Props { questions: Question[]; onChange: (qs: Question[]) => void; sections?: ("code" | "report")[]; max?: number }

export function RubricEditor({ questions, onChange, sections = ["code", "report"], max = 6 }: Props) {
  const upd = (idx: number, patch: Partial<Question>) => onChange(questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-6">
      {sections.map((sec) => {
        const items = questions.map((q, i) => ({ q, i })).filter((x) => x.q.section === sec);
        return (
          <fieldset key={sec} className="rounded-xl border border-line p-4">
            <legend className="px-2 font-display font-bold">{sec === "code" ? "A. Code assessment" : "B. Report assessment"} <span className="text-sm font-normal text-muted">({items.length}/{max} questions)</span></legend>
            {items.length === 0 && <p className="text-sm text-muted">No {sec} questions.</p>}
            <ol className="space-y-3">
              {items.map(({ q, i }, n) => (
                <li key={i} className="grid gap-2 rounded-lg bg-surface2/60 p-3 md:grid-cols-[2rem_1fr_9rem_6.5rem_2.5rem] md:items-start">
                  <span className="pt-2 text-sm font-bold text-muted">{n + 1}.</span>
                  <div>
                    <label className="sr-only" htmlFor={`qt-${i}`}>Question {n + 1} text</label>
                    <textarea id={`qt-${i}`} className="input min-h-[42px]" rows={2} maxLength={300} value={q.text} placeholder="e.g. Does the code handle invalid input?"
                      onChange={(e) => upd(i, { text: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted" htmlFor={`qs-${i}`}>Short name</label>
                    <input id={`qs-${i}`} className="input !py-1.5" maxLength={60} value={q.short_name} placeholder="Auto" onChange={(e) => upd(i, { short_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-muted" htmlFor={`qw-${i}`}>Weight %</label>
                    <input id={`qw-${i}`} type="number" min={0} max={100} step={1} className="input !py-1.5" value={q.weight}
                      onChange={(e) => upd(i, { weight: Number(e.target.value) })} />
                  </div>
                  <button type="button" className="mt-5 rounded-lg p-2 text-muted hover:bg-weak/10 hover:text-weak" aria-label={`Remove question ${n + 1}`}
                    onClick={() => onChange(questions.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ol>
            <button type="button" className="btn-ghost mt-3 !py-1.5" disabled={items.length >= max} onClick={() => onChange([...questions, { ...questions.length ? blankQuestion(sec) : blankQuestion(sec) }])}>
              <Plus className="h-4 w-4" /> Add {sec} question {items.length >= max && `(max ${max})`}
            </button>
          </fieldset>
        );
      })}
      <WeightMeter qs={questions} />
    </div>
  );
}
