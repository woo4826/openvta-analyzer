import { useEffect, useMemo, useState, type ReactNode } from "react";
import { I18nContext } from "./useI18n";
import { detectInitialLanguage, interpolate, LANGUAGE_STORAGE_KEY, translations, type LanguageCode, type TranslationKey } from "./locales";

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [language, setLanguage] = useState<LanguageCode>(() => detectInitialLanguage());

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Language selection should still work when browser storage is blocked.
    }
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: TranslationKey, values?: Record<string, string | number>) => interpolate(translations[language][key], values),
    }),
    [language],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
