export interface NotebookEntry {
  id: string
  sourceText: string
  translation: string
  createdAt: number
  documentName?: string
  langFrom: string
  langTo: string
}
