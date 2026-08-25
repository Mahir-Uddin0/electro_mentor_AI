import type { Session } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const EXPIRY_SKEW_SECONDS = 30;
let clearingSession: Promise<void> | null = null;

function clearPersistedAuthCookies() {
  if (typeof window === "undefined") return;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return;
  try {
    const projectReference = new URL(supabaseUrl).hostname.split(".")[0];
    const storageKey = `sb-${projectReference}-auth-token`;
    window.localStorage.removeItem(storageKey);
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=", 1)[0]?.trim();
      if (name === storageKey || name?.startsWith(`${storageKey}.`)) {
        document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
      }
    });
  } catch {
    // Invalid configuration is handled by the normal unauthenticated flow.
  }
}

export function isSessionExpired(session: Session, skewSeconds = 0) {
  return (
    typeof session.expires_at !== "number" ||
    session.expires_at <= Math.floor(Date.now() / 1000) + skewSeconds
  );
}

export async function clearBrowserSession() {
  if (!clearingSession) {
    clearingSession = (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // A failed or unreachable refresh session must not be reused.
      } finally {
        // signOut can return early when loading the broken session itself
        // fails, so remove any stale persisted token chunks as a fallback.
        clearPersistedAuthCookies();
      }
    })().finally(() => {
      clearingSession = null;
    });
  }
  await clearingSession;
}

export function redirectToLogin(reason = "session_expired") {
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  const loginUrl = new URL("/login", window.location.origin);
  loginUrl.searchParams.set("reason", reason);
  const nextPath = `${window.location.pathname}${window.location.search}`;
  if (nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    loginUrl.searchParams.set("next", nextPath);
  }
  window.location.replace(loginUrl.toString());
}

export async function invalidateBrowserSession(options: { redirect?: boolean } = {}) {
  await clearBrowserSession();
  if (options.redirect !== false) redirectToLogin();
}

export async function getFreshAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const current = await supabase.auth.getSession();
  let session = current.data.session;
  if (current.error || !session) {
    await invalidateBrowserSession();
    return null;
  }

  // getSession refreshes an expired token itself. Refresh explicitly when the
  // returned token is close to expiring so it cannot expire in transit.
  if (isSessionExpired(session, EXPIRY_SKEW_SECONDS)) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
    if (refreshed.error || !session || isSessionExpired(session)) {
      await invalidateBrowserSession();
      return null;
    }
  }

  return session.access_token;
}
