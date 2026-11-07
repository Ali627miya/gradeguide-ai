import { ChevronDown, ChevronUp, Compass, X } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useDemo } from "../context/DemoContext";
import { api } from "../lib/api";
import type { Assessment } from "../lib/types";

export const DEMO_STEPS = [
  { title: "Open the weak assignment", body: "This is a fictional student's first draft of a Software Engineering testing report, with deliberate weaknesses." },
  { title: "Click “Analyse My Work”", body: "The Marker, Integrity and Feedback-Quality agents run in sequence against the lecturer's six-question rubric." },
  { title: "Marker finds the weaknesses", body: "Every rating links to a rubric criterion and quotes the student's own words - each quote is checked against the document." },
  { title: "The Coach asks questions", body: "Try asking it to rewrite the introduction - the Integrity Agent will refuse and ask a guiding question instead." },
  { title: "The student makes changes", body: "The student edits their own draft. Nothing is rewritten by the AI. For the demo, load the student's own revised version." },
  { title: "Submit the improved version", body: "Round 2 is genuinely re-assessed - no results are hard-coded." },
  { title: "From mostly red to mostly green", body: "Compare both rounds criterion by criterion, plus progress since Assignment 1 (which used a different rubric)." },
  { title: "Lecturer: anonymised insights", body: "Switch to the lecturer view to see class-level trends with privacy thresholds - no individual submissions." },
];

export function DemoGuide() {
  const { demo, setDemo, endDemo } = useDemo();
  const { login } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!demo.active) return null;
  const step = Math.min(Math.max(demo.step, 1), 8);
  const s = DEMO_STEPS[step - 1];

  const go = async (n: number) => {
    setBusy(true);
    try {
      setDemo({ step: n });
      if (n <= 2 && demo.draft1Id) nav(`/student/draft/${demo.draft1Id}`);
      else if (n === 3 && demo.assessment1Id) nav(`/student/results/${demo.assessment1Id}`);
      else if (n === 4 && demo.assessment1Id) {
        const a = await api<Assessment>(`/assessment/${demo.assessment1Id}`);
        const area = a.ratings.find((r) => r.category === "evidence" && r.improvement_area_id) || a.ratings.find((r) => r.improvement_area_id);
        if (area) nav(`/student/coach/${area.improvement_area_id}`);
      } else if ((n === 5 || n === 6) && demo.assignmentId) nav(`/student/edit/${demo.assignmentId}?demo=1`);
      else if (n === 7 && demo.assessment1Id && demo.assessment2Id) nav(`/student/compare/${demo.assessment1Id}/${demo.assessment2Id}`);
      else if (n === 8) { await login("professor"); nav("/professor"); }
    } finally { setBusy(false); }
  };
  const canGo = (n: number) =>
    n <= 2 ? !!demo.draft1Id : n <= 5 ? !!demo.assessment1Id : n === 6 ? !!demo.assessment1Id : n === 7 ? !!demo.assessment2Id : !!demo.assessment2Id;

  return (
    <aside aria-label="Guided demo" className="fixed bottom-4 right-4 z-30 w-[min(380px,calc(100vw-2rem))] fade-in">
      <div className="card overflow-hidden border-accent/50 shadow-2xl">
        <div className="flex items-center gap-2 bg-[#0f2147] px-4 py-2.5 text-white">
          <Compass className="h-4 w-4 text-[#2dd4bf]" aria-hidden />
          <span className="text-sm font-bold">Guided demo · step {step} of 8</span>
          <button className="ml-auto rounded p-1 hover:bg-white/10" onClick={() => setDemo({ minimised: !demo.minimised })}
            aria-label={demo.minimised ? "Expand demo guide" : "Minimise demo guide"} aria-expanded={!demo.minimised}>
            {demo.minimised ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button className="rounded p-1 hover:bg-white/10" onClick={endDemo} aria-label="End guided demo"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex gap-1 px-4 pt-3" aria-hidden>
          {DEMO_STEPS.map((_, i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? "bg-accent" : "bg-surface2"}`} />)}
        </div>
        {!demo.minimised && (
          <div className="p-4 pt-3" aria-live="polite">
            <p className="font-display font-bold">{s.title}</p>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
            <div className="mt-3 flex items-center gap-2">
              <button className="btn-ghost !px-3 !py-1.5" disabled={step === 1 || busy} onClick={() => go(step - 1)}>Back</button>
              {step < 8 ? (
                <button className="btn-primary !py-1.5 ml-auto" disabled={busy || !canGo(step + 1)} onClick={() => go(step + 1)}
                  title={!canGo(step + 1) ? "Complete this step on the page first" : undefined}>
                  {canGo(step + 1) ? "Next step" : "Do this step on the page"}
                </button>
              ) : (
                <button className="btn-primary !py-1.5 ml-auto" onClick={() => { endDemo(); }}>Finish demo</button>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
