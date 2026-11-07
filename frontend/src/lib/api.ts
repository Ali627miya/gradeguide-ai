// Small fetch wrapper: adds the demo session token and turns API errors into readable messages.
const TOKEN_KEY = "gg.token";

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string | null) => {
    try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

function friendly(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d: { msg?: string; loc?: string[] }) => {
      const field = d.loc ? d.loc.filter((x) => x !== "body").join(" › ") : "";
      return `${field ? field + ": " : ""}${(d.msg || "").replace(/^Value error, /, "")}`;
    }).join("; ");
  }
  if (status === 0) return "Cannot reach the GradeGuide server. Is the backend running on port 8000?";
  return `Request failed (${status}).`;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.body); }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: opts.method || (body ? "POST" : "GET"), headers, body });
  } catch {
    throw new ApiError(0, friendly(null, 0));
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent("gg:unauthorised"));
    const detail = (data as { detail?: unknown })?.detail;
    throw new ApiError(res.status, detail !== undefined ? friendly(detail, res.status)
      : res.status >= 500 || res.status === 404 && !data ? "The server is not responding correctly. Is the backend running on port 8000?" : friendly(null, res.status));
  }
  return data as T;
}
