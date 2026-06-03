import { useMemo, useState } from 'react'
import { languageLabel } from '../lib/languages'
import type { NotebookEntry } from '../types/notebook'

interface NotebookPanelProps {
  entries: NotebookEntry[]
  onRemove: (id: string) => void
  onClear: () => void
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function NotebookPanel({ entries, onRemove, onClear }: NotebookPanelProps) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt)
    if (!q) return sorted
    return sorted.filter(
      (e) =>
        e.sourceText.toLowerCase().includes(q) ||
        e.translation.toLowerCase().includes(q) ||
        (e.documentName?.toLowerCase().includes(q) ?? false),
    )
  }, [entries, query])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">笔记本</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              划词翻译时收集的词语与句子，保存在浏览器本地
            </p>
          </div>
          {entries.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`确定清空全部 ${entries.length} 条记录？`)) {
                  onClear()
                }
              }}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 hover:bg-red-100"
            >
              清空全部
            </button>
          )}
        </div>
        {entries.length > 0 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索原文、译文或文献名…"
            className="mt-3 w-full max-w-md rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
          />
        )}
      </div>

      <div className="pane-scroll min-h-0 flex-1 overflow-y-auto p-4">
        {entries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-slate-600">笔记本还是空的</p>
            <p className="max-w-sm text-sm text-slate-400">
              在阅读文献时框选词语，在划词翻译弹窗中点击「添加到笔记本」即可收藏
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">没有匹配「{query}」的记录</p>
        ) : (
          <ul className="mx-auto flex max-w-3xl flex-col gap-3">
            {filtered.map((entry) => (
              <li
                key={entry.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <p className="text-sm font-medium leading-relaxed text-slate-900">
                    {entry.sourceText}
                  </p>
                  <button
                    type="button"
                    onClick={() => onRemove(entry.id)}
                    className="shrink-0 rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-100 hover:text-red-600"
                    aria-label="删除"
                  >
                    删除
                  </button>
                </div>
                <p className="text-sm leading-relaxed text-blue-800">{entry.translation}</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                  <span>{formatDate(entry.createdAt)}</span>
                  <span>
                    {languageLabel(entry.langFrom)} → {languageLabel(entry.langTo)}
                  </span>
                  {entry.documentName && <span>来自 {entry.documentName}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
