import JSZip from 'jszip'
import { buildPlainText, segmentFromHtml, segmentPlainText } from '../segmenter'
import type { TextSegment } from '../../types/document'

function opfHref(base: string, href: string): string {
  const baseDir = base.includes('/') ? base.replace(/[^/]+$/, '') : ''
  const parts = (baseDir + href).split('/')
  const stack: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

export async function parseEpub(
  buffer: ArrayBuffer,
): Promise<{ segments: TextSegment[]; plainText: string; htmlParts: string[] }> {
  const zip = await JSZip.loadAsync(buffer)

  const containerXml = await zip.file('META-INF/container.xml')?.async('text')
  if (!containerXml) throw new Error('无效的 EPUB：缺少 container.xml')

  const rootfileMatch = containerXml.match(/full-path="([^"]+)"/i)
  const opfPath = rootfileMatch?.[1]
  if (!opfPath) throw new Error('无效的 EPUB：无法定位内容目录')

  const opfXml = await zip.file(opfPath)?.async('text')
  if (!opfXml) throw new Error('无效的 EPUB：缺少 OPF 文件')

  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml')
  const manifest = new Map<string, string>()
  for (const item of opfDoc.getElementsByTagName('item')) {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    const media = item.getAttribute('media-type') ?? ''
    if (
      id &&
      href &&
      (media.includes('html') || href.endsWith('.xhtml') || href.endsWith('.html'))
    ) {
      manifest.set(id, href)
    }
  }

  const spineIds: string[] = []
  for (const item of opfDoc.getElementsByTagName('itemref')) {
    const idref = item.getAttribute('idref')
    if (idref) spineIds.push(idref)
  }

  const htmlParts: string[] = []
  for (const id of spineIds) {
    const href = manifest.get(id)
    if (!href) continue
    const filePath = opfHref(opfPath, href)
    const html = await zip.file(filePath)?.async('text')
    if (html?.trim()) htmlParts.push(html)
  }

  if (htmlParts.length === 0) {
    throw new Error('EPUB 中未找到可读章节，请尝试转换为 PDF 或 DOCX')
  }

  const combinedHtml = htmlParts.join('\n<hr/>\n')
  let segments = segmentFromHtml(combinedHtml)

  if (segments.length === 0) {
    const plain = htmlParts.map(htmlToText).filter(Boolean).join('\n\n')
    segments = segmentPlainText(plain)
  }

  return {
    segments,
    plainText: buildPlainText(segments),
    htmlParts,
  }
}
