export const LT_URL = (process.env.LIBRETRANSLATE_URL || 'http://127.0.0.1:5000').replace(
  /\/$/,
  '',
)
const BATCH_SIZE = 20
let resolvedLtUrl = LT_URL

async function getLtBase() {
  try {
    const r = await fetch(`${resolvedLtUrl}/languages`, {
      signal: AbortSignal.timeout(3000),
    })
    if (r.ok) return resolvedLtUrl
  } catch {
    /* 重新探测 */
  }
  const { url } = await probeLibreTranslate()
  resolvedLtUrl = url
  return url
}

async function ltFetch(path, body) {
  const base = await getLtBase()
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      typeof data.error === 'string'
        ? data.error
        : `LibreTranslate 错误 (${res.status})`
    throw new Error(msg)
  }
  return data
}

function normalizeTranslated(data) {
  const t = data.translatedText
  if (Array.isArray(t)) return t.map(String)
  if (typeof t === 'string') return [t]
  throw new Error('翻译引擎返回格式异常')
}

const LT_PROBE_URLS = [
  process.env.LIBRETRANSLATE_URL,
  'http://127.0.0.1:5000',
  'http://localhost:5000',
].filter(Boolean)

async function probeLibreTranslate() {
  let lastError = null
  for (const base of LT_PROBE_URLS) {
    const url = String(base).replace(/\/$/, '')
    try {
      const languages = await fetch(`${url}/languages`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!languages.ok) continue
      return { url, list: await languages.json() }
    } catch (e) {
      lastError = e
    }
  }
  throw lastError ?? new Error('无法连接 5000 端口')
}

export async function getHealth() {
  try {
    const { url, list } = await probeLibreTranslate()
    resolvedLtUrl = url
    const codes = list.map((l) => l.code)
    const hasZh = codes.includes('zh')

    let engineDetail = 'LibreTranslate'
    try {
      const healthRes = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) })
      if (healthRes.ok) {
        const h = await healthRes.json()
        if (h.engine === 'mymemory-online') engineDetail = 'mymemory-online'
        else if (h.engine === 'argostranslate-local') engineDetail = 'argostranslate-local'
      }
    } catch {
      /* ignore */
    }

    return {
      ok: true,
      engine: engineDetail === 'mymemory-online' ? 'MyMemory (online)' : 'LibreTranslate',
      url,
      languages: codes.length,
      enToZh: hasZh,
      message:
        engineDetail === 'mymemory-online'
          ? '翻译就绪（多语言互译，在线）'
          : hasZh
            ? '翻译引擎就绪（多语言互译，英→中可离线）'
            : '已连接，但可能未加载中文语言包',
    }
  } catch (e) {
    return {
      ok: false,
      engine: 'LibreTranslate',
      url: LT_URL,
      message:
        e instanceof Error
          ? `翻译服务未运行（${e.message}）。请双击「启动翻译引擎.bat」，黑窗口出现 [READY] 后按 F5`
          : '翻译服务未运行。请双击 scripts\\translate-up-python.bat',
    }
  }
}

export async function getLanguages() {
  try {
    const base = await getLtBase()
    const res = await fetch(`${base}/languages`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      return { status: 200, data: await res.json() }
    }
  } catch {
    /* fallback below */
  }
  return {
    status: 200,
    data: [
      { code: 'en', name: 'English' },
      { code: 'zh', name: 'Chinese' },
      { code: 'ja', name: 'Japanese' },
      { code: 'ko', name: 'Korean' },
      { code: 'fr', name: 'French' },
      { code: 'de', name: 'German' },
      { code: 'es', name: 'Spanish' },
      { code: 'ru', name: 'Russian' },
      { code: 'pt', name: 'Portuguese' },
      { code: 'it', name: 'Italian' },
    ],
  }
}

export async function postTranslate(body) {
  const { q, source = 'en', target = 'zh' } = body ?? {}
  if (!q || typeof q !== 'string') {
    return { status: 400, data: { error: '缺少待翻译文本 q' } }
  }
  const data = await ltFetch('/translate', { q, source, target, format: 'text' })
  const [translated] = normalizeTranslated(data)
  return { status: 200, data: { translatedText: translated } }
}

export async function postTranslateBatch(body) {
  const { texts, source = 'en', target = 'zh' } = body ?? {}
  if (!Array.isArray(texts) || texts.length === 0) {
    return { status: 400, data: { error: '缺少 texts 数组' } }
  }

  const results = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE).map((t) => String(t ?? ''))
    const data = await ltFetch('/translate', {
      q: chunk,
      source,
      target,
      format: 'text',
    })
    const part = normalizeTranslated(data)
    if (part.length !== chunk.length) {
      throw new Error('批量翻译返回条数与请求不一致')
    }
    results.push(...part)
  }
  return { status: 200, data: { translations: results } }
}

/** @param {import('http').IncomingMessage} req */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {string} pathname
 */
export async function handleApiRequest(req, pathname) {
  if (req.method === 'GET' && pathname === '/api/health') {
    return { status: 200, data: await getHealth() }
  }

  if (req.method === 'GET' && pathname === '/api/languages') {
    return await getLanguages()
  }

  if (req.method === 'POST' && pathname === '/api/translate') {
    const body = await readJsonBody(req)
    return await postTranslate(body)
  }

  if (req.method === 'POST' && pathname === '/api/translate/batch') {
    const body = await readJsonBody(req)
    return await postTranslateBatch(body)
  }

  return null
}
