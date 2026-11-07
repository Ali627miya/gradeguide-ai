import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSettings } from "./SettingsContext";

type State = "idle" | "speaking" | "paused";
interface SpeechApi {
  supported: boolean; state: State; currentId: string | null;
  speak: (id: string, text: string) => void; speakAll: (items: { id: string; text: string }[]) => void;
  pause: () => void; resume: () => void; stop: () => void;
}
const Ctx = createContext<SpeechApi | null>(null);

export function SpeechProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [state, setState] = useState<State>("idle");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const queue = useRef<{ id: string; text: string }[]>([]);
  const rate = useRef(settings.speechRate);
  rate.current = settings.speechRate;

  const playNext = useCallback(() => {
    const item = queue.current.shift();
    if (!item) { setState("idle"); setCurrentId(null); return; }
    const u = new SpeechSynthesisUtterance(item.text);
    u.rate = rate.current;
    u.lang = "en-GB";
    u.onend = () => playNext();
    u.onerror = () => { setState("idle"); setCurrentId(null); };
    setCurrentId(item.id);
    setState("speaking");
    window.speechSynthesis.speak(u);
  }, []);

  const start = useCallback((items: { id: string; text: string }[]) => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    queue.current = items.filter((i) => i.text.trim());
    playNext();
  }, [supported, playNext]);

  const api: SpeechApi = {
    supported, state, currentId,
    speak: (id, text) => start([{ id, text }]),
    speakAll: (items) => start(items),
    pause: () => { if (supported) { window.speechSynthesis.pause(); setState("paused"); } },
    resume: () => { if (supported) { window.speechSynthesis.resume(); setState("speaking"); } },
    stop: () => { if (supported) { queue.current = []; window.speechSynthesis.cancel(); setState("idle"); setCurrentId(null); } },
  };
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const useSpeech = () => useContext(Ctx)!;
