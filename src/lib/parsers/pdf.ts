import * as pdfjsLib from 'pdfjs-dist'
import type { TextSegment } from '../../types/document'
import { resetSegmentCounter } from '../segmenter'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

export async function parsePdf(
  buffer: ArrayBuffer,
): Promise<{ segments: TextSegment[]; plainText: string }> {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pageTexts: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (line) pageTexts.push(line)
  }

  const fullText = pageTexts.join('\n\n')
  resetSegmentCounter()

  const segments: TextSegment[] = pageTexts.map((text, index) => ({
    id: `seg-pdf-${index + 1}`,
    kind: 'paragraph' as const,
    sourceText: text,
    translatedText: '',
    meta: { page: index + 1 },
  }))

  return { segments, plainText: fullText }
}
