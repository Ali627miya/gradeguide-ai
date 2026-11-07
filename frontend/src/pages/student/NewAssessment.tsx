import { Check, ClipboardPaste, FileUp, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnalysisProgress } from "../../components/AnalysisProgress";
import { RubricEditor, rubricErrors } from "../../components/RubricEditor";
import { ErrorBox, Loading, Notice, PageHeader } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import type { Assessment, AssignmentSummary, Question, Rubric } from "../../lib/types";

type Mode = "existing" | "new";
type RubricMode = "saved" | "upload";

function FileDrop({ id, label, accept, onFile, busy }: { id: string; label: string; accept: string; onFile: (f: File) => void; busy: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition ${over ? "border-accent bg-accent/5" : "border-line"}`}>
      <FileUp className="h-7 w-7 text-accent" aria-hidden />
      <p className="text-sm font-semibold">{busy ? "Reading file..." : label}</p>
      <p className="text-xs text-muted">PDF, DOCX or TXT · drag and drop or</p>
      <button type="button" className="btn-ghost !py-1.5" onClick={() => ref.current?.click()} disabled={busy}>Choose file</button>
      <input id={id} ref={ref} type="file" accept={accept} className="hidden" aria-label={label} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </div>
  );
}

export default function NewAssessment() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { config } = useAuth();
  const [assignments, setAssignments] = useState<AssignmentSummary[] | null>(null);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [mode, setMode] = useState<Mode>("existing");
  const [assignmentId, setAssignmentId] = useState<number | "">("");
  const [details, setDetails] = useState({ title: "", module_name: "", number: 1, description: "" });
  const [rubricMode, setRubricMode] = useState<RubricMode>("upload");
  const [rubricId, setRubricId] = useState<number | "">("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [rubricWarnings, setRubricWarnings] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (error) window.scrollTo({ top: 0, behavior: "smooth" }); }, [error]);
  useEffect(() => {
    Promise.all([api<AssignmentSummary[]>("/student/assignments"), api<Rubric[]>("/student/rubrics")]).then(([a, r]) => {
      setAssignments(a); setRubrics(r);
      const pre = params.get("assignment");
      if (pre) setAssignmentId(Number(pre)); else if (a.length === 0) setMode("new");
    }).catch((e) => setError(e.message));
  }, [params]);

  const readFile = async (f: File, kind: "draft" | "rubric") => {
    setBusy(kind); setError(null);
    const fd = new FormData(); fd.append("file", f); fd.append("kind", kind);
    try {
      const r = await api<{ text: string; warnings: string[]; questions?: Question[] }>("/upload", { form: fd });
      if (kind === "draft") { setText(r.text); setFilename(f.name); setWarnings(r.warnings); setConfirmed(false); }
      else { setQuestions(r.questions || []); setRubricWarnings(r.warnings); }
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const loadSample = async (what: "draft" | "rubric") => {
    const s = await api<{ weak_essay: string; rubric: string }>("/demo/samples");
    if (what === "draft") { setText(s.weak_essay); setFilename("sample_weak_essay.txt"); setConfirmed(false); setWarnings(["This is demonstration data - a fictional student draft."]); }
    else {
      const r = await api<{ questions: Question[]; warnings: string[] }>("/rubrics/parse-text", { body: { text: s.rubric } });
      setQuestions(r.questions); setRubricWarnings(r.warnings);
    }
  };

  const selected = assignments?.find((a) => a.id === assignmentId);
  const rubricOk = mode === "existing" ? !!selected : rubricMode === "saved" ? !!rubricId : rubricErrors(questions, config?.max_questions_per_section).length === 0;
  const detailsOk = mode === "existing" ? !!selected : details.title.trim().length >= 2 && details.module_name.trim().length >= 2;
  const canRun = detailsOk && rubricOk && text.trim().length >= 20 && confirmed;

  const run = async () => {
    setBusy("run"); setError(null);
    try {
      let aid = assignmentId as number;
      if (mode === "new") {
        const body = { ...details, number: Number(details.number), description: details.description || null,
          ...(rubricMode === "saved" ? { rubric_id: rubricId } : { rubric: { name: `${details.title} rubric`, questions: questions.map((q) => ({ section: q.section, text: q.text, weight: Number(q.weight), short_name: q.short_name || null, category: q.category || null })) } }) };
        aid = (await api<AssignmentSummary>("/student/assignments", { body })).id;
      }
      const d = await api<{ id: number }>("/student/drafts", { body: { assignment_id: aid, text, filename, source: filename ? "upload" : "paste" } });
      const a = await api<Assessment>("/assessment/analyse", { body: { draft_id: d.id } });
      nav(`/student/results/${a.id}`);
    } catch (e) { setError((e as Error).message); setBusy(null); }
  };

  if (error && !assignments) return <ErrorBox message={error} />;
  if (!assignments) return <Loading />;
  const stepCls = (ok: boolean) => `flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${ok ? "bg-strong text-white" : "bg-surface2 text-muted"}`;
  return (
    <div className="fade-in">
      <PageHeader title="Start a new assessment" subtitle="Three quick steps: tell us the assignment, add your lecturer's rubric, then upload and confirm your draft." />
      {busy === "run" && <AnalysisProgress live={config?.ai_mode === "live"} />}
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}
      <div className="space-y-6">
        <section className="card p-6" aria-labelledby="s1">
          <h2 id="s1" className="flex items-center gap-3 text-lg font-extrabold"><span className={stepCls(detailsOk)}>{detailsOk ? <Check className="h-4 w-4" /> : 1}</span> Assignment</h2>
          <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Assignment source">
            {(["existing", "new"] as Mode[]).map((m) => (
              <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "btn-brand !py-1.5" : "btn-ghost !py-1.5"} onClick={() => setMode(m)} disabled={m === "existing" && assignments.length === 0}>
                {m === "existing" ? "Published by my lecturer" : "Add my own assignment"}
              </button>
            ))}
          </div>
          {mode === "existing" ? (
            <div className="mt-4 max-w-xl">
              <label htmlFor="asg" className="label">Choose assignment</label>
              <select id="asg" className="input" value={assignmentId} onChange={(e) => setAssignmentId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Select...</option>
                {assignments.map((a) => <option key={a.id} value={a.id}>{a.module_name} - Assignment {a.number}: {a.title}{a.is_demo ? " (demo)" : ""}</option>)}
              </select>
              {selected?.rubric_id && <p className="mt-2 text-sm text-muted">Rubric: {selected.rubric_name} · <a className="font-semibold text-accent hover:underline" href={`/student/rubric/${selected.rubric_id}`} target="_blank" rel="noreferrer">preview</a></p>}
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div><label className="label" htmlFor="t">Assignment title</label><input id="t" className="input" value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} maxLength={160} /></div>
              <div><label className="label" htmlFor="m">Module name</label><input id="m" className="input" value={details.module_name} onChange={(e) => setDetails({ ...details, module_name: e.target.value })} maxLength={120} placeholder="e.g. Software Engineering" /></div>
              <div><label className="label" htmlFor="n">Assignment number</label>
                <select id="n" className="input" value={details.number} onChange={(e) => setDetails({ ...details, number: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>Assignment {n}</option>)}
                </select></div>
              <div><label className="label" htmlFor="d">Description <span className="font-normal text-muted">(optional)</span></label><input id="d" className="input" value={details.description} onChange={(e) => setDetails({ ...details, description: e.target.value })} maxLength={2000} /></div>
            </div>
          )}
        </section>

        {mode === "new" && (
          <section className="card p-6" aria-labelledby="s2">
            <h2 id="s2" className="flex items-center gap-3 text-lg font-extrabold"><span className={stepCls(rubricOk)}>{rubricOk ? <Check className="h-4 w-4" /> : 2}</span> Lecturer's marking rubric</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className={rubricMode === "upload" ? "btn-brand !py-1.5" : "btn-ghost !py-1.5"} onClick={() => setRubricMode("upload")}>Upload rubric file</button>
              <button className={rubricMode === "saved" ? "btn-brand !py-1.5" : "btn-ghost !py-1.5"} onClick={() => setRubricMode("saved")}>Use a saved rubric or template</button>
            </div>
            {rubricMode === "saved" ? (
              <div className="mt-4 max-w-xl"><label className="label" htmlFor="rb">Rubric</label>
                <select id="rb" className="input" value={rubricId} onChange={(e) => setRubricId(e.target.value ? Number(e.target.value) : "")}>
                  <option value="">Select...</option>
                  {rubrics.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select></div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
                  <FileDrop id="rubric-file" label="Upload your lecturer's rubric" accept=".pdf,.docx,.txt,.csv,.json" busy={busy === "rubric"} onFile={(f) => readFile(f, "rubric")} />
                  <button className="btn-ghost" onClick={() => loadSample("rubric")}>Use sample rubric (demo)</button>
                </div>
                {rubricWarnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
                {questions.length > 0 && <><p className="text-sm text-muted">We found these criteria. Check the wording and weights match your rubric.</p>
                  <RubricEditor questions={questions} onChange={setQuestions} max={config?.max_questions_per_section} /></>}
              </div>
            )}
          </section>
        )}

        <section className="card p-6" aria-labelledby="s3">
          <h2 id="s3" className="flex items-center gap-3 text-lg font-extrabold"><span className={stepCls(confirmed)}>{confirmed ? <Check className="h-4 w-4" /> : mode === "new" ? 3 : 2}</span> Your draft</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <FileDrop id="draft-file" label="Upload your assignment draft" accept=".pdf,.docx,.txt,.md,.py,.java,.js,.ts" busy={busy === "draft"} onFile={(f) => readFile(f, "draft")} />
            <div className="flex flex-col gap-2">
              <button className="btn-ghost" onClick={() => { setText(text || " "); setFilename(null); }}><ClipboardPaste className="h-4 w-4" /> Paste text instead</button>
              <button className="btn-ghost" onClick={() => loadSample("draft")}>Use sample weak essay (demo)</button>
            </div>
          </div>
          {text && (
            <div className="mt-4">
              {warnings.map((w) => <div key={w} className="mb-2"><Notice tone="warn">{w}</Notice></div>)}
              <label htmlFor="preview" className="label">Extracted text preview {filename && <span className="font-normal text-muted">· {filename}</span>}</label>
              <textarea id="preview" className="input min-h-[260px] font-[Georgia,serif] !text-[15px]" value={text} onChange={(e) => { setText(e.target.value); setConfirmed(false); }} />
              <p className="mt-1 text-xs text-muted">{text.trim() ? text.trim().split(/\s+/).length : 0} words. You can correct extraction errors here - but this is your text, not ours.</p>
              <label className="mt-3 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={text.trim().length < 20} />
                <span>I confirm this is the text I want assessed, and that it is my own work.</span>
              </label>
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {!canRun && <p className="text-sm text-muted">Complete each step to continue.</p>}
          <button className="btn-primary !px-6 !py-3 text-base" disabled={!canRun || !!busy} onClick={run}><Wand2 className="h-5 w-5" /> Analyse My Work</button>
        </div>
      </div>
    </div>
  );
}
