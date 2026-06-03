import type { ImportedDocument } from '../types/document'
import { formatLabel } from '../lib/parsers/formats'

interface DocumentSidebarProps {
  documents: ImportedDocument[]
  activeId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  notebookCount: number
  view: 'reader' | 'notebook'
  onViewChange: (view: 'reader' | 'notebook') => void
}

export function DocumentSidebar({
  documents,
  activeId,
  onSelect,
  onRemove,
  notebookCount,
  view,
  onViewChange,
}: DocumentSidebarProps) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50">
      <div className="border-b border-slate-200 px-3 py-3">
        <div className="mb-2 flex rounded-lg border border-slate-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => onViewChange('reader')}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
              view === 'reader'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            阅读
          </button>
          <button
            type="button"
            onClick={() => onViewChange('notebook')}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${
              view === 'notebook'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            笔记本{notebookCount > 0 ? ` (${notebookCount})` : ''}
          </button>
        </div>
        {view === 'reader' && (
          <>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              文献库
            </h2>
            <p className="mt-1 text-[11px] text-slate-400">本地保存，不上传服务器</p>
          </>
        )}
      </div>
      {view === 'reader' ? (
      <ul className="pane-scroll flex-1 overflow-y-auto p-2">
        {documents.length === 0 && (
          <li className="px-2 py-4 text-center text-xs text-slate-400">
            导入 PDF / Word / TXT 后开始
          </li>
        )}
        {documents.map((doc) => (
          <li key={doc.id} className="group mb-1">
            <button
              type="button"
              onClick={() => onSelect(doc.id)}
              className={`w-full rounded-lg px-2 py-2 text-left text-sm transition ${
                doc.id === activeId
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span className="line-clamp-2 font-medium">{doc.fileName}</span>
              <span
                className={`mt-1 block text-[10px] ${
                  doc.id === activeId ? 'text-blue-100' : 'text-slate-400'
                }`}
              >
                {formatLabel(doc.format)} · {doc.segments.length} 字段
              </span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(doc.id)
              }}
              className="mt-0.5 w-full text-[10px] text-red-400 opacity-0 group-hover:opacity-100 hover:underline"
            >
              删除
            </button>
          </li>
        ))}
      </ul>
      ) : (
        <div className="pane-scroll flex-1 overflow-y-auto p-3">
          <p className="text-xs leading-relaxed text-slate-500">
            共 {notebookCount} 条收藏。框选原文词语后，在划词翻译弹窗右侧点击「添加到笔记本」。
          </p>
        </div>
      )}
    </aside>
  )
}
