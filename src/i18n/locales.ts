export const LANGUAGE_STORAGE_KEY = "openvta.language.v1";

export type LanguageCode = "en" | "ko" | "ja" | "zh-CN" | "es" | "fr" | "de";

export type LanguageQuality = "primary" | "secondary";

export interface LanguageMetadata {
  code: LanguageCode;
  nativeName: string;
  englishName: string;
  quality: LanguageQuality;
}

export const languages: Record<LanguageCode, LanguageMetadata> = {
  en: {
    code: "en",
    nativeName: "English",
    englishName: "English",
    quality: "primary",
  },
  ko: {
    code: "ko",
    nativeName: "한국어",
    englishName: "Korean",
    quality: "primary",
  },
  ja: {
    code: "ja",
    nativeName: "日本語",
    englishName: "Japanese",
    quality: "secondary",
  },
  "zh-CN": {
    code: "zh-CN",
    nativeName: "简体中文",
    englishName: "Chinese (Simplified)",
    quality: "secondary",
  },
  es: {
    code: "es",
    nativeName: "Español",
    englishName: "Spanish",
    quality: "secondary",
  },
  fr: {
    code: "fr",
    nativeName: "Français",
    englishName: "French",
    quality: "secondary",
  },
  de: {
    code: "de",
    nativeName: "Deutsch",
    englishName: "German",
    quality: "secondary",
  },
};

const englishTranslations = {
  "app.title": "OpenVTA Analyzer",
  "app.subtitle": "Inspect vehicle telemetry, GPS tracks, and acceleration data.",
  "actions.apply": "Apply",
  "actions.cancel": "Cancel",
  "actions.close": "Close",
  "actions.reset": "Reset",
  "common.language": "Language",
  "language.selector.label": "Language",
  "language.selector.placeholder": "Choose language",
  "language.quality.primary": "Primary translation",
  "language.quality.secondary": "Secondary translation",
  "language.current": "Current language: {language}",
  "language.changed": "Language changed to {language}.",
  "status.ready": "Ready",
  "status.loading": "Loading...",
  "status.error": "Something went wrong.",
  "file.drop.title": "Drop OpenVTA files here",
  "file.drop.hint": "Supports .vta, .zip, and related telemetry exports.",
  "empty.noFile": "Open a file to begin analysis.",
  "nav.overview": "Overview",
  "nav.charts": "Charts",
  "nav.map": "Map",
  "nav.settings": "Settings",
} as const;

export type TranslationKey = keyof typeof englishTranslations;

export type TranslationDictionary = Record<TranslationKey, string>;

