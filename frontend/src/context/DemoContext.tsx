import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface DemoState {
  active: boolean; step: number; assignmentId?: number; draft1Id?: number; assessment1Id?: number;
  draft2Id?: number; assessment2Id?: number; minimised?: boolean;
}
const KEY = "gg.demo";
const empty: DemoState = { active: false, step: 1 };

const Ctx = createContext<{ demo: DemoState; setDemo: (p: Partial<DemoState>) => void; endDemo: () => void }>({
  demo: empty, setDemo: () => {}, endDemo: () => {},
});

export function DemoProvider({ children }: { children: ReactNode }) {
  const [demo, set] = useState<DemoState>(() => {
    try { return { ...empty, ...JSON.parse(sessionStorage.getItem(KEY) || "{}") }; } catch { return empty; }
  });
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(demo)); } catch { /* ignore */ } }, [demo]);
  return (
    <Ctx.Provider value={{ demo, setDemo: (p) => set((d) => ({ ...d, ...p })), endDemo: () => set(empty) }}>
      {children}
    </Ctx.Provider>
  );
}
export const useDemo = () => useContext(Ctx);
