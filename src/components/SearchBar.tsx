import type { SearchHit } from '../lib/search'
import { HighlightedText } from './HighlightedText'

interface SearchBarProps {
  query: string
  scope: 'document' | 'library'
  hits: SearchHit[]
  hitIndex: number
  onQueryChange: (q: string) => void
  onScopeChange: (s: 'document' | 'library') => void
  onPrev: () => void
  onNext: () => void
  onJumpToHit: (hit: SearchHit) => void
}

export function SearchBar({
  query,
  scope,
  hits,
  hitIndex,
  onQueryChange,
  onScopeChange,
  onPrev,
  onNext,
  onJumpToHit,
}: SearchBarProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="搜索原文或译文（支持模糊匹配）"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <select
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as 'document' | 'library')}
          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700"
        >
          <option value="document">当前文献</option>
          <option value="library">全部文献</option>
        </select>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrev}
            disabled={hits.length === 0}
            className="rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:opacity-40"
          >
            上一处
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={hits.length === 0}
            className="rounded-lg border border-slate-200 px-2 py-2 text-sm disabled:opacity-40"
          >
            下一处
          </button>
          <span className="min-w-[4rem] text-center text-xs text-slate-500">
            {hits.length > 0 ? `${hitIndex + 1} / ${hits.length}` : '0 结果'}
          </span>
        </div>
      </div>
      {query.trim() && hits.length > 0 && (
        <ul className="max-h-28 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50 text-xs">
          {hits.slice(0, 8).map((hit, i) => (
            <li key={`${hit.documentId}-${hit.segmentId}-${i}`}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left hover:bg-blue-50"
                onClick={() => onJumpToHit(hit)}
              >
                <span className="font-medium text-slate-600">{hit.fileName}</span>
                <span className="ml-2 text-slate-400">
                  {hit.field === 'source' ? '原文' : '译文'}
                </span>
                <p className="truncate text-slate-700">
                  <HighlightedText
                    text={hit.snippet}
                    ranges={hit.indices}
                  />
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
