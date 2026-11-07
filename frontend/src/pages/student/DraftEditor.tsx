import { FileUp, History, Info, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AnalysisProgress } from "../../components/AnalysisProgress";
import { DemoTag, ErrorBox, Loading, Notice, PageHeader, RatingBadge } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { useDemo } from "../../context/DemoContext";
import { api } from "../../lib/api";
import type { Assessment, AssignmentSummary } from "../../lib/types";

export default function DraftEditor() {
  const { assignmentId } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { config } = useAuth();
  const { demo, setDemo } = useDemo();
  const [asg, setAsg] = useState<AssignmentSummary | null>(null);
  const [prev, setPrev] = useState<Assessment | null>(null);
  const [original, setOriginal] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState<"editor" | "upload" | "demo_sample">("editor");
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const a = await api<AssignmentSummary>(`/student/assignments/${assignmentId}`);
        setAsg(a);
        const last = a.drafts[a.drafts.length - 1];
        if (last) {
          const d = await api<{ text: string; assessment_id: number | null }>(`/student/drafts/${last.id}`);
          setOriginal(d.text); setText(d.text);
          if (d.assessment_id) setPrev(await api<Assessment>(`/assessment/${d.assessment_id}`));
        }
      } catch (e) { setError((e as Error).message); }
    })();
    if (demo.active && demo.step < 5) setDemo({ step: 5 });
  }, [assignmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = useMemo(() => {
    const a = new Set(original.split(/\s+/)), b = text.split(/\s+/).filter(Boolean);
    return b.filter((w) => !a.has(w)).length;
  }, [original, text]);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  const loadDemoRevision = async () => {
    setBusy("sample");
    try {
      const s = await api<{ improved_essay: string }>("/demo/samples");
      setText(s.improved_essay); setSource("demo_sample"); setFilename("a2_testing_report_draft2_IMPROVED.txt");
      if (demo.active) setDemo({ step: 6 });
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const upload = async (f: File) => {
    setBusy("upload"); setError(null);
    const fd = new FormData(); fd.append("file", f); fd.append("kind", "draft");
    try {
      const r = await api<{ text: string; warnings: string[] }>("/upload", { form: fd });
      setText(r.text); setSource("upload"); setFilename(f.name);
      if (r.warnings.length) setError(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  };
  const submit = async () => {
    setBusy("submit"); setError(null);
    try {
      const d = await api<{ id: number; round_number: number }>("/student/drafts", { body: { assignment_id: Number(assignmentId), text, source, filename } });
      const a = await api<Assessment>("/assessment/analyse", { body: { draft_id: d.id } });
      if (demo.active && asg?.is_demo) setDemo({ draft2Id: d.id, assessment2Id: a.id, step: 6 });
      nav(`/student/results/${a.id}`);
    } catch (e) { setError((e as Error).message); setBusy(null); }
  };

  if (error && !asg) return <ErrorBox message={error} />;
  if (!asg) return <Loading />;
  const isDemo = asg.is_demo && (params.get("demo") === "1" || demo.active);
  const weak = prev?.ratings.filter((r) => r.score <= 3) ?? [];
  return (
    <div className="fade-in">
      <PageHeader title={`Revise: ${asg.title}`}
        eyebrow={<>{asg.is_demo && <DemoTag />}<span className="chip bg-surface2 text-muted">New round {asg.drafts.length + 1}</span></>}
        subtitle="Edit your own text here or upload a revised file. Your earlier drafts are kept unchanged, so you can compare rounds."
        actions={<button className="btn-primary !px-6 !py-3 text-base" onClick={submit} disabled={!!busy || words < 5 || text === original}>
          <Send className="h-5 w-5" /> {busy === "submit" ? "Re-assessing..." : "Submit & re-assess"}</button>} />
      {busy === "submit" && <AnalysisProgress live={config?.ai_mode === "live"} />}
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_330px]">
        <section className="card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button className="btn-ghost !py-1.5" onClick={() => fileRef.current?.click()} disabled={!!busy}><FileUp className="h-4 w-4" /> {busy === "upload" ? "Reading file..." : "Upload revised file"}</button>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.txt,.md,.py,.java,.js,.ts" aria-label="Upload revised file"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <button className="btn-ghost !py-1.5" onClick={() => { setText(original); setSource("editor"); setFilename(null); }} disabled={text === original}><History className="h-4 w-4" /> Undo all changes</button>
            {isDemo && (
              <button className="btn-brand !py-1.5" onClick={loadDemoRevision} disabled={!!busy}>
                <Sparkles className="h-4 w-4" /> Load the student's revised draft (demo)
              </button>
            )}
            <span className="ml-auto text-xs text-muted">{words} words · ~{changed} new/changed words</span>
          </div>
          {source === "demo_sample" && (
            <Notice tone="info" title="Demonstration data">This revised draft was written to represent the fictional student's <b>own</b> edits after coaching (added aims, sources, justification and limitations). It was not generated by GradeGuide.</Notice>
          )}
          <label htmlFor="draft-text" className="sr-only">Draft text</label>
          <textarea id="draft-text" value={text} onChange={(e) => { setText(e.target.value); if (source !== "upload") setSource("editor"); }}
            className="input mt-3 min-h-[60vh] font-[Georgia,serif] !text-[15px] leading-relaxed" spellCheck />
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted"><Info className="h-3.5 w-3.5" /> GradeGuide never edits your work. Only you change this text.</p>
        </section>
        <aside className="space-y-4">
          <div className="card p-5">
            <p className="font-bold">Your improvement areas</p>
            <p className="sub mb-3">From round {prev?.draft.round_number ?? "-"}. Use the questions - not someone else's words.</p>
            {weak.length === 0 && <p className="text-sm text-muted">No open improvement areas.</p>}
            <ul className="space-y-3">
              {weak.map((r) => (
                <li key={r.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-semibold">{r.criterion_name}</span><RatingBadge rating={r.rating} score={r.score} size="sm" /></div>
                  <p className="mt-1 text-muted">{r.coaching_question}</p>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
