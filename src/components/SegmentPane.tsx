import { useEffect, useRef, useState } from 'react'
import { findSegmentByDom } from '../lib/search'
import type { SegmentHighlights } from '../lib/highlight'
import type { TextSegment } from '../types/document'
import { HighlightedText } from './HighlightedText'

interface SegmentPaneProps {
  title: string
  segments: TextSegment[]
  mode: 'source' | 'translation'
  activeSegmentId: string | null
  searchQuery?: string
  searchHighlights?: Map<string, SegmentHighlights>
  onSegmentActivate: (id: string) => void
  onTranslationEdit?: (id: string, text: string) => void
  onTextSelected?: (text: string, rect: DOMRect) => void
  selectionTranslateEnabled?: boolean
}

function kindLabel(kind: TextSegment['kind'], meta?: TextSegment['meta']): string {
  switch (kind) {
    case 'heading':
      return `标题 H${meta?.level ?? ''}`
    case 'table-cell':
      return `表 ${meta?.tableId ?? ''} · R${(meta?.row ?? 0) + 1}C${(meta?.col ?? 0) + 1}`
    case 'list-item':
      return '列表'
    case 'quote':
      return '引用'
    case 'caption':
      return '图注'
    default:
      return '段落'
  }
}

export function SegmentPane({
  title,
  segments,
  mode,
  activeSegmentId,
  searchQuery = '',
  searchHighlights,
  onSegmentActivate,
  onTranslationEdit,
  onTextSelected,
  selectionTranslateEnabled,
}: SegmentPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const hasSearch = searchQuery.trim().length > 0

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeSegmentId])

  useEffect(() => {
    setEditingId(null)
  }, [searchQuery])

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="shrink-0 border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {mode === 'source'
            ? '框选词语自动翻译 · 点击字段同步右侧'
            : '与左侧同编号字段一一对应'}
        </p>
      </div>
      <div
        ref={scrollRef}
        className="pane-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3"
        onMouseUp={() => {
          const sel = window.getSelection()
          const anchor = sel?.anchorNode ?? null
          const fromSelection = findSegmentByDom(
            segments,
            scrollRef.current!,
            anchor,
          )
          if (fromSelection) {
            onSegmentActivate(fromSelection.id)
          } else if (sel && !sel.isCollapsed && sel.toString().trim()) {
            const focus = sel.focusNode
            const fromFocus = findSegmentByDom(
              segments,
              scrollRef.current!,
              focus,
            )
            if (fromFocus) onSegmentActivate(fromFocus.id)
          }

          if (
            mode === 'source' &&
            selectionTranslateEnabled &&
            onTextSelected &&
            sel &&
            !sel.isCollapsed &&
            scrollRef.current
          ) {
            const selected = sel.toString().trim()
            if (selected.length >= 2) {
              try {
                const range = sel.getRangeAt(0)
                const container = scrollRef.current
                if (container.contains(range.commonAncestorContainer)) {
                  onTextSelected(selected, range.getBoundingClientRect())
                }
              } catch {
                /* ignore invalid range */
              }
            }
          }
        }}
      >
        {segments.map((seg) => {
          const isActive = seg.id === activeSegmentId
          const text = mode === 'source' ? seg.sourceText : seg.translatedText
          const hl = searchHighlights?.get(seg.id)
          const highlightRanges =
            mode === 'source' ? hl?.source : hl?.translation
          const showTranslationHighlight =
            mode === 'translation' &&
            hasSearch &&
            (highlightRanges?.length ?? 0) > 0 &&
            editingId !== seg.id

          return (
            <div
              key={seg.id}
              ref={isActive ? activeRef : undefined}
              data-segment-id={seg.id}
              className={`segment-block mb-2 cursor-pointer rounded-lg px-3 py-2.5 ${isActive ? 'is-active' : ''}`}
              onClick={() => onSegmentActivate(seg.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSegmentActivate(seg.id)
                }
              }}
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                  {seg.id.replace('seg-', '#')}
                </span>
                <span className="text-[10px] text-slate-400">
                  {kindLabel(seg.kind, seg.meta)}
                </span>
              </div>
              {mode === 'translation' && onTranslationEdit ? (
                showTranslationHighlight ? (
                  <div
                    className="w-full rounded border border-transparent bg-transparent text-sm leading-relaxed text-slate-800"
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setEditingId(seg.id)
                    }}
                    title="双击编辑译文"
                  >
                    <HighlightedText text={text} ranges={highlightRanges} />
                  </div>
                ) : (
                  <textarea
                    className="w-full resize-none rounded border border-transparent bg-transparent text-sm leading-relaxed text-slate-800 outline-none focus:border-blue-200 focus:bg-blue-50/30"
                    rows={Math.min(8, Math.max(2, Math.ceil(text.length / 60)))}
                    value={text}
                    placeholder="点击「翻译全文」或选中左侧字段后单独翻译"
                    onChange={(e) => onTranslationEdit(seg.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={() => setEditingId(seg.id)}
                    onBlur={() => setEditingId(null)}
                  />
                )
              ) : (
                <p
                  className={`text-sm leading-relaxed select-text ${
                    seg.kind === 'heading' ? 'font-semibold text-slate-900' : 'text-slate-700'
                  }`}
                >
                  <HighlightedText text={text} ranges={highlightRanges} />
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
