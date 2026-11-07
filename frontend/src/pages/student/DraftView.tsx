import { FileText, Pencil, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DemoTag, ErrorBox, Loading, ModeBadge, Notice, PageHeader } from "../../components/ui";
import { AnalysisProgress } from "../../components/AnalysisProgress";
import { useAuth } from "../../context/AuthContext";
import { useDemo } from "../../context/DemoContext";
import { api } from "../../lib/api";
import type { Assessment, Rubric } from "../../lib/types";

interface DraftOut { id: number; assignment_id: number; round_number: number; text: string; word_count: number; source: string;
  filename: string | null; is_demo: boolean; assessment_id: number | null; assignment_title: string; module_name: string }

export default function DraftView() {
  const { id } = useParams();
  const nav = useNavigate();
  const { config } = useAuth();
  const { demo, setDemo } = useDemo();
  const [draft, setDraft] = useState<DraftOut | null>(null);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setError(null);
    api<DraftOut>(`/student/drafts/${id}`).then(async (d) => {
      setDraft(d);
      const a = await api<{ rubric: Rubric }>(`/student/assignments/${d.assignment_id}`);
      setRubric(a.rubric);
    }).catch((e) => setError(e.message));
  }, [id]);

  const analyse = async () => {
    if (!draft) return;
    setRunning(true); setError(null);
    try {
      const a = await api<Assessment>("/assessment/analyse", { body: { draft_id: draft.id, force_offline: offline } });
      if (demo.active) {
        if (draft.round_number === 1) setDemo({ assessment1Id: a.id, step: 3 });
        else setDemo({ assessment2Id: a.id, draft2Id: draft.id, step: 6 });
      }
      nav(`/student/results/${a.id}`);
    } catch (e) { setError((e as Error).message); setRunning(false); }
  };

  if (error && !draft) return <ErrorBox message={error} />;
  if (!draft) return <Loading />;
  return (
    <div className="fade-in">
      <PageHeader title={draft.assignment_title}
        eyebrow={<>{draft.is_demo && <DemoTag text="Demonstration data · fictional student draft" />}<span className="chip bg-surface2 text-muted">Round {draft.round_number}</span></>}
        subtitle={<>{draft.module_name} · {draft.word_count} words · confirm this is the text you want assessed.</>}
        actions={draft.assessment_id
          ? <Link className="btn-primary" to={`/student/results/${draft.assessment_id}`}>View results</Link>
          : <button className="btn-primary !px-6 !py-3 text-base" onClick={analyse} disabled={running}><Wand2 className="h-5 w-5" /> Analyse My Work</button>} />
      {running && <AnalysisProgress live={config?.ai_mode === "live" && !offline} />}
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <article className="card p-6" aria-label="Your draft text">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted"><FileText className="h-4 w-4" /> Extracted text {draft.filename && `· ${draft.filename}`}</div>
          <div className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-surface2/60 p-4 font-[Georgia,serif] text-[15px] leading-relaxed">{draft.text}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={`/student/edit/${draft.assignment_id}`} className="btn-ghost"><Pencil className="h-4 w-4" /> Edit as a new draft</Link>
          </div>
        </article>
        <aside className="space-y-4">
          {rubric && (
            <div className="card p-5">
              <p className="font-bold">Rubric used</p>
              <p className="sub">{rubric.name}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {rubric.questions.map((q) => (
                  <li key={q.id} className="flex justify-between gap-3"><span>{q.short_name}</span><span className="font-semibold text-muted">{q.weight}%</span></li>
                ))}
              </ul>
              <Link to={`/student/rubric/${rubric.id}`} className="mt-3 inline-block text-sm font-semibold text-accent hover:underline">See full rubric questions</Link>
            </div>
          )}
          <div className="card space-y-3 p-5 text-sm">
            <p className="font-bold">How it will be assessed</p>
            {config && <ModeBadge mode={offline ? "simulated" : config.ai_mode} model={config.model} />}
            {config?.ai_mode === "live" && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} /> Use the offline simulator instead</label>
            )}
            {(config?.ai_mode === "simulated" || offline) && (
              <Notice tone="warn">No OpenAI key is configured, so the <b>offline rule-based simulator</b> will be used. Its results are labelled "Simulated" and are not AI analysis.</Notice>
            )}
            <p className="text-muted">Your file is never changed. Only the extracted text is stored, and you can delete it any time from Settings.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
