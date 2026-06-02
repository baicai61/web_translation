import mammoth from 'mammoth'

export async function parseDocx(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
  return result.value
}

/** 旧版 .doc：先尝试 mammoth，失败则提取可读文本片段 */
export async function parseLegacyDoc(buffer: ArrayBuffer): Promise<string> {
  try {
    const html = await parseDocx(buffer)
    if (html.replace(/<[^>]+>/g, '').trim().length > 20) {
      return html
    }
  } catch {
    /* fall through */
  }

  const bytes = new Uint8Array(buffer)
  const chunks: string[] = []
  let ascii = ''
  let utf16 = ''

  for (let i = 0; i < bytes.length - 1; i += 1) {
    const b = bytes[i]
    if (b >= 32 && b <= 126) ascii += String.fromCharCode(b)
    else if (ascii.length >= 8) {
      chunks.push(ascii)
      ascii = ''
    } else {
      ascii = ''
    }

    if (bytes[i + 1] === 0 && b >= 32) {
      utf16 += String.fromCharCode(b)
      i += 1
    } else if (utf16.length >= 8) {
      chunks.push(utf16)
      utf16 = ''
    } else {
      utf16 = ''
    }
  }
  if (ascii.length >= 8) chunks.push(ascii)
  if (utf16.length >= 8) chunks.push(utf16)

  const unique = [...new Set(chunks.map((c) => c.trim()).filter((c) => c.length >= 8))]
  if (unique.length === 0) {
    throw new Error(
      '无法解析旧版 Word (.doc) 文件。请在 Word / WPS 中打开后另存为 .docx，再重新导入',
    )
  }

  return `<div>${unique.map((c) => `<p>${c.replace(/</g, '&lt;')}</p>`).join('')}</div>`
}

export async function parseDocFile(
  buffer: ArrayBuffer,
): Promise<{ html: string; isLegacy: boolean }> {
  try {
    const html = await parseDocx(buffer)
    const plain = html.replace(/<[^>]+>/g, '').trim()
    if (plain.length > 20) return { html, isLegacy: false }
  } catch {
    /* try legacy */
  }

  const html = await parseLegacyDoc(buffer)
  return { html, isLegacy: true }
}
