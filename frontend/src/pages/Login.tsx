import { ArrowLeft, ArrowRight, GraduationCap, UserRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Logo } from "../components/Layout";
import { ErrorBox } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useDemo } from "../context/DemoContext";
import { api } from "../lib/api";
import type { User } from "../lib/types";

export default function Login() {
  const { login, adopt } = useAuth();
  const { setDemo } = useDemo();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = async (role: "student" | "professor") => {
    setBusy(role); setError(null);
    try { await login(role); nav(role === "professor" ? "/professor" : "/student"); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const startDemo = async () => {
    setBusy("demo"); setError(null);
    try {
      const r = await api<{ token: string; user: User; assignment_id: number; draft_id: number }>("/demo/start", { method: "POST" });
      adopt(r.token, r.user);
      setDemo({ active: true, step: 1, assignmentId: r.assignment_id, draft1Id: r.draft_id, assessment1Id: undefined, assessment2Id: undefined, draft2Id: undefined, minimised: false });
      nav(`/student/draft/${r.draft_id}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };

  return <main className="relative min-h-screen overflow-hidden bg-bg px-5 py-8 md:px-8">
    <div aria-hidden className="pointer-events-none absolute -right-40 -top-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
    <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-info/10 blur-3xl" />
    <div className="relative mx-auto max-w-5xl">
      <div className="flex items-center justify-between"><Logo /><button className="btn-ghost min-h-11" onClick={() => nav("/")}><ArrowLeft className="h-4 w-4" /> Back to home</button></div>
      <div className="mx-auto mt-14 max-w-3xl text-center fade-in">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-accent">Welcome to GradeGuide AI</p>
        <h1 className="mt-3 font-display text-3xl font-black tracking-tight text-ink md:text-5xl">Choose how you want to explore</h1>
        <p className="mt-3 text-muted">This prototype provides role-based demo access. No email or password is required.</p>
      </div>
      {error && <div className="mx-auto mt-6 max-w-2xl"><ErrorBox message={error} /></div>}
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <section className="interactive-card flex flex-col rounded-[2rem] p-8 md:p-10" aria-labelledby="student-login-title">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[#e9e5ff] text-[#6557d5]"><UserRound className="h-6 w-6" aria-hidden /></span>
          <h2 id="student-login-title" className="mt-5 text-2xl font-extrabold">Student demo</h2>
          <p className="mt-2 flex-1 text-sm leading-6 text-muted">Review an assignment against its marking rubric, explore evidence-based feedback and use the learning coach.</p>
          <button className="btn-primary mt-8 min-h-14 w-full !rounded-2xl" disabled={!!busy} onClick={() => signIn("student")}>{busy === "student" ? "Opening student demo..." : "Continue as student"}<ArrowRight className="h-4 w-4" /></button>
        </section>
        <section className="interactive-card flex flex-col rounded-[2rem] p-8 md:p-10" aria-labelledby="lecturer-login-title">
          <span className="inline-flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[#e0f6f1] text-[#218d79]"><GraduationCap className="h-6 w-6" aria-hidden /></span>
          <h2 id="lecturer-login-title" className="mt-5 text-2xl font-extrabold">Lecturer demo</h2>
          <p className="mt-2 flex-1 text-sm leading-6 text-muted">Explore rubric management, student review workflows and anonymised class-level insights.</p>
          <button className="btn-brand mt-8 min-h-14 w-full !rounded-2xl" disabled={!!busy} onClick={() => signIn("professor")}>{busy === "professor" ? "Opening lecturer demo..." : "Continue as lecturer"}<ArrowRight className="h-4 w-4" /></button>
        </section>
      </div>
      <div className="interactive-card mx-auto mt-7 max-w-2xl p-6 text-center">
        <p className="font-semibold">Prefer a guided walkthrough?</p><p className="mt-1 text-sm text-muted">Launch a prepared student example with step-by-step guidance.</p>
        <button className="btn-ghost mt-3 min-h-11" disabled={!!busy} onClick={startDemo}>{busy === "demo" ? "Preparing walkthrough..." : "Start interactive demo"}<ArrowRight className="h-4 w-4" /></button>
      </div>
      <p className="mt-8 text-center text-xs text-muted">Demo access only · Demonstration data is labelled throughout the prototype.</p>
    </div>
  </main>;
}
