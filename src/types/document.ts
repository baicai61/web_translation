export type SegmentKind =
  | 'paragraph'
  | 'heading'
  | 'list-item'
  | 'table-cell'
  | 'caption'
  | 'quote'

export interface SegmentMeta {
  level?: number
  tableId?: string
  row?: number
  col?: number
  page?: number
}

export interface TextSegment {
  id: string
  kind: SegmentKind
  sourceText: string
  translatedText: string
  meta?: SegmentMeta
}

export type DocumentFormat =
  | 'pdf'
  | 'docx'
  | 'doc'
  | 'txt'
  | 'md'
  | 'html'
  | 'epub'
  | 'rtf'
  | 'csv'

export interface ImportedDocument {
  id: string
  fileName: string
  format: DocumentFormat
  importedAt: number
  segments: TextSegment[]
  /** 合并全文，供文库级搜索 */
  plainText: string
}
