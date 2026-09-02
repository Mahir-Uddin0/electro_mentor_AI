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
  getStoredLanguage,
  languageLocale,
  storeLanguage,
  translate,
  type AppLanguage,
} from "@/lib/i18n";

type LanguageContextValue = {
  language: AppLanguage;
  locale: string;
  setLanguage: (language: AppLanguage) => void;
  t: (text: string, values?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function applyDocumentLanguage(language: AppLanguage) {
  document.documentElement.lang = language === "bn" ? "bn" : "en";
  document.documentElement.dir = "ltr";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>("en");

  const setLanguage = useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    storeLanguage(nextLanguage);
    applyDocumentLanguage(nextLanguage);
  }, []);

  useEffect(() => {
    setLanguage(getStoredLanguage());
    const syncLanguage = (event: StorageEvent) => {
      if (event.key === null || event.key === "electromentor-language") {
        setLanguageState(getStoredLanguage());
        applyDocumentLanguage(getStoredLanguage());
      }
    };
    window.addEventListener("storage", syncLanguage);
    return () => window.removeEventListener("storage", syncLanguage);
  }, [setLanguage]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      locale: languageLocale(language),
      setLanguage,
      t: (text, values) => translate(language, text, values),
    }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}
