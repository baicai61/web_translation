import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DocumentSidebar } from './components/DocumentSidebar'
import { LanguageSelector } from './components/LanguageSelector'
import { SearchBar } from './components/SearchBar'
import { SegmentPane } from './components/SegmentPane'
import { SelectionTranslatePopup } from './components/SelectionTranslatePopup'
import { ACCEPT_IMPORT, IMPORT_FORMAT_SUMMARY } from './lib/parsers/formats'
import type { SearchHit } from './lib/search'
import { searchInDocument, searchLibrary } from './lib/search'
import { buildSegmentHighlights } from './lib/highlight'
import { languageLabel } from './lib/languages'
import {
  loadActiveId,
  loadLangPair,
  loadLibrary,
  saveActiveId,
  saveLangPair,
  saveLibrary,
} from './lib/storage'
import {
  checkEngineHealth,
  fetchLanguages,
  translateAllSegments,
  translateSegment,
  type EngineHealth,
} from './lib/translate'
import type { Language } from './lib/languages'
import type { ImportedDocument } from './types/document'

interface SelectionTranslateState {
  text: string
  rect: DOMRect
  translation: string
  loading: boolean
  error: string | null
}

function App() {
  const [documents, setDocuments] = useState<ImportedDocument[]>(() => loadLibrary())
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveId())
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'document' | 'library'>('document')
  const [hitIndex, setHitIndex] = useState(0)
  const [importing, setImporting] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [engine, setEngine] = useState<EngineHealth | null>(null)
  const [languages, setLanguages] = useState<Language[]>([])
  const [langFrom, setLangFrom] = useState(() => loadLangPair().from)
  const [langTo, setLangTo] = useState(() => loadLangPair().to)
  const [selectionTranslate, setSelectionTranslate] =
    useState<SelectionTranslateState | null>(null)
  const selectionReqRef = useRef(0)

  useEffect(() => {
    void checkEngineHealth().then(setEngine)
    void fetchLanguages().then(setLanguages)
    const timer = setInterval(() => {
      void checkEngineHealth().then(setEngine)
    }, 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    saveLangPair(langFrom, langTo)
  }, [langFrom, langTo])

  const activeDoc = useMemo(
    () => documents.find((d) => d.id === activeId) ?? null,
    [documents, activeId],
  )

  useEffect(() => {
    saveLibrary(documents)
  }, [documents])

  useEffect(() => {
    saveActiveId(activeId)
  }, [activeId])

  useEffect(() => {
    if (documents.length === 0) {
      setActiveId(null)
      return
    }
    if (!activeId || !documents.some((d) => d.id === activeId)) {
      setActiveId(documents[0].id)
    }
  }, [documents, activeId])

  const hits: SearchHit[] = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    if (scope === 'library') return searchLibrary(documents, q)
    if (!activeDoc) return []
    return searchInDocument(activeDoc, q)
  }, [query, scope, documents, activeDoc])

  const searchHighlights = useMemo(
    () => buildSegmentHighlights(hits, activeDoc?.id),
    [hits, activeDoc?.id],
  )

  useEffect(() => {
    setHitIndex(0)
  }, [query, scope, activeId])

  const updateDoc = useCallback(
    (docId: string, updater: (doc: ImportedDocument) => ImportedDocument) => {
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? updater(d) : d)),
      )
    },
    [],
  )

  const handleImport = async (files: FileList | null) => {
    if (!files?.length) return
    setImporting(true)
    setError(null)
    try {
      const { importFile } = await import('./lib/parsers')
      const imported: ImportedDocument[] = []
      for (const file of Array.from(files)) {
        imported.push(await importFile(file))
      }
      setDocuments((prev) => [...imported, ...prev])
      setActiveId(imported[0].id)
      setActiveSegmentId(imported[0].segments[0]?.id ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const translateOptions = useMemo(
    () => ({ from: langFrom, to: langTo }),
    [langFrom, langTo],
  )

  const handleTextSelected = useCallback(
    async (text: string, rect: DOMRect) => {
      const reqId = ++selectionReqRef.current
      if (!engine?.ok) {
        setSelectionTranslate({
          text,
          rect,
          translation: '',
          loading: false,
          error: '翻译引擎未就绪',
        })
        return
      }
      setSelectionTranslate({
        text,
        rect,
        translation: '',
        loading: true,
        error: null,
      })
      try {
        const translation = await translateSegment(text, translateOptions)
        if (reqId !== selectionReqRef.current) return
        setSelectionTranslate({
          text,
          rect,
          translation,
          loading: false,
          error: null,
        })
      } catch (e) {
        if (reqId !== selectionReqRef.current) return
        setSelectionTranslate({
          text,
          rect,
          translation: '',
          loading: false,
          error: e instanceof Error ? e.message : '翻译失败',
        })
      }
    },
    [engine?.ok, translateOptions],
  )

  const handleTranslateAll = async () => {
    if (!activeDoc) return
    setTranslating(true)
    setError(null)
    try {
      const texts = activeDoc.segments.map((s) => s.sourceText)
      const results = await translateAllSegments(texts, translateOptions, () => {})
      updateDoc(activeDoc.id, (doc) => ({
        ...doc,
        segments: doc.segments.map((s, i) => ({
          ...s,
          translatedText: results[i] ?? '',
        })),
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : '翻译失败')
    } finally {
      setTranslating(false)
    }
  }

  const handleTranslateActive = async () => {
    if (!activeDoc || !activeSegmentId) return
    const seg = activeDoc.segments.find((s) => s.id === activeSegmentId)
    if (!seg) return
    setTranslating(true)
    setError(null)
    try {
      const translated = await translateSegment(seg.sourceText, translateOptions)
      updateDoc(activeDoc.id, (doc) => ({
        ...doc,
        segments: doc.segments.map((s) =>
          s.id === activeSegmentId ? { ...s, translatedText: translated } : s,
        ),
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : '翻译失败')
    } finally {
      setTranslating(false)
    }
  }

  const jumpToHit = (hit: SearchHit) => {
    if (hit.documentId !== activeId) {
      setActiveId(hit.documentId)
    }
    setActiveSegmentId(hit.segmentId)
    const idx = hits.findIndex(
      (h) => h.segmentId === hit.segmentId && h.documentId === hit.documentId,
    )
    if (idx >= 0) setHitIndex(idx)
  }

  const goHit = (delta: number) => {
    if (hits.length === 0) return
    const next = (hitIndex + delta + hits.length) % hits.length
    setHitIndex(next)
    jumpToHit(hits[next])
  }

  return (
    <div className="flex h-full min-h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900">文献译读</h1>
          <p className="text-xs text-slate-500">多语言文献 · 字段对照 · 全文可搜</p>
          {engine && (
            <p
              className={`mt-1 text-xs ${engine.ok ? 'text-emerald-600' : 'text-amber-600'}`}
              title={engine.message}
            >
              {engine.ok
                ? `开源引擎 ${engine.engine} · 已就绪`
                : `翻译引擎未就绪：${engine.message}`}
              {!engine.ok && (
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => void checkEngineHealth().then(setEngine)}
                >
                  重新检测
                </button>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {languages.length > 0 && (
            <LanguageSelector
              languages={languages}
              from={langFrom}
              to={langTo}
              disabled={translating}
              onFromChange={setLangFrom}
              onToChange={setLangTo}
              onSwap={() => {
                setLangFrom(langTo)
                setLangTo(langFrom)
              }}
            />
          )}
          <label
            className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            title={`支持：${IMPORT_FORMAT_SUMMARY}`}
          >
            {importing ? '导入中…' : '导入文献'}
            <input
              type="file"
              className="hidden"
              multiple
              accept={ACCEPT_IMPORT}
              onChange={(e) => {
                void handleImport(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
          <button
            type="button"
            disabled={!activeDoc || translating || engine?.ok === false}
            onClick={() => void handleTranslateAll()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {translating ? '翻译中…' : '翻译全文'}
          </button>
          <button
            type="button"
            disabled={!activeSegmentId || translating || engine?.ok === false}
            onClick={() => void handleTranslateActive()}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 hover:bg-blue-100 disabled:opacity-50"
          >
            翻译当前字段
          </button>
        </div>
      </header>

      {error && (
        <div className="shrink-0 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="flex min-h-0 flex-1">
        <DocumentSidebar
          documents={documents}
          activeId={activeId}
          onSelect={(id) => {
            setActiveId(id)
            const doc = documents.find((d) => d.id === id)
            setActiveSegmentId(doc?.segments[0]?.id ?? null)
          }}
          onRemove={(id) => {
            setDocuments((prev) => prev.filter((d) => d.id !== id))
          }}
        />

        <main className="flex min-w-0 flex-1 flex-col">
          <SearchBar
            query={query}
            scope={scope}
            hits={hits}
            hitIndex={hitIndex}
            onQueryChange={setQuery}
            onScopeChange={setScope}
            onPrev={() => goHit(-1)}
            onNext={() => goHit(1)}
            onJumpToHit={jumpToHit}
          />

          {activeDoc ? (
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-3">
              <SegmentPane
                title={`原文（${languageLabel(langFrom)}）· ${activeDoc.fileName}`}
                segments={activeDoc.segments}
                mode="source"
                activeSegmentId={activeSegmentId}
                searchQuery={query}
                searchHighlights={searchHighlights}
                onSegmentActivate={setActiveSegmentId}
                selectionTranslateEnabled={engine?.ok !== false}
                onTextSelected={handleTextSelected}
              />
              <SegmentPane
                title={`译文（${languageLabel(langTo)}）· 与左侧同字段编号`}
                segments={activeDoc.segments}
                mode="translation"
                activeSegmentId={activeSegmentId}
                searchQuery={query}
                searchHighlights={searchHighlights}
                onSegmentActivate={setActiveSegmentId}
                onTranslationEdit={(id, text) => {
                  updateDoc(activeDoc.id, (doc) => ({
                    ...doc,
                    segments: doc.segments.map((s) =>
                      s.id === id ? { ...s, translatedText: text } : s,
                    ),
                  }))
                }}
              />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-slate-600">导入文献开始阅读</p>
              <p className="max-w-lg text-sm text-slate-400">
                支持 {IMPORT_FORMAT_SUMMARY} 等格式，可多选同时导入；PDF 需为可复制文字版
              </p>
            </div>
          )}
        </main>
      </div>

      {selectionTranslate && (
        <SelectionTranslatePopup
          sourceText={selectionTranslate.text}
          translation={selectionTranslate.translation}
          loading={selectionTranslate.loading}
          error={selectionTranslate.error}
          anchor={selectionTranslate.rect}
          onClose={() => {
            selectionReqRef.current += 1
            setSelectionTranslate(null)
          }}
        />
      )}
    </div>
  )
}

export default App
