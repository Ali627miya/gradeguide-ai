import { BookOpenCheck, Code2, Copy, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { RubricEditor, rubricErrors, totalWeight } from "../../components/RubricEditor";
import { ErrorBox, Loading, Notice, PageHeader, scoreWords } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../lib/api";
import type { Question, Rubric } from "../../lib/types";

export default function RubricBuilder() {
  const { section = "report" } = useParams();
  const sec = (section === "code" ? "code" : "report") as "code" | "report";
  const [params, setParams] = useSearchParams();
  const { config } = useAuth();
  const [rubrics, setRubrics] = useState<Rubric[] | null>(null);
  const [selId, setSelId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [qs, setQs] = useState<Question[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(params.get("saved") ? "Rubric saved. You can reuse it when publishing assignments." : null);
  const [conflict, setConflict] = useState(false);

  const load = async (pick?: number) => {
    const rs = await api<Rubric[]>("/professor/rubrics");
    setRubrics(rs);
    const want = pick ?? (Number(params.get("rubric")) || rs.find((r) => !r.is_template && r.questions.some((q) => q.section === sec))?.id || rs[0]?.id);
    const r = rs.find((x) => x.id === want);
    if (r) { setSelId(r.id); setName(r.name); setQs(r.questions.map((q) => ({ ...q }))); }
  };
  useEffect(() => { load().catch((e) => setError(e.message)); }, [sec]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => rubrics?.find((r) => r.id === selId), [rubrics, selId]);
  const errors = rubricErrors(qs, config?.max_questions_per_section);
  const other = sec === "code" ? "report" : "code";
  const otherQs = qs.filter((q) => q.section === other);
  const payload = (n: string) => ({ name: n, questions: qs.map((q) => ({ section: q.section, text: q.text, weight: Number(q.weight), short_name: q.short_name || null, category: q.category || null })) });

  const save = async (asNew: boolean) => {
    setError(null); setConflict(false);
    try {
      const r = asNew || !selected || selected.is_template
        ? await api<Rubric>("/professor/rubrics", { body: payload(asNew && selected && name === selected.name ? `${name} (copy)` : name) })
        : await api<Rubric>(`/professor/rubrics/${selected.id}`, { method: "PUT", body: payload(name) });
      await load(r.id); setParams({ rubric: String(r.id) });
      setOk(asNew || selected?.is_template ? "Saved as a new rubric." : "Rubric updated.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(true);
      setError((e as Error).message);
    }
  };

  if (error && !rubrics) return <ErrorBox message={error} />;
  if (!rubrics) return <Loading />;
  const Icon = sec === "code" ? Code2 : BookOpenCheck;
  return (
    <div className="space-y-6 fade-in">
      <PageHeader title={sec === "code" ? "Code assessment configuration" : "Report assessment configuration"}
        subtitle={`Up to ${config?.max_questions_per_section ?? 6} ${sec} questions, each rated 1-5. Weights across the whole rubric must total 100%.`}
        actions={<><Link to={`/professor/rubrics/${other}${selId ? `?rubric=${selId}` : ""}`} className="btn-ghost">Switch to {other} section</Link><Link to="/professor/rubrics/import" className="btn-ghost">Import from CSV/JSON</Link></>} />
      <div className="card grid gap-4 p-6 md:grid-cols-2">
        <div><label htmlFor="pick" className="label">Rubric</label>
          <select id="pick" className="input" value={selId ?? ""} onChange={(e) => { const r = rubrics.find((x) => x.id === Number(e.target.value)); if (r) { setSelId(r.id); setName(r.name); setQs(r.questions.map((q) => ({ ...q }))); setOk(null); setError(null); } }}>
            {rubrics.map((r) => <option key={r.id} value={r.id}>{r.name}{r.is_template ? " (template)" : ""}</option>)}
          </select>
          {selected?.is_template && <p className="mt-1 text-xs text-muted">Templates are read-only starting points - saving creates your own copy.</p>}</div>
        <div><label htmlFor="nm" className="label">Rubric name</label><input id="nm" className="input" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} /></div>
      </div>
      {ok && <Notice tone="ok">{ok}</Notice>}
      {error && <ErrorBox message={error} />}
      {conflict && <button className="btn-primary" onClick={() => save(true)}><Copy className="h-4 w-4" /> Save my changes as a new rubric</button>}
      <section className="card space-y-4 p-6" aria-label={`${sec} questions`}>
        <h2 className="flex items-center gap-2 text-lg font-bold"><Icon className="h-5 w-5 text-accent" aria-hidden /> {sec === "code" ? "Code" : "Report"} questions</h2>
        <RubricEditor questions={qs} onChange={setQs} sections={[sec]} max={config?.max_questions_per_section} />
        <p className="text-sm text-muted">
          The {other} section of this rubric has {otherQs.length} question(s) worth {totalWeight(otherQs)}%. <Link className="font-semibold text-accent" to={`/professor/rubrics/${other}${selId ? `?rubric=${selId}` : ""}`}>Edit {other} questions</Link>
        </p>
        {errors.length > 0 && <ul className="list-disc pl-5 text-sm text-okay">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={errors.length > 0 || name.trim().length < 2} onClick={() => save(false)}><Save className="h-4 w-4" /> {selected?.is_template ? "Save as my rubric" : "Save rubric"}</button>
          {!selected?.is_template && <button className="btn-ghost" disabled={errors.length > 0} onClick={() => save(true)}><Copy className="h-4 w-4" /> Save as new (reuse)</button>}
        </div>
      </section>
      <aside className="card p-5 text-sm">
        <h2 className="font-bold">Rating scale used for every question</h2>
        <p className="mt-1 text-muted">{[1, 2, 3, 4, 5].map((n) => `${n} – ${scoreWords[n]}`).join(" · ")}</p>
        <p className="mt-2 text-muted">When students share work for review, you can add a rating and an optional comment of up to 10 words per question.</p>
      </aside>
    </div>
  );
}
