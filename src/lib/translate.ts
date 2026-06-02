import { DEFAULT_LANGUAGES, type Language } from './languages'

export interface TranslateOptions {
  from?: string
  to?: string
}

export interface EngineHealth {
  ok: boolean
  engine: string
  message: string
  enToZh?: boolean
}

export async function checkEngineHealth(): Promise<EngineHealth> {
  try {
    const res = await fetch('/api/health')
    return (await res.json()) as EngineHealth
  } catch {
    return {
      ok: false,
      engine: 'LibreTranslate',
      message:
        '无法连接网站服务。请关闭页面后重新双击 scripts\\dev.bat 启动',
    }
  }
}

export async function fetchLanguages(): Promise<Language[]> {
  try {
    const res = await fetch('/api/languages')
    if (res.ok) {
      const list = (await res.json()) as Language[]
      if (list.length > 0) return list
    }
  } catch {
    /* use fallback */
  }
  return DEFAULT_LANGUAGES
}

async function apiTranslate(
  text: string,
  options?: TranslateOptions,
): Promise<string> {
  const res = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: text,
      source: options?.from ?? 'en',
      target: options?.to ?? 'zh',
    }),
  })
  const data = (await res.json()) as { translatedText?: string; error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? `翻译请求失败 (${res.status})`)
  }
  return data.translatedText ?? ''
}

export async function translateSegment(
  text: string,
  options?: TranslateOptions,
): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) return ''
  return apiTranslate(trimmed, options)
}

export async function translateAllSegments(
  texts: string[],
  options?: TranslateOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const nonEmpty = texts.map((t) => t.trim())
  if (nonEmpty.every((t) => !t)) return texts.map(() => '')

  const res = await fetch('/api/translate/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      texts: nonEmpty,
      source: options?.from ?? 'en',
      target: options?.to ?? 'zh',
    }),
  })
  const data = (await res.json()) as {
    translations?: string[]
    error?: string
  }
  if (!res.ok) {
    throw new Error(data.error ?? `批量翻译失败 (${res.status})`)
  }
  const translations = data.translations ?? []
  if (translations.length !== texts.length) {
    throw new Error('批量翻译结果数量不匹配')
  }

  onProgress?.(texts.length, texts.length)
  return translations
}
