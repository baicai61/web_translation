import { languageLabel } from '../lib/languages'
import type { Language } from '../lib/languages'

interface LanguageSelectorProps {
  languages: Language[]
  from: string
  to: string
  onFromChange: (code: string) => void
  onToChange: (code: string) => void
  onSwap: () => void
  disabled?: boolean
}

export function LanguageSelector({
  languages,
  from,
  to,
  onFromChange,
  onToChange,
  onSwap,
  disabled,
}: LanguageSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm text-slate-600">
        <span className="whitespace-nowrap">源语言</span>
        <select
          value={from}
          disabled={disabled}
          onChange={(e) => onFromChange(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:opacity-50"
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code} disabled={lang.code === to}>
              {languageLabel(lang.code)}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        disabled={disabled}
        onClick={onSwap}
        title="交换源语言与目标语言"
        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
        aria-label="交换语言方向"
      >
        ⇄
      </button>

      <label className="flex items-center gap-1.5 text-sm text-slate-600">
        <span className="whitespace-nowrap">目标语言</span>
        <select
          value={to}
          disabled={disabled}
          onChange={(e) => onToChange(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:opacity-50"
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code} disabled={lang.code === from}>
              {languageLabel(lang.code)}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
