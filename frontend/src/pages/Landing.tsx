import { ArrowRight, BadgeCheck, BookOpenCheck, MessageCircleQuestion, PlayCircle, ShieldCheck, Sparkles, UserRound } from "lucide-react";
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
  const { user, adopt, config, configError } = useAuth();
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

  return (
    <div className="min-h-screen bg-bg">
      <header className="relative overflow-hidden bg-[#f1efff] text-[#292b4b] dark:bg-[#292846] dark:text-white">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-[28rem] w-[28rem] rounded-full bg-[#a99cff]/35 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 left-[28%] h-[26rem] w-[26rem] rounded-full bg-[#8de2d0]/35 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-6 md:px-8 md:pb-24">
          <div className="flex items-center justify-between">
            <Logo />
            <div className="flex items-center gap-3">
              {user && <button className="btn-ghost !border-[#d9d3fa] !bg-white/70 dark:!border-white/20 dark:!bg-white/10" onClick={() => nav(user.role === "professor" ? "/professor" : "/student")}>My dashboard <ArrowRight className="h-4 w-4" /></button>}
              <button className="btn !min-h-11 !bg-[#6557d5] !px-5 !text-white hover:!bg-[#5548c3]" onClick={() => nav("/login")}>Sign in</button>
            </div>
          </div>
          <div className="mt-14 grid gap-12 md:grid-cols-[1.08fr_.92fr] md:items-center lg:mt-20">
            <div className="fade-in">
              <p className="inline-flex items-center gap-2 rounded-full border border-[#d8d1fb] bg-white/75 px-4 py-2 text-sm font-extrabold text-[#6557c7] shadow-sm dark:border-white/15 dark:bg-white/10 dark:text-[#c7c0ff]"><Sparkles className="h-4 w-4" /> Feedback that helps you grow</p>
              <h1 className="mt-6 max-w-3xl font-display text-4xl font-black leading-[1.04] tracking-tight md:text-6xl lg:text-7xl">
                Your work. Your ideas. <span className="text-[#6557d5] dark:text-[#b7adff]">Your next step.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#5e607b] dark:text-white/75">
                GradeGuide checks your draft against your lecturer's real marking rubric, shows evidence from your own work, and coaches you with thoughtful questions — so you can improve it yourself.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={startDemo} disabled={!!busy} className="btn !min-h-14 !rounded-2xl !bg-[#31c5ad] !px-7 !text-base !text-[#123d3a] shadow-lg shadow-teal-500/20 hover:!bg-[#54d9c3]">
                  <PlayCircle className="h-5 w-5" /> {busy === "demo" ? "Preparing your demo…" : "Try the interactive demo"}
                </button>
                <button onClick={() => nav("/login")} className="btn min-h-14 !rounded-2xl !border-[#d9d3fa] !bg-white/80 !px-5 !text-[#3d3b68] hover:!border-[#aaa0ed] hover:!bg-white dark:!border-white/20 dark:!bg-white/10 dark:!text-white"><UserRound className="h-5 w-5" /> Choose your role <ArrowRight className="h-4 w-4" /></button>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-[#777895] dark:text-white/65">
                <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-[#249d83]" /> No account needed</span>
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-[#249d83]" /> You stay the author</span>
                <span className="inline-flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-[#b18b25]" /> Demo data labelled</span>
              </div>
              {config && <div className="mt-4"><ModeBadge mode={config.ai_mode} model={config.model} /></div>}
            </div>
            <div className="relative mx-auto w-full max-w-xl fade-in">
              <div aria-hidden className="absolute -left-5 -top-5 h-20 w-20 rounded-[1.7rem] bg-[#ffd98b] rotate-[-12deg]" />
              <div aria-hidden className="absolute -bottom-5 -right-4 h-24 w-24 rounded-full bg-[#8de2d0]" />
              <div className="relative rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_24px_70px_-30px_rgba(69,57,140,.35)] backdrop-blur dark:border-white/10 dark:bg-[#343354] md:p-8" aria-label="Example feedback preview">
                <div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[.14em] text-[#8885a8]">A little preview</p><span className="rounded-full bg-[#e9f8f3] px-3 py-1 text-xs font-extrabold text-[#21876f] dark:bg-emerald-400/15 dark:text-emerald-200">DEMO EXAMPLE</span></div>
                <div className="mt-6 flex items-start justify-between gap-4"><div><p className="text-lg font-extrabold text-[#343451] dark:text-white">Evidence & research</p><p className="mt-1 text-sm text-[#8885a2] dark:text-white/60">25% of your rubric</p></div><span className="rounded-xl bg-[#fff0f1] px-3 py-2 text-xs font-black text-[#c34c67] dark:bg-rose-400/15 dark:text-rose-200">1 / 5 · WEAK</span></div>
                <blockquote className="mt-5 rounded-2xl border-l-4 border-[#f2a65a] bg-[#fff8ed] px-4 py-4 text-sm leading-6 text-[#57546d] dark:bg-white/5 dark:text-white/80">“Everyone knows that automated testing is always better than manual testing.”</blockquote>
                <p className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#249d83]"><BadgeCheck className="h-4 w-4" /> Evidence found in your document</p>
                <p className="mt-4 text-sm leading-6 text-[#77758e] dark:text-white/65">A confident claim needs reliable evidence to support it.</p>
                <div className="mt-5 rounded-2xl bg-[#eeecff] p-4 dark:bg-[#4a4772]"><p className="text-sm leading-6 text-[#4c477d] dark:text-white/90"><span className="font-black text-[#6557d5] dark:text-[#c8c1ff]">Your coach asks:</span> What research or data could help a reader trust this statement?</p></div>
                <div className="mt-5 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#31c5ad]"/><span className="h-2.5 w-2.5 rounded-full bg-[#f2bd58]"/><span className="h-2.5 w-2.5 rounded-full bg-[#ed8d9e]"/><span className="ml-2 text-xs font-semibold text-[#9693ad]">Small steps. Clear progress.</span></div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-14 md:px-8 md:py-20">
        {(error || configError) && <div className="mb-8"><ErrorBox message={error || `Cannot reach the backend: ${configError}. Start it with "uvicorn main:app --reload --port 8000" in the backend folder.`} /></div>}
        <section className="mb-16 grid gap-6 rounded-[2rem] border border-[#e5e0fa] bg-white p-7 shadow-[0_12px_40px_-30px_rgba(69,57,140,.3)] md:grid-cols-[1fr_auto] md:items-center md:p-9 dark:border-line dark:bg-surface" aria-labelledby="start-heading">
          <div><p className="text-xs font-black uppercase tracking-[.16em] text-[#7669d5]">A friendly place to begin</p><h2 id="start-heading" className="mt-2 font-display text-2xl font-black md:text-3xl">Make your next draft a little stronger.</h2><p className="mt-2 max-w-2xl leading-7 text-muted">Explore a guided student example, or choose student or lecturer access. You can try the main workflow without creating an account.</p></div>
          <div className="flex flex-wrap gap-2 md:justify-end"><button onClick={startDemo} disabled={!!busy} className="btn-primary min-h-12">{busy === "demo" ? "Preparing…" : "Start guided demo"}<ArrowRight className="h-4 w-4" /></button><button onClick={() => nav("/login")} className="btn-ghost min-h-12">Choose a role</button></div>
        </section>
        <div className="mb-7 max-w-2xl"><p className="text-xs font-black uppercase tracking-[.16em] text-[#7669d5]">Thoughtful support, not shortcuts</p><h2 className="mt-2 font-display text-3xl font-black">Four helpful agents. <span className="text-[#7669d5]">You stay in charge.</span></h2></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map((a, i) => (
            <div key={a.name} className="interactive-card p-6">
              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${["bg-[#e8e5ff] text-[#6c5ed0]", "bg-[#e1f7f1] text-[#218d79]", "bg-[#fff0dc] text-[#b87927]", "bg-[#ffe9ee] text-[#c05a77]"][i]}`}><a.icon className="h-5 w-5" aria-hidden /></span>
              <h3 className="mt-4 font-extrabold">{a.name}</h3><p className="mt-2 text-sm leading-6 text-muted">{a.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {[ ["For students", "Understand how your draft meets the rubric, improve your evidence and see your progress over time."], ["For lecturers", "Build rubrics, review student work and spot anonymised class-level learning patterns."], ["For universities", "Support learning and academic integrity with feedback that helps students remain the authors."] ].map(([t, d], i) => (
            <div key={t} className="interactive-card p-6"><span className={`mb-4 inline-flex h-2 w-12 rounded-full ${["bg-[#8b7ce5]", "bg-[#49c7ad]", "bg-[#f0b95b]"][i]}`} /><p className="font-extrabold">{t}</p><p className="mt-2 text-sm leading-6 text-muted">{d}</p></div>
          ))}
        </div>
        <p className="mt-14 text-center text-xs leading-6 text-muted">GradeGuide gives AI-generated estimated feedback ratings, not official university marks. Prototype built for the Reply Student Tech Clash — AI on Campus.</p>
      </main>
    </div>
  );
}
