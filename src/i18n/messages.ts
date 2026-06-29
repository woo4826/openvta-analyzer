import type { TranslationKey } from "./locales";

export interface LocalizedMessage {
  key: TranslationKey;
  values?: Record<string, string | number>;
}

export type Translate = (key: TranslationKey, values?: Record<string, string | number>) => string;

export function formatLocalizedMessage(message: LocalizedMessage, t: Translate): string {
  return t(message.key, message.values);
}
