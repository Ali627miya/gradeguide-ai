import { ArrowRight, BadgeCheck, BookOpenCheck, GraduationCap, MessageCircleQuestion, PlayCircle, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../components/Layout";
import { ErrorBox, ModeBadge } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useDemo } from "../context/DemoContext";
import { api } from "../lib/api";
import type { User } from "../lib/types";

const agents = [
  { icon: BookOpenCheck, name: "Marker Agent", text: "Rates your draft against your lecturer's actual rubric, quoting your own words as evidence - every quote is checked against your document." },
  { icon: MessageCircleQuestion, name: "Learning Coach", text: "Asks the questions a good tutor would. It never writes, rewrites or completes your work." },
  { icon: ShieldCheck, name: "Integrity Agent", text: "Screens every AI message before you see it and replaces ghost-writing with a guiding question." },
  { icon: BadgeCheck, name: "Feedback-Quality check", text: "Scores the reliability of GradeGuide's own feedback with automated checks - separate from your mark." },
];

export default function Landing() {
  const { user, login, adopt, config, configError } = useAuth();
  const { setDemo } = useDemo();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startDemo = async () => {
    setBusy("demo"); setError(null);
    try {
      const r = await api<{ token: string; user: User; assignment_id: number; draft_id: number }>("/demo/start", { method: "POST" });
      adopt(r.token, r.user);
      setDemo({ active: true, step: 1, assignmentId: r.assignment_id, draft1Id: r.draft_id, assessment1Id: undefined, assessment2Id: undefined, draft2Id: undefined, minimised: false });
      nav(`/student/draft/${r.draft_id}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const signIn = async (role: "student" | "professor") => {
    setBusy(role); setError(null);
    try { await login(role); nav(role === "professor" ? "/professor" : "/student"); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="min-h-screen bg-bg">
      <header className="relative overflow-hidden bg-[#0f2147] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(900px 400px at 85% -10%, rgba(45,212,191,.35), transparent 60%), radial-gradient(700px 380px at 0% 110%, rgba(59,130,246,.35), transparent 60%)" }} />
        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-6 md:px-8">
          <div className="flex items-center justify-between">
            <Logo light />
            {user && <button className="btn !bg-white/10 !text-white hover:!bg-white/20" onClick={() => nav(user.role === "professor" ? "/professor" : "/student")}>Go to my dashboard <ArrowRight className="h-4 w-4" /></button>}
          </div>
          <div className="mt-16 grid gap-12 md:grid-cols-[1.25fr_1fr] md:items-center">
            <div className="fade-in">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold"><Sparkles className="h-3.5 w-3.5 text-[#2dd4bf]" /> Formative feedback · before you submit</p>
              <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.05] md:text-6xl">
                Your assignment.<br />Your effort.<br /><span className="text-[#2dd4bf]">A smarter way to improve.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-white/80">
                GradeGuide checks your draft against your lecturer's real marking rubric, shows you the evidence from your own work,
                and coaches you with questions - so you improve it yourself.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={startDemo} disabled={!!busy} className="btn !bg-[#2dd4bf] !px-6 !py-3.5 !text-base !text-[#04201d] shadow-lg shadow-teal-500/20 hover:brightness-110">
                  <PlayCircle className="h-5 w-5" /> {busy === "demo" ? "Preparing demo..." : "Try Interactive Demo"}
                </button>
                <button onClick={() => signIn("student")} disabled={!!busy} className="btn !bg-white/10 !px-5 !py-3.5 !text-white hover:!bg-white/20"><UserRound className="h-5 w-5" /> Student demo login</button>
                <button onClick={() => signIn("professor")} disabled={!!busy} className="btn !bg-white/10 !px-5 !py-3.5 !text-white hover:!bg-white/20"><GraduationCap className="h-5 w-5" /> Lecturer demo login</button>
              </div>
              <p className="mt-4 text-sm text-white/60">About 3 minutes · no account or upload needed · demo data is clearly labelled</p>
              {config && <div className="mt-4"><ModeBadge mode={config.ai_mode} model={config.model} /></div>}
            </div>
            <div className="card fade-in !border-white/10 !bg-white/[.06] p-5 text-white backdrop-blur" aria-label="Example feedback preview">
              <p className="text-xs font-bold uppercase tracking-widest text-white/60">Example · demonstration data</p>
              <p className="mt-3 text-sm font-semibold">Evidence & research <span className="text-white/60">· 25% of rubric</span></p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-rose-300/50 bg-rose-400/15 px-2.5 py-1 text-xs font-bold text-rose-200">WEAK · 1/5</span>
              <blockquote className="mt-3 border-l-4 border-[#2dd4bf] pl-3 text-sm text-white/85">&ldquo;everyone knows that automated testing is always better than manual testing.&rdquo;</blockquote>
              <p className="mt-1 text-xs text-emerald-300">✓ Verified in your document</p>
              <p className="mt-3 text-sm text-white/75">A strong claim with no research behind it.</p>
              <p className="mt-3 rounded-lg bg-white/10 p-3 text-sm"><span className="font-semibold text-[#2dd4bf]">Coach:</span> What reliable research or data could show a reader that this statement is accurate?</p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-14 md:px-8">
        {(error || configError) && <div className="mb-8"><ErrorBox message={error || `Cannot reach the backend: ${configError}. Start it with "uvicorn main:app --reload --port 8000" in the backend folder.`} /></div>}
        <h2 className="font-display text-2xl font-extrabold">Four agents, one rule: <span className="text-accent">you stay the author</span></h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map((a) => (
            <div key={a.name} className="card p-5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent"><a.icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="mt-3 font-bold">{a.name}</h3>
              <p className="mt-1 text-sm text-muted">{a.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[["For students", "Know where you stand against the rubric before you submit, and track progress from Assignment 1 to Assignment 2."],
            ["For lecturers", "Import six code and six report questions from CSV/JSON. See anonymised class weaknesses and a suggested teaching focus."],
            ["For universities", "AI support that strengthens learning and academic integrity instead of undermining it."]].map(([t, d]) => (
            <div key={t} className="rounded-xl2 border border-line p-5"><p className="font-bold">{t}</p><p className="mt-1 text-sm text-muted">{d}</p></div>
          ))}
        </div>
        <p className="mt-12 text-center text-xs text-muted">GradeGuide gives AI-generated estimated feedback ratings, not official university marks. Prototype built for the Reply Student Tech Clash - AI on Campus.</p>
      </main>
    </div>
  );
}