export const translations: Record<LanguageCode, TranslationDictionary> = {
  en: englishTranslations,
  ko: {
    "app.title": "OpenVTA 분석기",
    "app.subtitle": "차량 텔레메트리, GPS 경로, 가속도 데이터를 검사합니다.",
    "actions.apply": "적용",
    "actions.cancel": "취소",
    "actions.close": "닫기",
    "actions.reset": "재설정",
    "common.language": "언어",
    "language.selector.label": "언어",
    "language.selector.placeholder": "언어 선택",
    "language.quality.primary": "기본 번역",
    "language.quality.secondary": "보조 번역",
    "language.current": "현재 언어: {language}",
    "language.changed": "언어가 {language}(으)로 변경되었습니다.",
    "status.ready": "준비됨",
    "status.loading": "불러오는 중...",
    "status.error": "문제가 발생했습니다.",
    "file.drop.title": "OpenVTA 파일을 여기에 놓으세요",
    "file.drop.hint": ".vta, .zip 및 관련 텔레메트리 내보내기를 지원합니다.",
    "empty.noFile": "분석을 시작하려면 파일을 여세요.",
    "nav.overview": "개요",
    "nav.charts": "차트",
    "nav.map": "지도",
    "nav.settings": "설정",
  },
  ja: {
    "app.title": "OpenVTA アナライザー",
    "app.subtitle": "車両テレメトリ、GPS トラック、加速度データを確認します。",
    "actions.apply": "適用",
    "actions.cancel": "キャンセル",
    "actions.close": "閉じる",
    "actions.reset": "リセット",
    "common.language": "言語",
    "language.selector.label": "言語",
    "language.selector.placeholder": "言語を選択",
    "language.quality.primary": "主要翻訳",
    "language.quality.secondary": "補助翻訳",
    "language.current": "現在の言語: {language}",
    "language.changed": "言語を {language} に変更しました。",
    "status.ready": "準備完了",
    "status.loading": "読み込み中...",
    "status.error": "問題が発生しました。",
    "file.drop.title": "OpenVTA ファイルをここにドロップ",
    "file.drop.hint": ".vta、.zip、および関連するテレメトリ書き出しに対応しています。",
    "empty.noFile": "分析を始めるにはファイルを開いてください。",
    "nav.overview": "概要",
    "nav.charts": "チャート",
    "nav.map": "地図",
    "nav.settings": "設定",
  },
  "zh-CN": {
    "app.title": "OpenVTA 分析器",
    "app.subtitle": "检查车辆遥测、GPS 轨迹和加速度数据。",
    "actions.apply": "应用",
    "actions.cancel": "取消",
    "actions.close": "关闭",
    "actions.reset": "重置",
    "common.language": "语言",
    "language.selector.label": "语言",
    "language.selector.placeholder": "选择语言",
    "language.quality.primary": "主要翻译",
    "language.quality.secondary": "辅助翻译",
    "language.current": "当前语言：{language}",
    "language.changed": "语言已更改为 {language}。",
    "status.ready": "就绪",
    "status.loading": "正在加载...",
    "status.error": "出现问题。",
    "file.drop.title": "将 OpenVTA 文件拖放到此处",
    "file.drop.hint": "支持 .vta、.zip 和相关遥测导出。",
    "empty.noFile": "打开文件以开始分析。",
    "nav.overview": "概览",
    "nav.charts": "图表",
    "nav.map": "地图",
    "nav.settings": "设置",
  },
  es: {
    "app.title": "Analizador OpenVTA",
    "app.subtitle": "Inspecciona telemetria del vehiculo, rutas GPS y datos de aceleracion.",
    "actions.apply": "Aplicar",
    "actions.cancel": "Cancelar",
    "actions.close": "Cerrar",
    "actions.reset": "Restablecer",
    "common.language": "Idioma",
    "language.selector.label": "Idioma",
    "language.selector.placeholder": "Elegir idioma",
    "language.quality.primary": "Traduccion principal",
    "language.quality.secondary": "Traduccion secundaria",
    "language.current": "Idioma actual: {language}",
    "language.changed": "Idioma cambiado a {language}.",
    "status.ready": "Listo",
    "status.loading": "Cargando...",
    "status.error": "Algo salio mal.",
    "file.drop.title": "Suelta archivos OpenVTA aqui",
    "file.drop.hint": "Admite .vta, .zip y exportaciones de telemetria relacionadas.",
    "empty.noFile": "Abre un archivo para comenzar el analisis.",
    "nav.overview": "Resumen",
    "nav.charts": "Graficos",
    "nav.map": "Mapa",
    "nav.settings": "Configuracion",
  },
  fr: {
    "app.title": "Analyseur OpenVTA",
    "app.subtitle": "Inspectez la telemetrie du vehicule, les traces GPS et les donnees d'acceleration.",
    "actions.apply": "Appliquer",
    "actions.cancel": "Annuler",
    "actions.close": "Fermer",
    "actions.reset": "Reinitialiser",
    "common.language": "Langue",
    "language.selector.label": "Langue",
    "language.selector.placeholder": "Choisir la langue",
    "language.quality.primary": "Traduction principale",
    "language.quality.secondary": "Traduction secondaire",
    "language.current": "Langue actuelle : {language}",
    "language.changed": "Langue changee en {language}.",
    "status.ready": "Pret",
    "status.loading": "Chargement...",
    "status.error": "Un probleme est survenu.",
    "file.drop.title": "Deposez les fichiers OpenVTA ici",
    "file.drop.hint": "Prend en charge .vta, .zip et les exports de telemetrie associes.",
    "empty.noFile": "Ouvrez un fichier pour commencer l'analyse.",
    "nav.overview": "Vue d'ensemble",
    "nav.charts": "Graphiques",
    "nav.map": "Carte",
    "nav.settings": "Parametres",
  },
  de: {
    "app.title": "OpenVTA-Analyzer",
    "app.subtitle": "Prufe Fahrzeugtelemetrie, GPS-Spuren und Beschleunigungsdaten.",
    "actions.apply": "Anwenden",
    "actions.cancel": "Abbrechen",
    "actions.close": "Schliessen",
    "actions.reset": "Zurucksetzen",
    "common.language": "Sprache",
    "language.selector.label": "Sprache",
    "language.selector.placeholder": "Sprache auswahlen",
    "language.quality.primary": "Primaere Ubersetzung",
    "language.quality.secondary": "Sekundaere Ubersetzung",
    "language.current": "Aktuelle Sprache: {language}",
    "language.changed": "Sprache zu {language} geandert.",
    "status.ready": "Bereit",
    "status.loading": "Laden...",
    "status.error": "Etwas ist schiefgelaufen.",
    "file.drop.title": "OpenVTA-Dateien hier ablegen",
    "file.drop.hint": "Unterstutzt .vta, .zip und verwandte Telemetrie-Exporte.",
    "empty.noFile": "Offnen Sie eine Datei, um die Analyse zu beginnen.",
    "nav.overview": "Ubersicht",
    "nav.charts": "Diagramme",
    "nav.map": "Karte",
    "nav.settings": "Einstellungen",
  },
};

