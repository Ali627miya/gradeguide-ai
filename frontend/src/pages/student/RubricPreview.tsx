import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { DemoTag, ErrorBox, Loading, PageHeader, scoreWords } from "../../components/ui";
import { api } from "../../lib/api";
import type { Rubric } from "../../lib/types";

export default function RubricPreview() {
  const { id } = useParams();
  const [r, setR] = useState<Rubric | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Rubric>(`/rubrics/${id}`).then(setR).catch((e) => setError(e.message)); }, [id]);
  if (error) return <ErrorBox message={error} />;
  if (!r) return <Loading />;
  return (
    <div className="fade-in">
      <PageHeader title={r.name} subtitle="Every rating GradeGuide gives is tied to one of these questions." eyebrow={r.is_demo ? <DemoTag /> : undefined} />
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          {(["code", "report"] as const).map((sec) => {
            const qs = r.questions.filter((q) => q.section === sec);
            if (!qs.length) return null;
            return (
              <section key={sec} className="card p-5">
                <h2 className="font-bold">{sec === "code" ? "Code assessment" : "Report assessment"}</h2>
                <ol className="mt-3 divide-y divide-line">
                  {qs.map((q, i) => (
                    <li key={q.id} className="flex gap-4 py-3">
                      <span className="font-bold text-muted">{i + 1}.</span>
                      <div className="flex-1"><p className="font-semibold">{q.short_name}</p><p className="text-sm text-muted">{q.text}</p></div>
                      <span className="chip h-fit bg-accent/10 text-accent">{q.weight}%</span>
                    </li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
        <aside className="card h-fit p-5 text-sm">
          <h2 className="font-bold">Five-point scale</h2>
          <ol className="mt-2 space-y-1">{[1, 2, 3, 4, 5].map((n) => <li key={n}><b>{n}</b> - {scoreWords[n]} <span className="text-muted">({n >= 4 ? "Strong" : n === 3 ? "Okay" : "Weak"})</span></li>)}</ol>
        </aside>
      </div>
    </div>
  );
}
