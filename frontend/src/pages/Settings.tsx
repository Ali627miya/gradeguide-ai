import { Database, Moon, RotateCcw, Sun, Trash2, Volume2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorBox, Notice, PageHeader, RatingBadge } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useDemo } from "../context/DemoContext";
import { useSettings, type Settings } from "../context/SettingsContext";
import { useSpeech } from "../context/SpeechContext";
import { api } from "../lib/api";

function Choice<T extends string>({ name, value, options, onChange }: { name: string; value: T; options: { v: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
      {options.map((o) => (
        <label key={o.v} className={`cursor-pointer rounded-xl border p-3 text-sm transition ${value === o.v ? "border-accent bg-accent/10 ring-2 ring-accent/30" : "border-line hover:border-accent/60"}`}>
          <input type="radio" name={name} className="sr-only" checked={value === o.v} onChange={() => onChange(o.v)} />
          <span className="font-semibold">{o.label}</span>{o.hint && <span className="block text-xs text-muted">{o.hint}</span>}
        </label>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { settings, update } = useSettings();
  const sp = useSpeech();
  const { user, logout, config } = useAuth();
  const { endDemo } = useDemo();
  const nav = useNavigate();
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleteData = async () => {
    try { const r = await api<{ message: string }>("/student/data", { method: "DELETE" }); setMsg(r.message); setConfirmDelete(false); endDemo(); }
    catch (e) { setError((e as Error).message); }
  };
  const resetDemo = async () => {
    try { await api("/demo/reset", { method: "POST" }); endDemo(); logout(); nav("/"); }
    catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="space-y-6 fade-in">
      <PageHeader title="Accessibility settings" subtitle="Settings are saved in this browser only." />
      <section className="card space-y-3 p-6" aria-labelledby="theme-h">
        <h2 id="theme-h" className="text-lg font-bold">Theme</h2>
        <div className="flex gap-2">
          <button className={settings.theme === "light" ? "btn-brand" : "btn-ghost"} aria-pressed={settings.theme === "light"} onClick={() => update({ theme: "light" })}><Sun className="h-4 w-4" /> Light</button>
          <button className={settings.theme === "dark" ? "btn-brand" : "btn-ghost"} aria-pressed={settings.theme === "dark"} onClick={() => update({ theme: "dark" })}><Moon className="h-4 w-4" /> Dark</button>
        </div>
      </section>
      <section className="card space-y-3 p-6" aria-labelledby="pal-h">
        <h2 id="pal-h" className="text-lg font-bold">Colour palette for ratings</h2>
        <p className="sub">Ratings always include an icon, a text label and a pattern - colour is never the only signal.</p>
        <Choice<Settings["palette"]> name="Palette" value={settings.palette} onChange={(v) => update({ palette: v })} options={[
          { v: "default", label: "Standard", hint: "Green / amber / red" },
          { v: "cvd", label: "Colour-blind friendly", hint: "Blue / orange / vermillion (Okabe-Ito)" },
          { v: "mono", label: "High-contrast monochrome", hint: "Icons, text and patterns only" },
        ]} />
        <div className="flex flex-wrap gap-2 pt-2" aria-label="Palette preview"><RatingBadge rating="STRONG" score={5} /><RatingBadge rating="OKAY" score={3} /><RatingBadge rating="WEAK" score={1} /></div>
      </section>
      <section className="card space-y-3 p-6" aria-labelledby="txt-h">
        <h2 id="txt-h" className="text-lg font-bold">Typography</h2>
        <p className="sub">Adjust the typeface and spacing to make longer feedback easier to read.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="label mb-2">Font style</p><Choice<Settings["font"]> name="Font style" value={settings.font} onChange={(v) => update({ font: v })} options={[{ v: "standard", label: "Modern and friendly", hint: "DM Sans with Manrope headings" }, { v: "readable", label: "Simple and readable", hint: "Atkinson Hyperlegible / system fallback" }]} /></div>
          <div><p className="label mb-2">Letter spacing</p><Choice<Settings["letterSpacing"]> name="Letter spacing" value={settings.letterSpacing} onChange={(v) => update({ letterSpacing: v })} options={[{ v: "normal", label: "Standard" }, { v: "wide", label: "Wider spacing", hint: "More space between letters and lines" }]} /></div>
        </div>
        <h3 className="pt-2 text-base font-bold">Text size</h3>
        <Choice<Settings["textSize"]> name="Text size" value={settings.textSize} onChange={(v) => update({ textSize: v })} options={[
          { v: "sm", label: "Small" }, { v: "md", label: "Default" }, { v: "lg", label: "Large" }, { v: "xl", label: "Extra large" },
        ]} />
        <label className="flex items-center gap-3 pt-2 text-sm font-medium">
          <input type="checkbox" className="h-5 w-5" checked={settings.reducedMotion} onChange={(e) => update({ reducedMotion: e.target.checked })} />
          Reduce motion (turns off animations and transitions)
        </label>
      </section>
      <section className="card space-y-3 p-6" aria-labelledby="sp-h">
        <h2 id="sp-h" className="text-lg font-bold">Read aloud</h2>
        {!sp.supported ? <Notice tone="warn">Your browser does not support speech synthesis. Try Chrome, Edge or Safari.</Notice> : (
          <>
            <label htmlFor="rate" className="label">Speech speed: {settings.speechRate.toFixed(2)}×</label>
            <input id="rate" type="range" min={0.5} max={2} step={0.25} value={settings.speechRate} onChange={(e) => update({ speechRate: Number(e.target.value) })} className="w-full max-w-md accent-[rgb(var(--accent))]" />
            <div><button className="btn-ghost" onClick={() => sp.speak("test", "This is how GradeGuide will read your feedback aloud.")}><Volume2 className="h-4 w-4" /> Test voice</button></div>
            <p className="sub">Look for the speaker icon next to each piece of feedback, or use "Read all feedback" on the results page. Pause and stop controls appear in the top bar.</p>
          </>
        )}
      </section>
      <section className="card space-y-3 p-6" aria-labelledby="data-h">
        <h2 id="data-h" className="flex items-center gap-2 text-lg font-bold"><Database className="h-5 w-5" aria-hidden /> Your data</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Uploaded files are read in memory and never saved - only the extracted text is stored.</li>
          <li>Drafts are deleted automatically after {config?.retention_days ?? 30} days. Demo accounts use pseudonyms; no emails or student IDs are stored.</li>
          <li>Lecturers only see your work if you press "Ask lecturer to review". Class analytics are anonymised and hidden for small groups.</li>
          <li>In live AI mode, your draft text is sent to OpenAI for analysis. In simulated mode nothing leaves your computer.</li>
        </ul>
        {error && <ErrorBox message={error} />}
        {msg && <Notice tone="ok">{msg}</Notice>}
        <div className="flex flex-wrap gap-2">
          {user?.role === "student" && (confirmDelete
            ? <><button className="btn-danger" onClick={deleteData}><Trash2 className="h-4 w-4" /> Yes, delete everything</button><button className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button></>
            : <button className="btn-danger" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /> Delete my drafts and feedback</button>)}
          <button className="btn-ghost" onClick={resetDemo}><RotateCcw className="h-4 w-4" /> Reset the whole demo database</button>
        </div>
      </section>
    </div>
  );
}