interface LanguageDetectionSources {
  storage?: Pick<Storage, "getItem"> | null;
  navigatorLanguage?: string | null;
  navigatorLanguages?: readonly string[] | null;
}

export function isSupportedLanguage(value: string | null | undefined): value is LanguageCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(languages, value);
}

export function normalizeLanguage(value: string | null | undefined): LanguageCode | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().replace(/_/g, "-");
  const lowerCase = normalized.toLowerCase();

  if (lowerCase === "zh" || lowerCase.startsWith("zh-")) {
    return "zh-CN";
  }

  const baseLanguage = lowerCase.split("-")[0];
  if (baseLanguage === "en" || baseLanguage === "ko" || baseLanguage === "ja" || baseLanguage === "es" || baseLanguage === "fr" || baseLanguage === "de") {
    return baseLanguage;
  }

  return undefined;
}

export function detectInitialLanguage(sources: LanguageDetectionSources = {}): LanguageCode {
  const storage = "storage" in sources ? (sources.storage ?? null) : getBrowserStorage();
  const storedLanguage = readStoredLanguage(storage);

  if (storedLanguage) {
    const normalizedStoredLanguage = normalizeLanguage(storedLanguage);
    if (normalizedStoredLanguage) {
      return normalizedStoredLanguage;
    }
  }

  const browserLanguages = getLanguageCandidates(sources);
  for (const browserLanguage of browserLanguages) {
    const normalizedBrowserLanguage = normalizeLanguage(browserLanguage);
    if (normalizedBrowserLanguage) {
      return normalizedBrowserLanguage;
    }
  }

  return "en";
}

export function interpolate(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_match, key: string) => {
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

function readStoredLanguage(storage: Pick<Storage, "getItem"> | null): string | null {
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getBrowserStorage(): Pick<Storage, "getItem"> | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getLanguageCandidates(sources: LanguageDetectionSources): readonly string[] {
  if ("navigatorLanguages" in sources) {
    return sources.navigatorLanguages ?? [];
  }

  if ("navigatorLanguage" in sources) {
    return sources.navigatorLanguage ? [sources.navigatorLanguage] : [];
  }

  if (typeof navigator === "undefined") {
    return [];
  }

  return navigator.languages.length > 0 ? navigator.languages : [navigator.language];
}
