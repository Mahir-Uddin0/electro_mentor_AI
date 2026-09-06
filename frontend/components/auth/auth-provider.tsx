"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  type AuthSession,
  type RegisterInput,
  type SignInInput,
  type AuthUser,
  isPreviewModeAllowed,
  registerWithBackend,
  signInWithBackend,
} from "@/lib/auth/client";
import {
  clearBrowserSession,
  getStoredAuthSession,
  restoreAuthSession,
  storeAuthSession,
  subscribeToAuthSession,
} from "@/lib/auth/session";

type AuthContextValue = {
  session: AuthSession | null;
  user: AuthUser | null;
  loading: boolean;
  previewMode: boolean;
  enterPreviewMode: () => void;
  signIn: (input: SignInInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const PREVIEW_KEY = "electromentor-preview-mode";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    const storedPreview = window.localStorage.getItem(PREVIEW_KEY) === "true";
    if (!isPreviewModeAllowed && storedPreview) {
      window.localStorage.removeItem(PREVIEW_KEY);
    }
    setPreviewMode(isPreviewModeAllowed && storedPreview);

    let active = true;
    const syncSession = () => {
      if (active) setSession(getStoredAuthSession());
    };
    const unsubscribe = subscribeToAuthSession(syncSession);

    void restoreAuthSession()
      .then((restored) => {
        if (!active) return;
        setSession(restored);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.refreshTokenExpiresAt) return;
    let timer: number;
    const clearWhenExpired = () => {
      const remaining = session.refreshTokenExpiresAt - Date.now();
      if (remaining <= 0) {
        void clearBrowserSession();
        return;
      }
      // Browsers clamp very large timers; reschedule instead of accidentally
      // expiring sessions whose configured refresh lifetime exceeds that limit.
      timer = window.setTimeout(
        clearWhenExpired,
        Math.min(remaining + 250, 2_147_000_000),
      );
    };
    clearWhenExpired();
    return () => window.clearTimeout(timer);
  }, [session?.refreshTokenExpiresAt]);

  const enterPreviewMode = useCallback(() => {
    if (!isPreviewModeAllowed) return;
    window.localStorage.setItem(PREVIEW_KEY, "true");
    setPreviewMode(true);
  }, []);

  const signIn = useCallback(async (input: SignInInput) => {
    const nextSession = await signInWithBackend(input);
    window.localStorage.removeItem(PREVIEW_KEY);
    setPreviewMode(false);
    storeAuthSession(nextSession);
    setSession(nextSession);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const nextSession = await registerWithBackend(input);
    window.localStorage.removeItem(PREVIEW_KEY);
    setPreviewMode(false);
    storeAuthSession(nextSession);
    setSession(nextSession);
  }, []);

  const signOut = useCallback(async () => {
    window.localStorage.removeItem(PREVIEW_KEY);
    setPreviewMode(false);
    await clearBrowserSession();
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      previewMode,
      enterPreviewMode,
      signIn,
      register,
      signOut,
    }),
    [
      session,
      loading,
      previewMode,
      enterPreviewMode,
      signIn,
      register,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
