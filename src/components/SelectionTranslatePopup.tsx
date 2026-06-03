import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { streamRevealText } from '../lib/streamReveal'
import { StreamingText } from './StreamingText'
import { ThinkingIndicator } from './ThinkingIndicator'

interface SelectionTranslatePopupProps {
  sourceText: string
  translation: string
  loading: boolean
  error: string | null
  anchor: DOMRect
  onClose: () => void
  onAddToNotebook?: () => void
  addedToNotebook?: boolean
}

export function SelectionTranslatePopup({
  sourceText,
  translation,
  loading,
  error,
  anchor,
  onClose,
  onAddToNotebook,
  addedToNotebook,
}: SelectionTranslatePopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [displayed, setDisplayed] = useState('')
  const [streaming, setStreaming] = useState(false)
  const streamGenRef = useRef(0)

  useLayoutEffect(() => {
    const el = popupRef.current
    if (!el) return
    const margin = 8
    const maxWidth = 360
    const height = el.offsetHeight
    let top = anchor.bottom + margin
    let left = Math.max(margin, Math.min(anchor.left, window.innerWidth - maxWidth - margin))
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, anchor.top - height - margin)
    }
    setPos({ top, left })
  }, [anchor, sourceText, translation, loading, error, displayed, streaming])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onMouseDown = (e: MouseEvent) => {
      if (popupRef.current?.contains(e.target as Node)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [onClose])

  useEffect(() => {
    if (loading || error) {
      setDisplayed('')
      setStreaming(false)
      return
    }
    if (!translation) {
      setDisplayed('')
      setStreaming(false)
      return
    }

    const gen = ++streamGenRef.current
    setDisplayed('')
    setStreaming(true)

    void streamRevealText(translation, (partial) => {
      if (gen !== streamGenRef.current) return
      setDisplayed(partial)
    }).then(() => {
      if (gen !== streamGenRef.current) return
      setStreaming(false)
    })

    return () => {
      streamGenRef.current += 1
    }
  }, [translation, loading, error])

  return createPortal(
    <div
      ref={popupRef}
      className="fixed z-50 w-[min(360px,calc(100vw-16px))] rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label="划词翻译"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-blue-600">
          划词翻译
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {onAddToNotebook && (
            <button
              type="button"
              disabled={loading || !!error || !translation || addedToNotebook}
              onClick={onAddToNotebook}
              className="rounded-md px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
              title={
                addedToNotebook
                  ? '已在笔记本中'
                  : loading
                    ? '翻译完成后可添加'
                    : '保存到笔记本'
              }
            >
              {addedToNotebook ? '已添加' : '添加到笔记本'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
      </div>
      <p className="mb-2 line-clamp-3 text-xs leading-relaxed text-slate-500">{sourceText}</p>
      {loading ? (
        <ThinkingIndicator label="正在理解并翻译…" />
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <p className="text-sm leading-relaxed text-slate-900">
          <StreamingText text={displayed || translation} streaming={streaming} />
        </p>
      )}
    </div>,
    document.body,
  )
}
