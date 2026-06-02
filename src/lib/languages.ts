export interface Language {
  code: string
  name: string
}

/** 界面显示的中文名 */
export const LANGUAGE_LABELS: Record<string, string> = {
  en: '英语',
  zh: '中文',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  ru: '俄语',
  pt: '葡萄牙语',
  it: '意大利语',
}

export const DEFAULT_LANGUAGES: Language[] = Object.entries(LANGUAGE_LABELS).map(
  ([code, label]) => ({ code, name: label }),
)

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code
}

export function languagePairLabel(from: string, to: string): string {
  return `${languageLabel(from)} → ${languageLabel(to)}`
}
