"use client";

import type { Session, User } from "@supabase/supabase-js";
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
  getSupabaseBrowserClient,
  isPreviewModeAllowed,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  previewMode: boolean;
  enterPreviewMode: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const PREVIEW_KEY = "electromentor-preview-mode";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    const storedPreview = window.localStorage.getItem(PREVIEW_KEY) === "true";
    if (!isPreviewModeAllowed && storedPreview) {
      window.localStorage.removeItem(PREVIEW_KEY);
    }
    setPreviewMode(isPreviewModeAllowed && storedPreview);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const enterPreviewMode = useCallback(() => {
    if (!isPreviewModeAllowed) return;
    window.localStorage.setItem(PREVIEW_KEY, "true");
    setPreviewMode(true);
  }, []);

  const signOut = useCallback(async () => {
    window.localStorage.removeItem(PREVIEW_KEY);
    setPreviewMode(false);
    const supabase = getSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      previewMode,
      enterPreviewMode,
      signOut,
    }),
    [session, loading, previewMode, enterPreviewMode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
