import { Download, FileUp, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RubricEditor, rubricErrors } from "../../components/RubricEditor";
import { ErrorBox, Notice, PageHeader } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import type { Question, Rubric } from "../../lib/types";

const TEMPLATES = [
  ["code_questions_template.csv", "Code questions (CSV)"],
  ["report_questions_template.csv", "Report questions (CSV)"],
  ["rubric_template.json", "Code + report rubric (JSON)"],
];

export default function RubricImport() {
  const { config } = useAuth();
  const nav = useNavigate();
  const ref = useRef<HTMLInputElement>(null);
  const [section, setSection] = useState<"" | "code" | "report">("");
  const [name, setName] = useState("");
  const [moduleId, setModuleId] = useState<number | "">("");
  const [mods, setMods] = useState<{ id: number; code: string; name: string }[]>([]);
  const [qs, setQs] = useState<Question[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ id: number; code: string; name: string }[]>("/professor/modules").then(setMods).catch(() => {}); }, []);

  const importFile = async (f: File) => {
    setBusy(true); setError(null);
    const fd = new FormData(); fd.append("file", f); fd.append("section", section);
    try {
      const r = await api<{ name: string | null; questions: Question[]; warnings: string[] }>("/professor/rubric/import", { form: fd });
      setQs((prev) => section ? [...prev.filter((q) => q.section !== section), ...r.questions] : r.questions);
      setWarnings(r.warnings); if (r.name && !name) setName(r.name); else if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const errors = rubricErrors(qs, config?.max_questions_per_section);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api<Rubric>("/professor/rubrics", { body: { name: name || "Imported rubric", module_id: moduleId || null,
        questions: qs.map((q) => ({ section: q.section, text: q.text, weight: Number(q.weight), short_name: q.short_name || null, category: q.category || null })) } });
      nav(`/professor/rubrics/${qs.some((q) => q.section === "code") && !qs.some((q) => q.section === "report") ? "code" : "report"}?rubric=${r.id}&saved=1`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <div className="space-y-6 fade-in">
      <PageHeader title="Import assessment questions" subtitle="No 30-question forms: upload up to six code and six report questions from CSV or JSON, check the preview, then save a reusable rubric." />
      <section className="card p-6">
        <h2 className="font-bold">1. Download a template</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {TEMPLATES.map(([f, l]) => <a key={f} href={`/api/templates/${f}`} download className="btn-ghost !py-1.5"><Download className="h-4 w-4" /> {l}</a>)}
        </div>
        <p className="mt-2 text-xs text-muted">CSV columns: <code>section,question,weight,short_name</code>. Section is <code>code</code> or <code>report</code>; weights across the whole rubric must total 100.</p>
      </section>
      <section className="card space-y-4 p-6">
        <h2 className="font-bold">2. Upload your questions</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div><label htmlFor="sec" className="label">Import into</label>
            <select id="sec" className="input !w-auto" value={section} onChange={(e) => setSection(e.target.value as typeof section)}>
              <option value="">Both sections (use the file's section column)</option><option value="code">Code assessment only</option><option value="report">Report assessment only</option>
            </select></div>
          <button className="btn-primary" onClick={() => ref.current?.click()} disabled={busy}><FileUp className="h-4 w-4" /> {busy ? "Reading..." : "Choose CSV / JSON"}</button>
          <input ref={ref} type="file" accept=".csv,.json,.txt,.pdf,.docx" className="hidden" aria-label="Question file" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />
          <button className="btn-ghost" onClick={async () => { const r = await api<Rubric[]>("/professor/rubrics"); const t = r.filter((x) => x.is_template).flatMap((x) => x.questions); setQs(t.map((q) => ({ ...q, weight: q.weight / 2 }))); setName("Code + report (from templates)"); setWarnings(["Template weights were halved so code + report total 100%. Adjust them to suit your module."]); }}>
            Start from the suggested 6 + 6 questions</button>
        </div>
        {error && <ErrorBox message={error} />}
        {warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
      </section>
      {qs.length > 0 && (
        <section className="card space-y-4 p-6">
          <h2 className="font-bold">3. Preview, edit and set weights</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div><label className="label" htmlFor="rn">Rubric name</label><input id="rn" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={160} /></div>
            <div><label className="label" htmlFor="rm">Module (optional)</label>
              <select id="rm" className="input" value={moduleId} onChange={(e) => setModuleId(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Not linked - reusable anywhere</option>{mods.map((m) => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}</select></div>
          </div>
          <RubricEditor questions={qs} onChange={setQs} max={config?.max_questions_per_section} />
          {errors.length > 0 && <ul className="list-disc pl-5 text-sm text-okay">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
          <button className="btn-primary" disabled={errors.length > 0 || busy || name.trim().length < 2} onClick={save}><Save className="h-4 w-4" /> Save rubric</button>
        </section>
      )}
    </div>
  );
}
