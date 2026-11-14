import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Lang = "zh" | "en";

const STORAGE_KEY = "keycopy.lang";

function readUrlLang(): Lang | null {
  if (typeof window === "undefined") return null;
  const search = new URLSearchParams(window.location.search).get("lang");
  if (search === "en" || search === "zh") return search;
  const hashQuery = window.location.hash.split("?")[1];
  if (hashQuery) {
    const hashed = new URLSearchParams(hashQuery).get("lang");
    if (hashed === "en" || hashed === "zh") return hashed;
  }
  return null;
}

function detectInitialLang(): Lang {
  const fromUrl = readUrlLang();
  if (fromUrl) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch {
    // ignore storage errors
  }
  return "zh";
}

let currentLang: Lang = detectInitialLang();

export function getLang(): Lang {
  return currentLang;
}

interface I18nValue {
  lang: Lang;
  setLang: (next: Lang) => void;
  toggleLang: () => void;
  t: (zh: string, en: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    currentLang = detectInitialLang();
    return currentLang;
  });

  const setLang = useCallback((next: Lang) => {
    currentLang = next;
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(currentLang === "zh" ? "en" : "zh");
  }, [setLang]);

  useEffect(() => {
    currentLang = lang;
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  }, [lang]);

  const value = useMemo<I18nValue>(() => ({
    lang,
    setLang,
    toggleLang,
    t: (zh, en) => (lang === "en" ? en : zh),
  }), [lang, setLang, toggleLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("I18nProvider missing");
  return value;
}
