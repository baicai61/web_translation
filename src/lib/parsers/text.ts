import { buildPlainText, segmentPlainText } from '../segmenter'
import type { TextSegment } from '../../types/document'

function decodeBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.slice(3))
  }

  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length
  if (replacementCount > Math.max(2, utf8.length * 0.01)) {
    try {
      return new TextDecoder('gb18030').decode(bytes)
    } catch {
      try {
        return new TextDecoder('gbk').decode(bytes)
      } catch {
        return utf8
      }
    }
  }
  return utf8
}

export async function parseTextFile(
  buffer: ArrayBuffer,
  format: 'txt' | 'md' | 'html' | 'rtf' | 'csv',
): Promise<string> {
  let text = decodeBuffer(buffer)

  if (format === 'rtf') {
    text = text
      .replace(/\\[a-z]+\d* ?/gi, '')
      .replace(/[{}]/g, '')
  }

  return text
}

export function parseCsv(buffer: ArrayBuffer): { segments: TextSegment[]; plainText: string } {
  const text = decodeBuffer(buffer)
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  const segments: TextSegment[] = []
  let row = 0

  for (const line of lines) {
    const cells = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    cells.forEach((cell, col) => {
      const cleaned = cell.replace(/^"|"$/g, '').trim()
      if (!cleaned) return
      segments.push({
        id: `seg-csv-${row + 1}-${col + 1}`,
        kind: 'table-cell',
        sourceText: cleaned,
        translatedText: '',
        meta: { tableId: 'csv', row, col },
      })
    })
    row += 1
  }

  if (segments.length === 0) {
    return { segments: segmentPlainText(text), plainText: text }
  }

  return { segments, plainText: buildPlainText(segments) }
}
