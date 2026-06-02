import { splitByRanges, type TextRange } from '../lib/highlight'

interface HighlightedTextProps {
  text: string
  ranges?: ReadonlyArray<TextRange>
  className?: string
}

export function HighlightedText({ text, ranges, className }: HighlightedTextProps) {
  const parts = splitByRanges(text, ranges ?? [])
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.highlight ? (
          <mark key={i} className="search-highlight">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </span>
  )
}
