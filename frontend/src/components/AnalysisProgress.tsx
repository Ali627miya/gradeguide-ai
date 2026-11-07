import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

const STEPS = [
  "Validating the rubric",
  "Marker Agent assessing each criterion",
  "Verifying every quotation against your document",
  "Integrity Agent checking for ghost-writing",
  "Feedback-Quality Agent scoring the feedback",
];

export function AnalysisProgress({ live }: { live: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, STEPS.length - 1)), live ? 2500 : 450);
    return () => clearInterval(t);
  }, [live]);
  return (
    <div className="card mb-6 p-5 fade-in" role="status" aria-live="polite">
      <p className="font-bold">Analysing your work{live ? " (this can take 20-40 seconds)" : ""}...</p>
      <ol className="mt-3 space-y-2 text-sm">
        {STEPS.map((s, n) => (
          <li key={s} className={`flex items-center gap-2 ${n > i ? "text-muted/60" : ""}`}>
            {n < i ? <CheckCircle2 className="h-4 w-4 text-strong" aria-hidden /> : n === i ? <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden /> : <span className="h-4 w-4 rounded-full border border-line" aria-hidden />}
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
