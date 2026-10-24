import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import en from "./locales/en.json";
import th from "./locales/th.json";
import ja from "./locales/ja.json";
import zhCN from "./locales/zh-CN.json";
import ar from "./locales/ar.json";

export const LOCALES = [
  { code: "en", label: "English" },
  { code: "th", label: "ไทย" },
  { code: "ja", label: "日本語" },
  { code: "zh-CN", label: "简体中文" },
  { code: "ar", label: "العربية" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

type Dictionary = Record<string, string>;

const DICTIONARIES: Record<Locale, Dictionary> = {
  en,
  th,
  ja,
  "zh-CN": zhCN,
  ar,
};

const RTL_LOCALES: Locale[] = ["ar"];
const STORAGE_KEY = "partnercare.locale";
const FALLBACK: Locale = "en";

function isLocale(value: string | null): value is Locale {
  return !!value && LOCALES.some((l) => l.code === value);
}

interface I18nValue {
  locale: Locale;
  dir: "ltr" | "rtl";
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

// Keep a single context instance across hot reloads so providers and consumers always match.
const g = globalThis as unknown as { __partnercareI18nCtx?: React.Context<I18nValue | null> };
const I18nContext = (g.__partnercareI18nCtx ??= createContext<I18nValue | null>(null));

export function I18nProvider({ children }: { children: ReactNode }) {
  // Server renders the fallback language; the stored preference is applied
  // after hydration to avoid a mismatch.
  const [locale, setLocaleState] = useState<Locale>(FALLBACK);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) {
      setLocaleState(stored);
      return;
    }
    const browser = window.navigator.language;
    const match = LOCALES.find((l) => browser === l.code || browser.split("-")[0] === l.code);
    if (match) setLocaleState(match.code);
  }, []);

  const dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, dir]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = DICTIONARIES[locale]?.[key] ?? DICTIONARIES[FALLBACK][key] ?? key;
      if (!vars) return raw;
      return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), raw);
    },
    [locale],
  );

  const value = useMemo<I18nValue>(() => ({ locale, dir, setLocale, t }), [locale, dir, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}

import COPY from "./copy.json";
type CopyEntry = { th: string; ja: string; "zh-CN": string; ar: string };
const COPY_TABLE = COPY as Record<string, CopyEntry>;

/** Translate inline English copy (keyed by its English text) into the active locale. */
export function translateCopy(locale: Locale, en: string, th?: string): string {
  if (locale === "en") return en;
  const row = COPY_TABLE[en];
  if (locale === "th") return th ?? row?.th ?? en;
  return row?.[locale] ?? en;
}

/** `c(th, en)` for inline page copy, `tr(en)` for English-keyed labels (e.g. demo integration status). */
export function useCopy() {
  const { locale } = useI18n();
  return useMemo(
    () => ({
      c: (th: string, en: string) => translateCopy(locale, en, th),
      tr: (en: string) => translateCopy(locale, en),
    }),
    [locale],
  );
}
