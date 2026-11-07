import { ArrowLeft, Bot, CheckCircle2, Pencil, Save, Send, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBox, Loading, ModeBadge, Notice, PageHeader, QuoteBlock, RatingBadge, SpeakButton } from "../../components/ui";
import { useDemo } from "../../context/DemoContext";
import { api } from "../../lib/api";
import type { RatingLabel } from "../../lib/types";

interface Msg { id: number; role: "student" | "coach"; content: string; questions: string[]; mode: string; integrity_action: string | null }
interface Convo {
  conversation_id: number; improvement_area_id: number; status: string; student_plan: string; messages: Msg[]; notice?: string | null;
  criterion: { criterion_name: string; criterion_text: string; weight: number; rating: RatingLabel; score: number; evidence_quote: string; quote_status: string; missing: string; explanation: string };
}
const SUGGESTIONS = ["Can you rewrite my introduction?", "I'm not sure which sources to use", "I think my main point is that tests catch bugs early"];

export default function Coach() {
  const { areaId } = useParams();
  const [c, setC] = useState<Convo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [plan, setPlan] = useState("");
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [assessmentId, setAssessmentId] = useState<number | null>(null);
  const [assignmentId, setAssignmentId] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { demo, setDemo } = useDemo();

  useEffect(() => {
    api<Convo>(`/coach/${areaId}`).then((r) => { setC(r); setPlan(r.student_plan); }).catch((e) => setError(e.message));
    api<{ id: number; assessment_id: number; assignment_id: number }[]>("/student/improvements").then((xs) => {
      const x = xs.find((i) => String(i.id) === areaId);
      if (x) { setAssessmentId(x.assessment_id); setAssignmentId(x.assignment_id); }
    }).catch(() => {});
    if (demo.active && demo.step < 4) setDemo({ step: 4 });
  }, [areaId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [c?.messages.length]);

  const send = async (text: string) => {
    if (!text.trim()) return;
    setSending(true); setError(null);
    try { const r = await api<Convo>("/coach/question", { body: { improvement_area_id: Number(areaId), message: text.trim() } }); setC(r); setMsg(""); }
    catch (e) { setError((e as Error).message); } finally { setSending(false); }
  };
  const savePlan = async (status?: string) => {
    try {
      await api(`/student/improvements/${areaId}`, { method: "PATCH", body: { student_plan: plan, ...(status ? { status } : {}) } });
      setC((x) => x && { ...x, status: status || (plan.trim() && x.status === "open" ? "in_progress" : x.status) });
      setSaved(status === "completed" ? "Marked as completed - nice work!" : "Plan saved.");
      setTimeout(() => setSaved(null), 2500);
    } catch (e) { setError((e as Error).message); }
  };

  if (error && !c) return <ErrorBox message={error} />;
  if (!c) return <Loading text="Opening your coaching session..." />;
  const cr = c.criterion;
  return (
    <div className="fade-in">
      {assessmentId && <Link to={`/student/results/${assessmentId}`} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"><ArrowLeft className="h-4 w-4" /> Back to feedback</Link>}
      <PageHeader title={`Coaching: ${cr.criterion_name}`} subtitle="The coach asks questions to help you improve your own work. It will never write or rewrite it for you."
        eyebrow={<RatingBadge rating={cr.rating} score={cr.score} />} />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="card flex min-h-[520px] flex-col" aria-label="Coaching conversation">
          <div className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm">
            <ShieldCheck className="h-4 w-4 text-strong" aria-hidden /><span className="text-muted">Every coach reply is checked by the Integrity Agent before you see it.</span>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
            {c.messages.map((m) => (
              <div key={m.id} className={`flex gap-3 ${m.role === "student" ? "flex-row-reverse" : ""}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.role === "coach" ? "bg-accent/15 text-accent" : "bg-surface2 text-muted"}`} aria-hidden>
                  {m.role === "coach" ? <Bot className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                </span>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${m.role === "coach" ? "bg-surface2" : "bg-accent text-accentink"}`}>
                  <p className="sr-only">{m.role === "coach" ? "Coach said:" : "You said:"}</p>
                  {m.integrity_action === "request_refused" && <p className="mb-1 flex items-center gap-1 text-xs font-bold text-okay"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Integrity Agent: request to write content declined</p>}
                  {m.integrity_action === "replaced" && <p className="mb-1 flex items-center gap-1 text-xs font-bold text-okay"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Integrity Agent replaced a reply that contained suggested wording</p>}
                  <p className="leading-relaxed">{m.content}</p>
                  {m.role === "coach" && m.questions.length > 1 && (
                    <ul className="mt-2 space-y-1 border-t border-line pt-2">
                      {m.questions.map((q) => <li key={q} className="font-medium text-accent">• {q}</li>)}
                    </ul>
                  )}
                  {m.role === "coach" && (
                    <div className="mt-2 flex items-center gap-2">
                      <SpeakButton id={`m-${m.id}`} text={m.content} label="Read this reply aloud" />
                      {m.mode !== "template" && m.mode !== "integrity" && <ModeBadge mode={m.mode} />}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && <p className="text-sm text-muted">The coach is thinking...</p>}
            <div ref={endRef} />
          </div>
          {c.notice && <div className="px-5"><Notice tone="warn">{c.notice}</Notice></div>}
          {error && <div className="px-5"><ErrorBox message={error} /></div>}
          <div className="border-t border-line p-4">
            <div className="mb-2 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => <button key={s} className="chip border border-line bg-surface text-muted hover:border-accent hover:text-accent" onClick={() => send(s)} disabled={sending}>{s}</button>)}
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(msg); }}>
              <label htmlFor="coach-msg" className="sr-only">Your answer to the coach</label>
              <textarea id="coach-msg" className="input min-h-[48px] flex-1 resize-y" rows={2} value={msg} onChange={(e) => setMsg(e.target.value)}
                placeholder="Answer the coach's question in your own words..." maxLength={2000}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(msg); } }} />
              <button className="btn-primary self-end" disabled={sending || !msg.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>
            </form>
          </div>
        </section>
        <aside className="space-y-4">
          <div className="card space-y-3 p-5 text-sm">
            <p className="font-bold">What the marker found</p>
            <p className="italic text-muted">{cr.criterion_text} ({cr.weight}%)</p>
            <QuoteBlock quote={cr.evidence_quote} status={cr.quote_status} />
            {cr.missing && <p><b>Missing:</b> {cr.missing}</p>}
          </div>
          <div className="card p-5">
            <label htmlFor="plan" className="label">My improvement plan</label>
            <p className="mb-2 text-xs text-muted">Write what you will change, in your own words. Only you can see this.</p>
            <textarea id="plan" className="input min-h-[120px]" value={plan} onChange={(e) => setPlan(e.target.value)} maxLength={4000}
              placeholder="e.g. Find two studies on automated testing in the library database and use them to support paragraph 1." />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-ghost !py-1.5" onClick={() => savePlan()}><Save className="h-4 w-4" /> Save plan</button>
              <button className="btn-primary !py-1.5" onClick={() => savePlan("completed")} disabled={c.status === "completed"}>
                <CheckCircle2 className="h-4 w-4" /> {c.status === "completed" ? "Completed" : "Mark as completed"}
              </button>
            </div>
            {saved && <p role="status" className="mt-2 text-sm font-semibold text-strong">{saved}</p>}
          </div>
          {assignmentId && (
            <Link to={`/student/edit/${assignmentId}${demo.active ? "?demo=1" : ""}`} className="btn-brand w-full" onClick={() => demo.active && setDemo({ step: 5 })}>
              <Pencil className="h-4 w-4" /> I'm ready - revise my draft
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
