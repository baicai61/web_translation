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
  setEngineMode,
  syncEngineModeOnLoad,
  translateSegment,
  type EngineHealth,
  type EngineMode,
} from './lib/translate'
import { streamRevealText } from './lib/streamReveal'
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
  const [modeSwitching, setModeSwitching] = useState(false)
  const [languages, setLanguages] = useState<Language[]>([])
  const [langFrom, setLangFrom] = useState(() => loadLangPair().from)
  const [langTo, setLangTo] = useState(() => loadLangPair().to)
  const [selectionTranslate, setSelectionTranslate] =
    useState<SelectionTranslateState | null>(null)
  const selectionReqRef = useRef(0)
  const translateRunRef = useRef(0)
  const [streamingTexts, setStreamingTexts] = useState<Record<string, string>>({})
  const [pendingSegmentIds, setPendingSegmentIds] = useState<Set<string>>(() => new Set())
  const [translateProgress, setTranslateProgress] = useState<{
    current: number
    total: number
  } | null>(null)

  const setSegmentPending = useCallback((segmentId: string, pending: boolean) => {
    setPendingSegmentIds((prev) => {
      const next = new Set(prev)
      if (pending) next.add(segmentId)
      else next.delete(segmentId)
      return next
    })
  }, [])

  useEffect(() => {
    void syncEngineModeOnLoad()
      .then(() => checkEngineHealth())
      .then(setEngine)
    void fetchLanguages().then(setLanguages)
    const timer = setInterval(() => {
      void checkEngineHealth().then(setEngine)
    }, 30_000)
    return () => clearInterval(timer)
  }, [])

  const handleEngineMode = async (mode: EngineMode) => {
    if (engine?.mode === mode || modeSwitching) return
    setModeSwitching(true)
    setError(null)
    try {
      const health = await setEngineMode(mode)
      setEngine(health)
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换翻译模式失败')
    } finally {
      setModeSwitching(false)
    }
  }

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

  const revealTranslation = useCallback(
    async (
      docId: string,
      segmentId: string,
      fullText: string,
      runId: number,
    ): Promise<void> => {
      setStreamingTexts((prev) => ({ ...prev, [segmentId]: '' }))
      await streamRevealText(fullText, (partial) => {
        if (runId !== translateRunRef.current) return
        setStreamingTexts((prev) => ({ ...prev, [segmentId]: partial }))
      })
      if (runId !== translateRunRef.current) return
      updateDoc(docId, (doc) => ({
        ...doc,
        segments: doc.segments.map((s) =>
          s.id === segmentId ? { ...s, translatedText: fullText } : s,
        ),
      }))
      setStreamingTexts((prev) => {
        const next = { ...prev }
        delete next[segmentId]
        return next
      })
    },
    [updateDoc],
  )

  const handleImport = async (files: FileList | null) => {
    // 必须在首个 await 前拷贝：input 清空后 FileList 会失效
    const fileList = Array.from(files ?? [])
    if (fileList.length === 0) return
    setImporting(true)
    setError(null)
    try {
      const { importFile } = await import('./lib/parsers')
      const imported: ImportedDocument[] = []
      for (const file of fileList) {
        imported.push(await importFile(file))
      }
      if (imported.length === 0) {
        throw new Error('未能导入任何文件')
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

  const translateOneSegment = useCallback(
    async (
      docId: string,
      segmentId: string,
      sourceText: string,
      runId: number,
    ): Promise<void> => {
      const trimmed = sourceText.trim()
      if (!trimmed) {
        updateDoc(docId, (doc) => ({
          ...doc,
          segments: doc.segments.map((s) =>
            s.id === segmentId ? { ...s, translatedText: '' } : s,
          ),
        }))
        return
      }

      setSegmentPending(segmentId, true)
      try {
        const full = await translateSegment(trimmed, translateOptions)
        if (runId !== translateRunRef.current) return
        setSegmentPending(segmentId, false)
        await revealTranslation(docId, segmentId, full, runId)
      } finally {
        if (runId === translateRunRef.current) {
          setSegmentPending(segmentId, false)
        }
      }
    },
    [revealTranslation, setSegmentPending, translateOptions, updateDoc],
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
    const runId = ++translateRunRef.current
    setTranslating(true)
    setError(null)
    setTranslateProgress({ current: 0, total: activeDoc.segments.length })
    try {
      const segments = activeDoc.segments
      for (let i = 0; i < segments.length; i++) {
        if (runId !== translateRunRef.current) return
        const seg = segments[i]
        setActiveSegmentId(seg.id)
        setTranslateProgress({ current: i + 1, total: segments.length })
        await translateOneSegment(activeDoc.id, seg.id, seg.sourceText, runId)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '翻译失败')
    } finally {
      if (runId === translateRunRef.current) {
        setTranslating(false)
        setTranslateProgress(null)
      }
    }
  }

  const handleTranslateActive = async () => {
    if (!activeDoc || !activeSegmentId) return
    const seg = activeDoc.segments.find((s) => s.id === activeSegmentId)
    if (!seg) return
    const runId = ++translateRunRef.current
    setTranslating(true)
    setError(null)
    setTranslateProgress(null)
    try {
      await translateOneSegment(activeDoc.id, activeSegmentId, seg.sourceText, runId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '翻译失败')
    } finally {
      if (runId === translateRunRef.current) {
        setTranslating(false)
      }
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
            <div className="mt-1">
              <p
                className={`text-xs ${engine.ok ? 'text-emerald-600' : 'text-amber-600'}`}
                title={engine.message}
              >
                {engine.ok
                  ? `${engine.engine} · 已就绪`
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
              {engine.ok && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">翻译模式</span>
                  <div
                    className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5"
                    role="group"
                    aria-label="翻译模式"
                  >
                    {(
                      [
                        ['auto', '自动'],
                        ['local', '本地'],
                        ['online', '在线'],
                      ] as const
                    ).map(([mode, label]) => {
                      const active = (engine.mode ?? 'auto') === mode
                      return (
                        <button
                          key={mode}
                          type="button"
                          disabled={modeSwitching}
                          title={
                            mode === 'local'
                              ? '离线英→中，不限流（其他语言对请用在线/自动）'
                              : mode === 'online'
                                ? 'MyMemory 在线，有频率与每日额度限制'
                                : '优先本地，不可用时自动走在线'
                          }
                          onClick={() => void handleEngineMode(mode)}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                            active
                              ? 'bg-white text-blue-700 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  {modeSwitching && (
                    <span className="text-xs text-slate-400">切换中…</span>
                  )}
                </div>
              )}
              {engine.ok && engine.mode === 'local' && (langFrom !== 'en' || langTo !== 'zh') && (
                <p className="mt-1 text-xs text-amber-600">
                  本地模式仅支持英→中；当前为 {languageLabel(langFrom)}→{languageLabel(langTo)}，请改语言或切换「在线」
                </p>
              )}
              {engine.ok && engine.engineSync === false && (
                <p className="mt-1 text-xs text-amber-600">
                  请重启「启动翻译引擎.bat」并刷新页面，切换才会作用于翻译
                </p>
              )}
            </div>
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
                const input = e.target
                void handleImport(input.files).finally(() => {
                  input.value = ''
                })
              }}
            />
          </label>
          <button
            type="button"
            disabled={!activeDoc || translating || engine?.ok === false}
            onClick={() => void handleTranslateAll()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {translating
              ? translateProgress
                ? `翻译中 ${translateProgress.current}/${translateProgress.total}…`
                : '翻译中…'
              : '翻译全文'}
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
                streamingTexts={streamingTexts}
                pendingSegmentIds={pendingSegmentIds}
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
