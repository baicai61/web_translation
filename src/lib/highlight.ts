export type TextRange = readonly [number, number]

export function mergeRanges(ranges: ReadonlyArray<TextRange>): TextRange[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const merged: TextRange[] = [[sorted[0][0], sorted[0][1]]]
  for (let i = 1; i < sorted.length; i++) {
    const [start, end] = sorted[i]
    const last = merged[merged.length - 1]
    if (start <= last[1] + 1) {
      merged[merged.length - 1] = [last[0], Math.max(last[1], end)]
    } else {
      merged.push([start, end])
    }
  }
  return merged
}

export interface TextPart {
  text: string
  highlight: boolean
}

export function splitByRanges(text: string, ranges: ReadonlyArray<TextRange>): TextPart[] {
  const merged = mergeRanges(ranges)
  if (merged.length === 0) return [{ text, highlight: false }]

  const parts: TextPart[] = []
  let cursor = 0
  for (const [start, end] of merged) {
    const safeStart = Math.max(0, start)
    const safeEnd = Math.min(text.length - 1, end)
    if (safeStart > cursor) {
      parts.push({ text: text.slice(cursor, safeStart), highlight: false })
    }
    if (safeEnd >= safeStart) {
      parts.push({ text: text.slice(safeStart, safeEnd + 1), highlight: true })
      cursor = safeEnd + 1
    }
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), highlight: false })
  }
  return parts.length > 0 ? parts : [{ text, highlight: false }]
}

export interface SegmentHighlights {
  source: TextRange[]
  translation: TextRange[]
}

export function buildSegmentHighlights(
  hits: Array<{
    segmentId: string
    documentId: string
    field: 'source' | 'translation'
    indices: ReadonlyArray<TextRange>
    highlights?: { source: ReadonlyArray<TextRange>; translation: ReadonlyArray<TextRange> }
  }>,
  documentId?: string | null,
): Map<string, SegmentHighlights> {
  const map = new Map<string, SegmentHighlights>()
  for (const hit of hits) {
    if (documentId && hit.documentId !== documentId) continue
    const existing = map.get(hit.segmentId) ?? { source: [], translation: [] }
    if (hit.highlights) {
      existing.source.push(...hit.highlights.source)
      existing.translation.push(...hit.highlights.translation)
    } else if (hit.indices.length > 0) {
      existing[hit.field].push(...hit.indices)
    }
    map.set(hit.segmentId, existing)
  }
  for (const [id, h] of map) {
    map.set(id, {
      source: mergeRanges(h.source),
      translation: mergeRanges(h.translation),
    })
  }
  return map
}
