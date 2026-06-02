import type { ImportedDocument } from '../../types/document'
import { buildPlainText, segmentFromHtml, segmentPlainText } from '../segmenter'
import { parseDocFile, parseDocx } from './doc'
import { parseEpub } from './epub'
import {
  ACCEPT_IMPORT,
  formatFromFileName,
  IMPORT_FORMAT_HINT,
  IMPORT_FORMAT_SUMMARY,
  formatLabel,
} from './formats'
import { parsePdf } from './pdf'
import { parseCsv, parseTextFile } from './text'

function newDocId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export async function importFile(file: File): Promise<ImportedDocument> {
  const format = formatFromFileName(file.name)
  if (!format) {
    throw new Error(`暂不支持该格式。当前支持：${IMPORT_FORMAT_SUMMARY}`)
  }

  const buffer = await file.arrayBuffer()

  let segments
  let plainText: string

  switch (format) {
    case 'pdf': {
      const result = await parsePdf(buffer)
      segments = result.segments
      plainText = result.plainText
      break
    }
    case 'docx': {
      const html = await parseDocx(buffer)
      segments = segmentFromHtml(html)
      plainText = buildPlainText(segments)
      break
    }
    case 'doc': {
      const { html } = await parseDocFile(buffer)
      segments = segmentFromHtml(html)
      plainText = buildPlainText(segments)
      break
    }
    case 'csv': {
      const result = parseCsv(buffer)
      segments = result.segments
      plainText = result.plainText
      break
    }
    case 'epub': {
      const result = await parseEpub(buffer)
      segments = result.segments
      plainText = result.plainText
      break
    }
    case 'md':
    case 'txt':
    case 'html':
    case 'rtf': {
      const textFormat = format === 'txt' ? 'txt' : format
      const text = await parseTextFile(buffer, textFormat)
      if (format === 'html') {
        segments = segmentFromHtml(text)
      } else {
        segments = segmentPlainText(text)
      }
      plainText = buildPlainText(segments)
      break
    }
    default:
      throw new Error('未知格式')
  }

  if (segments.length === 0) {
    throw new Error(
      '未能从文件中提取可读文本。PDF 请确认能复制文字；Word 请使用 .docx；旧版 .doc 请另存为 .docx',
    )
  }

  return {
    id: newDocId(),
    fileName: file.name,
    format,
    importedAt: Date.now(),
    segments,
    plainText,
  }
}

export {
  ACCEPT_IMPORT,
  IMPORT_FORMAT_HINT,
  IMPORT_FORMAT_SUMMARY,
  formatLabel,
  formatFromFileName,
}
