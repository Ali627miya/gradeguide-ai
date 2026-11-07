import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface Settings {
  theme: "light" | "dark";
  palette: "default" | "cvd" | "mono";
  textSize: "sm" | "md" | "lg" | "xl";
  font: "standard" | "readable";
  letterSpacing: "normal" | "wide";
  reducedMotion: boolean;
  speechRate: number;
}
const KEY = "gg.settings";
const prefersDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
const prefersReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const defaults: Settings = { theme: prefersDark ? "dark" : "light", palette: "default", textSize: "md", font: "standard", letterSpacing: "normal", reducedMotion: !!prefersReduced, speechRate: 1 };

function load(): Settings {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return defaults; }
}

const Ctx = createContext<{ settings: Settings; update: (p: Partial<Settings>) => void }>({ settings: defaults, update: () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("dark", settings.theme === "dark");
    el.dataset.palette = settings.palette;
    el.dataset.textsize = settings.textSize;
    el.dataset.font = settings.font;
    el.dataset.letterSpacing = settings.letterSpacing;
    el.dataset.reducedMotion = String(settings.reducedMotion);
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
  }, [settings]);
  return <Ctx.Provider value={{ settings, update: (p) => setSettings((s) => ({ ...s, ...p })) }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
