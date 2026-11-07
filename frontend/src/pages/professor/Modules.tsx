import { Plus, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DemoTag, ErrorBox, Loading, Notice, PageHeader } from "../../components/ui";
import { api } from "../../lib/api";
import type { Rubric } from "../../lib/types";
import type { ModuleJson } from "./Dashboard";

export default function ProfModules() {
  const [mods, setMods] = useState<ModuleJson[] | null>(null);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [mod, setMod] = useState({ code: "", name: "", min_cohort_size: 5 });
  const [asg, setAsg] = useState<{ module_id: number | ""; title: string; number: number; description: string; rubric_id: number | "" }>({ module_id: "", title: "", number: 1, description: "", rubric_id: "" });

  const load = () => Promise.all([api<ModuleJson[]>("/professor/modules"), api<Rubric[]>("/professor/rubrics")])
    .then(([m, r]) => { setMods(m); setRubrics(r); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const flash = (t: string) => { setOk(t); setTimeout(() => setOk(null), 2500); };

  const createModule = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try { await api("/professor/modules", { body: mod }); setMod({ code: "", name: "", min_cohort_size: 5 }); await load(); flash("Module created."); }
    catch (er) { setError((er as Error).message); }
  };
  const createAssignment = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null);
    try { await api("/professor/assignments", { body: { ...asg, description: asg.description || null } }); setAsg({ ...asg, title: "", description: "" }); await load(); flash("Assignment published to enrolled students."); }
    catch (er) { setError((er as Error).message); }
  };
  const patch = async (id: number, body: object) => {
    try { await api(`/professor/modules/${id}`, { method: "PATCH", body }); await load(); } catch (er) { setError((er as Error).message); }
  };

  if (error && !mods) return <ErrorBox message={error} />;
  if (!mods) return <Loading />;
  return (
    <div className="space-y-6 fade-in">
      <PageHeader title="Modules & assignments" subtitle="Create modules, publish assignments with a rubric, and control analytics consent and privacy thresholds." />
      {error && <ErrorBox message={error} />}
      {ok && <Notice tone="ok">{ok}</Notice>}
      <div className="grid gap-4 md:grid-cols-2">
        {mods.map((m) => (
          <article key={m.id} className="card p-5">
            <div className="flex items-center gap-2"><h2 className="text-lg font-bold">{m.code} · {m.name}</h2>{m.is_demo && <DemoTag text="Demo" />}</div>
            <ul className="mt-3 space-y-2 text-sm">
              {m.assignments.length === 0 && <li className="text-muted">No assignments yet.</li>}
              {m.assignments.map((a) => <li key={a.id} className="flex justify-between gap-2 rounded-lg bg-surface2/60 px-3 py-2"><span><b>A{a.number}</b> {a.title}</span><span className="text-xs text-muted">{a.rubric_name}</span></li>)}
            </ul>
            <div className="mt-4 space-y-3 rounded-lg border border-line p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-accent" aria-hidden /> Privacy & consent</p>
              <label className="flex items-center gap-2"><input type="checkbox" checked={m.analytics_enabled} onChange={(e) => patch(m.id, { analytics_enabled: e.target.checked })} />
                I consent to view anonymised aggregate analytics for this module</label>
              <label className="flex items-center gap-2">Minimum cohort size
                <select className="input !w-auto !py-1" value={m.min_cohort_size} onChange={(e) => patch(m.id, { min_cohort_size: Number(e.target.value) })}>
                  {[3, 5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
                </select></label>
              <Link to={`/professor/analytics?module=${m.id}`} className="font-semibold text-accent hover:underline">View analytics →</Link>
            </div>
          </article>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <form className="card space-y-3 p-6" onSubmit={createModule}>
          <h2 className="text-lg font-bold">Create a module</h2>
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <div><label className="label" htmlFor="mc">Code</label><input id="mc" required className="input" value={mod.code} maxLength={20} onChange={(e) => setMod({ ...mod, code: e.target.value })} placeholder="SE301" /></div>
            <div><label className="label" htmlFor="mn">Name</label><input id="mn" required className="input" value={mod.name} maxLength={120} onChange={(e) => setMod({ ...mod, name: e.target.value })} /></div>
          </div>
          <button className="btn-primary"><Plus className="h-4 w-4" /> Create module</button>
        </form>
        <form className="card space-y-3 p-6" onSubmit={createAssignment}>
          <h2 className="text-lg font-bold">Publish an assignment</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="am">Module</label>
              <select id="am" required className="input" value={asg.module_id} onChange={(e) => setAsg({ ...asg, module_id: e.target.value ? Number(e.target.value) : "" })}>
                <option value="">Select...</option>{mods.map((m) => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}</select></div>
            <div><label className="label" htmlFor="an">Number</label>
              <select id="an" className="input" value={asg.number} onChange={(e) => setAsg({ ...asg, number: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>Assignment {n}</option>)}</select></div>
          </div>
          <div><label className="label" htmlFor="at">Title</label><input id="at" required minLength={2} className="input" value={asg.title} onChange={(e) => setAsg({ ...asg, title: e.target.value })} /></div>
          <div><label className="label" htmlFor="ad">Description (optional)</label><input id="ad" className="input" value={asg.description} onChange={(e) => setAsg({ ...asg, description: e.target.value })} /></div>
          <div><label className="label" htmlFor="ar">Rubric</label>
            <select id="ar" required className="input" value={asg.rubric_id} onChange={(e) => setAsg({ ...asg, rubric_id: e.target.value ? Number(e.target.value) : "" })}>
              <option value="">Select...</option>{rubrics.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            <p className="mt-1 text-xs text-muted">Rubrics can be reused across assignments. <Link to="/professor/rubrics/import" className="font-semibold text-accent">Import a new one</Link>.</p></div>
          <button className="btn-primary"><Plus className="h-4 w-4" /> Publish assignment</button>
        </form>
      </div>
    </div>
  );
}
