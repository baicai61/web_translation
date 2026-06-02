import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface SelectionTranslatePopupProps {
  sourceText: string
  translation: string
  loading: boolean
  error: string | null
  anchor: DOMRect
  onClose: () => void
}

export function SelectionTranslatePopup({
  sourceText,
  translation,
  loading,
  error,
  anchor,
  onClose,
}: SelectionTranslatePopupProps) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

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
  }, [anchor, sourceText, translation, loading, error])

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
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="关闭"
        >
          ✕
        </button>
      </div>
      <p className="mb-2 line-clamp-3 text-xs leading-relaxed text-slate-500">{sourceText}</p>
      {loading ? (
        <p className="text-sm text-slate-400">翻译中…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <p className="text-sm leading-relaxed text-slate-900">{translation}</p>
      )}
    </div>,
    document.body,
  )
}
