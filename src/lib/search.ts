import Fuse from 'fuse.js'
import type { TextRange } from './highlight'
import type { ImportedDocument, TextSegment } from '../types/document'

export interface SearchHit {
  segmentId: string
  documentId: string
  fileName: string
  snippet: string
  field: 'source' | 'translation'
  indices: ReadonlyArray<TextRange>
  highlights: {
    source: ReadonlyArray<TextRange>
    translation: ReadonlyArray<TextRange>
  }
}

export function searchInDocument(
  doc: ImportedDocument,
  query: string,
): SearchHit[] {
  const q = query.trim()
  if (!q) return []

  const fuse = new Fuse(
    doc.segments.map((s) => ({
      segmentId: s.id,
      source: s.sourceText,
      translation: s.translatedText,
    })),
    {
      keys: ['source', 'translation'],
      threshold: 0.35,
      includeMatches: true,
    },
  )

  return fuse.search(q).map((r) => {
    const matches = r.matches ?? []
    const sourceMatch = matches.find((m) => m.key === 'source')
    const transMatch = matches.find((m) => m.key === 'translation')
    const primary = sourceMatch ?? transMatch ?? matches[0]
    const matchKey = (primary?.key as 'source' | 'translation') ?? 'source'
    const text =
      matchKey === 'translation' ? r.item.translation : r.item.source

    return {
      segmentId: r.item.segmentId,
      documentId: doc.id,
      fileName: doc.fileName,
      snippet: text.slice(0, 120),
      field: matchKey === 'translation' ? 'translation' : 'source',
      indices: [...(primary?.indices ?? [])] as TextRange[],
      highlights: {
        source: [...(sourceMatch?.indices ?? [])] as TextRange[],
        translation: [...(transMatch?.indices ?? [])] as TextRange[],
      },
    }
  })
}

export function searchLibrary(
  docs: ImportedDocument[],
  query: string,
): SearchHit[] {
  return docs.flatMap((d) => searchInDocument(d, query))
}

export function findSegmentByDom(
  segments: TextSegment[],
  container: HTMLElement,
  node: Node | null,
): TextSegment | undefined {
  if (!node) return undefined
  let el: HTMLElement | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement

  while (el && el !== container) {
    const id = el.getAttribute('data-segment-id')
    if (id) {
      return segments.find((s) => s.id === id)
    }
    el = el.parentElement
  }
  return undefined
}
