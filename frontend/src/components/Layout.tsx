import {
  Accessibility, BarChart3, BookOpenCheck, ClipboardList, Code2, FileText, GitCompareArrows, GraduationCap, History,
  LayoutDashboard, Lightbulb, LogOut, Menu, Moon, Plus, ShieldCheck, Sun, Upload, Users, X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSettings } from "../context/SettingsContext";
import { DemoGuide } from "./DemoGuide";
import { ModeBadge, SpeechControls } from "./ui";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="h-9 w-9 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="16" fill={light ? "#ffffff1a" : "#0f2147"} />
        <path d="M18 34l9 9 19-21" fill="none" stroke="#2dd4bf" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="46" cy="18" r="4" fill="#fbbf24" />
      </svg>
      <span className={`font-display text-lg font-extrabold leading-none ${light ? "text-white" : "text-ink"}`}>
        GradeGuide<span className="text-accent"> AI</span>
      </span>
    </span>
  );
}

const studentNav = [
  { to: "/student", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/student/new", label: "New assessment", icon: Plus },
  { to: "/student/assignments", label: "My assignments", icon: FileText },
  { to: "/student/checklist", label: "Improvement checklist", icon: ClipboardList },
  { to: "/student/progress", label: "Progress & comparison", icon: GitCompareArrows },
  { to: "/student/history", label: "History", icon: History },
];
const profNav = [
  { to: "/professor", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/professor/modules", label: "Modules & assignments", icon: GraduationCap },
  { to: "/professor/rubrics/import", label: "Import questions", icon: Upload },
  { to: "/professor/rubrics/code", label: "Code assessment", icon: Code2 },
  { to: "/professor/rubrics/report", label: "Report assessment", icon: BookOpenCheck },
  { to: "/professor/analytics", label: "Class analytics", icon: BarChart3 },
  { to: "/professor/insights", label: "Teaching insights", icon: Lightbulb },
  { to: "/professor/reviews", label: "Shared for review", icon: Users },
];
const common = [
  { to: "/how-it-works", label: "How it works & integrity", icon: ShieldCheck },
  { to: "/settings", label: "Accessibility settings", icon: Accessibility },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, config } = useAuth();
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => setOpen(false), [loc.pathname]);
  const items = user?.role === "professor" ? profNav : studentNav;

  const sidebar = (
    <nav aria-label="Main navigation" className="flex h-full flex-col gap-1 p-4">
      <div className="mb-5 px-2"><Logo light /></div>
      <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-white/50">{user?.role === "professor" ? "Lecturer" : "Student"}</p>
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
          <i.icon className="h-4 w-4" aria-hidden />{i.label}
        </NavLink>
      ))}
      <p className="mt-5 px-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-white/50">Help</p>
      {common.map((i) => (
        <NavLink key={i.to} to={i.to}
          className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? "bg-white/15 text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
          <i.icon className="h-4 w-4" aria-hidden />{i.label}
        </NavLink>
      ))}
      <div className="mt-auto rounded-xl bg-white/10 p-3 text-xs text-white/80">
        <p className="font-semibold text-white">{user?.display_name}</p>
        <p className="mt-0.5">Local demo account · no personal data stored</p>
        <button className="mt-2 inline-flex items-center gap-1.5 font-semibold text-white hover:underline" onClick={() => { logout(); nav("/"); }}>
          <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only-focusable fixed left-3 top-3 z-50 rounded bg-accent px-3 py-2 text-accentink">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-[#0f2147] lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-[#0f2147] fade-in">
            <button className="absolute right-3 top-3 rounded p-2 text-white" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/85 px-4 py-3 backdrop-blur md:px-8">
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
          <div className="lg:hidden"><Logo /></div>
          <div className="ml-auto flex items-center gap-2">
            <SpeechControls />
            {config && <span className="hidden sm:inline-flex"><ModeBadge mode={config.ai_mode} model={config.model} /></span>}
            <button className="btn-ghost !px-2.5" onClick={() => update({ theme: settings.theme === "dark" ? "light" : "dark" })}
              aria-label={settings.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} title="Toggle light/dark mode">
              {settings.theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <NavLink to="/settings" className="btn-ghost !px-2.5" aria-label="Accessibility settings" title="Accessibility settings"><Accessibility className="h-4 w-4" /></NavLink>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 py-6 pb-40 md:px-8 md:py-8" tabIndex={-1}>{children}</main>
      </div>
      <DemoGuide />
    </div>
  );
}
