"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { KeyRound } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { Card } from "@/components/ui";
import {
  API_KEY_REQUIRED_EVENT,
  frontendApi,
  type GeminiApiKeyStatus,
} from "@/lib/api/client";

type ApiKeyContextValue = {
  status: GeminiApiKeyStatus | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  save: (form: HTMLFormElement) => Promise<void>;
  remove: () => Promise<void>;
};

const ApiKeyContext = createContext<ApiKeyContextValue | undefined>(undefined);

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const { loading: authLoading, session, previewMode } = useAuth();
  const [status, setStatus] = useState<GeminiApiKeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (previewMode) {
      setStatus({ configured: true, masked_key: "****", updated_at: null });
      setError("");
      setLoading(false);
      return;
    }
    if (!session) {
      setStatus(null);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setStatus(await frontendApi.getGeminiApiKeyStatus());
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your API key status could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [previewMode, session]);

  useEffect(() => {
    if (!authLoading) void refresh();
  }, [authLoading, refresh]);

  useEffect(() => {
    const markMissing = () =>
      setStatus({ configured: false, masked_key: null, updated_at: null });
    window.addEventListener(API_KEY_REQUIRED_EVENT, markMissing);
    return () => window.removeEventListener(API_KEY_REQUIRED_EVENT, markMissing);
  }, []);

  const save = useCallback(async (form: HTMLFormElement) => {
    setStatus(await frontendApi.saveGeminiApiKey(form));
    setError("");
    form.reset();
  }, []);

  const remove = useCallback(async () => {
    await frontendApi.deleteGeminiApiKey();
    setStatus({ configured: false, masked_key: null, updated_at: null });
    setError("");
  }, []);

  const value = useMemo(
    () => ({ status, loading, error, refresh, save, remove }),
    [status, loading, error, refresh, save, remove],
  );

  return <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>;
}

export function useApiKey() {
  const value = useContext(ApiKeyContext);
  if (!value) throw new Error("useApiKey must be used inside ApiKeyProvider");
  return value;
}

export function ApiKeyNotice({ blocking = false }: { blocking?: boolean }) {
  const { t } = useLanguage();
  return (
    <Card className={`api-key-notice ${blocking ? "api-key-notice-blocking" : ""}`}>
      <span className="api-key-notice-icon"><KeyRound size={22} /></span>
      <div>
        <h1>{t("Add your Gemini API key to use AI features")}</h1>
        <p>
          {t("Your key is encrypted by the backend and is never displayed after you save it.")}
        </p>
      </div>
      <Link className="button button-primary" href="/settings#gemini-api-key">
        {t("Add API key")}
      </Link>
    </Card>
  );
}
