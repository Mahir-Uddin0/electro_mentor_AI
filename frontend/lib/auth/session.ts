import {
  AuthApiError,
  type AuthSession,
  getBackendUser,
  refreshBackendSession,
  revokeBackendSession,
} from "@/lib/auth/client";

const SESSION_STORAGE_KEY = "electromentor-auth-session";
const SESSION_CHANGE_EVENT = "electromentor-auth-session-change";
const EXPIRY_SKEW_MILLISECONDS = 30_000;

let refreshInFlight: Promise<AuthSession | null> | null = null;
let clearingSession: Promise<void> | null = null;

function isAuthUser(value: unknown): value is AuthSession["user"] {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<AuthSession["user"]>;
  return (
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    (typeof user.display_name === "string" || user.display_name === null) &&
    user.is_active === true &&
    typeof user.created_at === "string" &&
    typeof user.updated_at === "string"
  );
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<AuthSession>;
  return (
    typeof session.accessToken === "string" &&
    typeof session.accessTokenExpiresAt === "number" &&
    typeof session.refreshToken === "string" &&
    typeof session.refreshTokenExpiresAt === "number" &&
    isAuthUser(session.user)
  );
}

function announceSessionChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT));
  }
}

export function getStoredAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const serialized = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!serialized) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (isAuthSession(parsed)) return parsed;
  } catch {
    // Corrupt browser state is handled as a signed-out session.
  }
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  return null;
}

export function storeAuthSession(session: AuthSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  announceSessionChange();
}

function removeStoredAuthSession(expectedRefreshToken?: string) {
  if (typeof window === "undefined") return;
  if (expectedRefreshToken) {
    const current = getStoredAuthSession();
    if (current && current.refreshToken !== expectedRefreshToken) return;
  }
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  announceSessionChange();
}

export function subscribeToAuthSession(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === SESSION_STORAGE_KEY) listener();
  };
  window.addEventListener(SESSION_CHANGE_EVENT, listener);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(SESSION_CHANGE_EVENT, listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export async function clearBrowserSession() {
  if (!clearingSession) {
    clearingSession = (async () => {
      const session = getStoredAuthSession();
      removeStoredAuthSession();
      if (session) await revokeBackendSession(session.refreshToken);
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

export async function invalidateBrowserSession(
  options: { redirect?: boolean } = {},
) {
  await clearBrowserSession();
  if (options.redirect !== false) redirectToLogin();
}

export async function getFreshAccessToken(): Promise<string | null> {
  const session = getStoredAuthSession();
  if (!session) return null;

  const now = Date.now();
  if (session.refreshTokenExpiresAt <= now) {
    removeStoredAuthSession();
    return null;
  }
  if (session.accessTokenExpiresAt > now + EXPIRY_SKEW_MILLISECONDS) {
    return session.accessToken;
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const refreshed = await refreshBackendSession(session.refreshToken);
        const current = getStoredAuthSession();
        if (!current || current.refreshToken !== session.refreshToken) {
          await revokeBackendSession(refreshed.refreshToken);
          return current;
        }
        storeAuthSession(refreshed);
        return refreshed;
      } catch (error) {
        if (error instanceof AuthApiError && error.status === 401) {
          removeStoredAuthSession(session.refreshToken);
          return getStoredAuthSession();
        }
        throw error;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }

  return (await refreshInFlight)?.accessToken ?? null;
}

export async function restoreAuthSession(): Promise<AuthSession | null> {
  const stored = getStoredAuthSession();
  if (!stored) return null;
  try {
    const accessToken = await getFreshAccessToken();
    if (!accessToken) return null;
    const user = await getBackendUser(accessToken);
    const current = getStoredAuthSession();
    if (!current) return null;
    if (current.accessToken !== accessToken) return current;
    const restored = { ...current, user };
    storeAuthSession(restored);
    return restored;
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) {
      removeStoredAuthSession();
      return null;
    }
    // Preserve a non-expired local session during a temporary network outage.
    return getStoredAuthSession();
  }
}
