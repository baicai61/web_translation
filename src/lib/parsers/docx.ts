import mammoth from 'mammoth'

export async function parseDocx(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
  return result.value
}
