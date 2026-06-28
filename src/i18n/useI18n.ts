import { createContext, useContext } from "react";
import type { LanguageCode, LanguageMetadata, TranslationKey } from "./locales";

export interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  languages: Record<LanguageCode, LanguageMetadata>;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider.");
  }

  return context;
}
