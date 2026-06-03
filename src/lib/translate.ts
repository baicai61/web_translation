import { DEFAULT_LANGUAGES, type Language } from './languages'
import { loadEngineMode, saveEngineMode, type EngineMode } from './storage'

export type { EngineMode } from './storage'

export interface TranslateOptions {
  from?: string
  to?: string
}

function friendlyError(message: string): string {
  if (/[\u4e00-\u9fff]/.test(message)) return message
  const lower = message.toLowerCase()
  if (
    lower.includes('too many requests') ||
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('network error')
  ) {
    return (
      '在线翻译请求过于频繁，或今日免费额度已用完。' +
      '请改用「翻译当前字段」逐段翻译，或双击「启动翻译引擎.bat」启用本地离线引擎。' +
      '也可运行「配置MyMemory邮箱.bat」提高 MyMemory 每日额度。'
    )
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return '连接翻译服务超时，请检查网络后重试。'
  }
  return message || '翻译失败'
}

export interface EngineHealth {
  ok: boolean
  engine: string
  message: string
  enToZh?: boolean
  mode?: EngineMode
  localAvailable?: boolean
  engineSync?: boolean
  mymemoryEmailConfigured?: boolean
}

function engineLabel(rawEngine: string, mode?: EngineMode): string {
  const engine = rawEngine.toLowerCase()
  if (engine.includes('argostranslate') || engine.includes('ctranslate2')) {
    if (mode === 'local') return '本地离线'
    if (mode === 'auto') return '本地优先'
    return '本地 Argos'
  }
  if (engine.includes('mymemory') || engine.includes('online')) {
    if (mode === 'online') return '在线 MyMemory'
    if (mode === 'auto') return '在线备用'
    return '在线 MyMemory'
  }
  return rawEngine
}

function buildHealthMessage(
  mode: EngineMode | undefined,
  localAvailable: boolean | undefined,
  engineSync?: boolean,
  mymemoryEmailConfigured?: boolean,
): string {
  const m = mode ?? 'auto'
  if (engineSync === false) {
    return '模式已切换；请重启「启动翻译引擎.bat」后刷新页面，翻译才会按新模式执行'
  }
  if (m === 'local') {
    return localAvailable
      ? '当前：本地离线（中英互译；其他语言请用在线/自动）'
      : '本地引擎未就绪，请重启「启动翻译引擎.bat」'
  }
  if (m === 'online') {
    return !mymemoryEmailConfigured
      ? '当前：在线 MyMemory（未配置邮箱，约 1 万字符/天；可运行「配置MyMemory邮箱.bat」）'
      : '当前：在线 MyMemory（已配置邮箱，约 10 万字符/天）'
  }
  return localAvailable
    ? '当前：自动模式（优先本地，不可用时会走在线）'
    : '当前：自动模式（本地未安装，使用在线翻译）'
}

export async function checkEngineHealth(): Promise<EngineHealth> {
  try {
    const res = await fetch('/api/health')
    const data = (await res.json()) as EngineHealth & {
      mode?: EngineMode
      localAvailable?: boolean
      mymemoryEmailConfigured?: boolean
    }
    const mode = data.mode ?? 'auto'
    const label = engineLabel(data.engine, mode)
    return {
      ...data,
      mode,
      localAvailable: data.localAvailable,
      engineSync: data.engineSync,
      mymemoryEmailConfigured: data.mymemoryEmailConfigured,
      engine: label,
      message: data.ok
        ? buildHealthMessage(mode, data.localAvailable, data.engineSync, data.mymemoryEmailConfigured)
        : data.message,
    }
  } catch {
    return {
      ok: false,
      engine: '未连接',
      message: '无法连接网站服务。请关闭页面后重新双击 scripts\\dev.bat 启动',
    }
  }
}

export async function setEngineMode(mode: EngineMode): Promise<EngineHealth> {
  const res = await fetch('/api/engine/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
  const data = (await res.json()) as {
    error?: string
    engine?: string
    mode?: EngineMode
    localAvailable?: boolean
    engineSync?: boolean
    mymemoryEmailConfigured?: boolean
    status?: string
  }
  if (!res.ok) {
    throw new Error(friendlyError(data.error ?? '切换引擎模式失败'))
  }

  saveEngineMode(mode)

  const label = engineLabel(data.engine ?? '', mode)
  return {
    ok: true,
    engine: label,
    mode,
    localAvailable: data.localAvailable,
    engineSync: data.engineSync,
    mymemoryEmailConfigured: data.mymemoryEmailConfigured,
    message: buildHealthMessage(mode, data.localAvailable, data.engineSync ?? true, data.mymemoryEmailConfigured),
  }
}

export async function syncEngineModeOnLoad(): Promise<void> {
  const mode = loadEngineMode()
  try {
    await setEngineMode(mode)
  } catch {
    /* 服务未启动时忽略 */
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
    throw new Error(friendlyError(data.error ?? `翻译请求失败 (${res.status})`))
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
    throw new Error(friendlyError(data.error ?? `批量翻译失败 (${res.status})`))
  }
  const translations = data.translations ?? []
  if (translations.length !== texts.length) {
    throw new Error('批量翻译结果数量不匹配')
  }

  onProgress?.(texts.length, texts.length)
  return translations
}
