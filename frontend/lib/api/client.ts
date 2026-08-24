import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:8000";
const useMockApi = process.env.NEXT_PUBLIC_USE_MOCK_API !== "false";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const normalizedPath = path.replace(/^\//, "");
  const url = useMockApi
    ? `/api/mock/${normalizedPath}`
    : `${backendUrl}/api/v1/${normalizedPath}`;
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    let message = "The request could not be completed.";
    try {
      const body = (await response.json()) as { detail?: string; message?: string };
      message = body.detail ?? body.message ?? message;
    } catch {}
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

export const frontendApi = {
  dashboard: () => apiRequest<{ greeting: string }>("dashboard"),
  guides: () => apiRequest<{ total: number }>("guides"),
  tasks: () => apiRequest<{ total: number; completed: number }>("tasks"),
  analyzePhoto: () =>
    apiRequest<{ analysisId: string; status: string }>("photo-analysis", {
      method: "POST",
      body: JSON.stringify({ source: "frontend-demo" }),
    }),
  generateChecklist: (task: string) =>
    apiRequest<{ id: string; title: string }>("checklists/generate", {
      method: "POST",
      body: JSON.stringify({ task }),
    }),
  chat: (message: string) =>
    apiRequest<{ answer: string; sources: unknown[] }>("chat", {
      method: "POST",
      body: JSON.stringify({ message, history: [] }),
    }),
};
