import type { SegmentKind, TextSegment } from '../types/document'

let segmentCounter = 0

function nextId(): string {
  segmentCounter += 1
  return `seg-${segmentCounter}`
}

export function resetSegmentCounter(): void {
  segmentCounter = 0
}

function pushSegment(
  list: TextSegment[],
  kind: SegmentKind,
  text: string,
  meta?: TextSegment['meta'],
): void {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed) return
  list.push({
    id: nextId(),
    kind,
    sourceText: trimmed,
    translatedText: '',
    meta,
  })
}

/** 纯文本：按空行分段，适合论文段落 */
export function segmentPlainText(text: string): TextSegment[] {
  resetSegmentCounter()
  const blocks = text.split(/\n\s*\n/)
  const segments: TextSegment[] = []
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) continue
    const joined = lines.join(' ')
    const kind: SegmentKind =
      joined.length < 80 && !joined.endsWith('.') ? 'heading' : 'paragraph'
    pushSegment(segments, kind, joined)
  }
  return segments
}

/** 从 Mammoth 生成的 HTML 提取字段（段落、标题、表格单元格） */
export function segmentFromHtml(html: string): TextSegment[] {
  resetSegmentCounter()
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const segments: TextSegment[] = []

  const walkTable = (table: HTMLTableElement, tableIndex: number) => {
    const tableId = `table-${tableIndex}`
    const rows = table.querySelectorAll('tr')
    rows.forEach((tr, rowIndex) => {
      tr.querySelectorAll('th, td').forEach((cell, colIndex) => {
        pushSegment(segments, 'table-cell', cell.textContent ?? '', {
          tableId,
          row: rowIndex,
          col: colIndex,
        })
      })
    })
  }

  let tableIndex = 0
  const body = doc.body

  const processNode = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    if (tag === 'table') {
      walkTable(el as HTMLTableElement, tableIndex)
      tableIndex += 1
      return
    }

    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote'].includes(tag)) {
      const kind: SegmentKind =
        tag.startsWith('h')
          ? 'heading'
          : tag === 'li'
            ? 'list-item'
            : tag === 'blockquote'
              ? 'quote'
              : 'paragraph'
      const level = tag.startsWith('h') ? Number(tag[1]) : undefined
      pushSegment(segments, kind, el.textContent ?? '', level ? { level } : undefined)
      return
    }

    for (const child of el.children) {
      processNode(child)
    }
  }

  for (const child of body.children) {
    processNode(child)
  }

  if (segments.length === 0) {
    return segmentPlainText(body.textContent ?? '')
  }

  return segments
}

export function buildPlainText(segments: TextSegment[]): string {
  return segments.map((s) => s.sourceText).join('\n\n')
}
