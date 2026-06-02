import type { DocumentFormat } from '../../types/document'

export interface FormatInfo {
  format: DocumentFormat
  extensions: string[]
  label: string
  /** 导入对话框中的简短说明 */
  hint: string
}

/** 当前支持的导入格式（扩展名 → 解析器） */
export const SUPPORTED_FORMATS: FormatInfo[] = [
  { format: 'pdf', extensions: ['pdf'], label: 'PDF', hint: '学术论文、扫描版 PDF（需可复制文字）' },
  { format: 'docx', extensions: ['docx'], label: 'Word', hint: 'Word 2007+ (.docx)' },
  { format: 'doc', extensions: ['doc'], label: 'Word 旧版', hint: '旧版 .doc（优先尝试解析，失败请另存为 .docx）' },
  { format: 'txt', extensions: ['txt', 'log'], label: 'TXT', hint: '纯文本，自动识别 UTF-8 / GBK' },
  { format: 'md', extensions: ['md', 'markdown'], label: 'Markdown', hint: 'Markdown 笔记' },
  { format: 'html', extensions: ['html', 'htm'], label: 'HTML', hint: '网页 / 导出 HTML' },
  { format: 'rtf', extensions: ['rtf'], label: 'RTF', hint: '富文本' },
  { format: 'epub', extensions: ['epub'], label: 'EPUB', hint: '电子书' },
  { format: 'csv', extensions: ['csv'], label: 'CSV', hint: '逗号分隔表格' },
]

const EXT_MAP = new Map<string, DocumentFormat>()
for (const info of SUPPORTED_FORMATS) {
  for (const ext of info.extensions) {
    EXT_MAP.set(ext, info.format)
  }
}

export function formatFromFileName(name: string): DocumentFormat | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MAP.get(ext) ?? null
}

export const ACCEPT_IMPORT = SUPPORTED_FORMATS.flatMap((f) =>
  f.extensions.map((ext) => `.${ext}`),
).join(',')

export const IMPORT_FORMAT_SUMMARY = SUPPORTED_FORMATS.map((f) => f.label).join('、')

export const IMPORT_FORMAT_HINT = SUPPORTED_FORMATS.map(
  (f) => `${f.label}（${f.extensions.map((e) => `.${e}`).join(' ')}）`,
).join(' · ')

export function formatLabel(format: DocumentFormat): string {
  return SUPPORTED_FORMATS.find((f) => f.format === format)?.label ?? format.toUpperCase()
}
