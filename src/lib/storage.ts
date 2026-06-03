import type { ImportedDocument } from '../types/document'

const LIBRARY_KEY = 'fanyi-student-library'
const ACTIVE_KEY = 'fanyi-student-active-id'

export function loadLibrary(): ImportedDocument[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (!raw) return []
    return JSON.parse(raw) as ImportedDocument[]
  } catch {
    return []
  }
}

export function saveLibrary(docs: ImportedDocument[]): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(docs))
}

export function loadActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY)
}

export function saveActiveId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

const LANG_PAIR_KEY = 'fanyi-lang-pair'

export interface LangPair {
  from: string
  to: string
}

export function loadLangPair(): LangPair {
  try {
    const raw = localStorage.getItem(LANG_PAIR_KEY)
    if (!raw) return { from: 'en', to: 'zh' }
    const parsed = JSON.parse(raw) as LangPair
    if (parsed.from && parsed.to && parsed.from !== parsed.to) {
      return parsed
    }
  } catch {
    /* ignore */
  }
  return { from: 'en', to: 'zh' }
}

export function saveLangPair(from: string, to: string): void {
  localStorage.setItem(LANG_PAIR_KEY, JSON.stringify({ from, to }))
}

const ENGINE_MODE_KEY = 'fanyi-engine-mode'

export type EngineMode = 'auto' | 'local' | 'online'

export function loadEngineMode(): EngineMode {
  try {
    const raw = localStorage.getItem(ENGINE_MODE_KEY)
    if (raw === 'auto' || raw === 'local' || raw === 'online') return raw
  } catch {
    /* ignore */
  }
  return 'auto'
}

export function saveEngineMode(mode: EngineMode): void {
  localStorage.setItem(ENGINE_MODE_KEY, mode)
}
