import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "../lib/api";
import type { AppConfig, Role, User } from "../lib/types";

interface AuthApi {
  user: User | null; loading: boolean; config: AppConfig | null; configError: string | null;
  login: (role: Role) => Promise<User>; adopt: (token: string, user: User) => void; logout: () => void;
}
const Ctx = createContext<AuthApi | null>(null);
const USER_KEY = "gg.user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try { return tokenStore.get() ? JSON.parse(localStorage.getItem(USER_KEY) || "null") : null; } catch { return null; }
  });
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const adopt = useCallback((token: string, u: User) => {
    tokenStore.set(token);
    try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch { /* ignore */ }
    setUser(u);
  }, []);
  const logout = useCallback(() => {
    tokenStore.set(null);
    try { localStorage.removeItem(USER_KEY); sessionStorage.removeItem("gg.demo"); } catch { /* ignore */ }
    setUser(null);
  }, []);

  useEffect(() => {
    api<AppConfig>("/config").then(setConfig).catch((e) => setConfigError(e.message));
    if (tokenStore.get()) {
      api<User>("/auth/me").then(setUser).catch(() => logout()).finally(() => setLoading(false));
    } else setLoading(false);
    const onUnauth = () => logout();
    window.addEventListener("gg:unauthorised", onUnauth);
    return () => window.removeEventListener("gg:unauthorised", onUnauth);
  }, [logout]);

  const login = async (role: Role) => {
    const r = await api<{ token: string; user: User }>("/auth/demo-login", { body: { role } });
    adopt(r.token, r.user);
    return r.user;
  };
  return <Ctx.Provider value={{ user, loading, config, configError, login, adopt, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx)!;
