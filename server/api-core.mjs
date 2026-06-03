import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const LT_URL = (process.env.LIBRETRANSLATE_URL || 'http://127.0.0.1:5000').replace(
  /\/$/,
  '',
)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MODE_FILE = path.join(__dirname, '.engine-mode.json')
const BATCH_SIZE = 8
let resolvedLtUrl = LT_URL

function loadStoredEngineMode() {
  try {
    const data = JSON.parse(fs.readFileSync(MODE_FILE, 'utf8'))
    if (['auto', 'local', 'online'].includes(data.mode)) return data.mode
  } catch {
    /* ignore */
  }
  return 'auto'
}

let userEngineMode = loadStoredEngineMode()

function saveStoredEngineMode(mode) {
  userEngineMode = mode
  fs.writeFileSync(MODE_FILE, JSON.stringify({ mode }), 'utf8')
}

function resolveEngineForMode(mode, engineRaw, localAvailable) {
  if (mode === 'online') return 'mymemory-online'
  if (mode === 'local') {
    return localAvailable ? 'ctranslate2-local' : 'ctranslate2-local-unavailable'
  }
  if (localAvailable && String(engineRaw).includes('ctranslate2')) {
    return 'ctranslate2-local'
  }
  return 'mymemory-online'
}

function buildModePayload(engineRaw, localAvailable, engineSync, mymemoryEmailConfigured = false) {
  return {
    status: 'ok',
    engine: resolveEngineForMode(userEngineMode, engineRaw, localAvailable),
    mode: userEngineMode,
    localAvailable,
    engineSync,
    mymemoryEmailConfigured,
  }
}

/** 将引擎返回的英文错误转为中文（兼容旧版 lt_server） */
export function friendlyTranslateError(message) {
  const msg = String(message ?? '')
  if (/[\u4e00-\u9fff]/.test(msg)) return msg

  const lower = msg.toLowerCase()
  if (
    lower.includes('too many requests') ||
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('free translations') ||
    lower.includes('network error')
  ) {
    return (
      '在线翻译请求过于频繁，或今日免费额度已用完。' +
      '请改用「翻译当前字段」逐段翻译，或双击「启动翻译引擎.bat」启用本地离线引擎。' +
      '也可运行「配置MyMemory邮箱.bat」提高 MyMemory 每日额度。'
    )
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return '连接翻译服务超时，请检查网络后重试。'
  }
  if (lower.includes('connection refused') || lower.includes('无法连接')) {
    return '无法连接翻译服务，请先双击「启动翻译引擎.bat」并等到出现 [READY]。'
  }
  return msg || '翻译失败'
}

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
  const payload = { ...body, engineMode: userEngineMode }
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg =
      typeof data.error === 'string'
        ? friendlyTranslateError(data.error)
        : `翻译引擎错误 (${res.status})`
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

    let engineRaw = 'unknown'
    let mode = userEngineMode
    let localAvailable = false
    let engineSync = false
    let mymemoryEmailConfigured = false
    try {
      const healthRes = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) })
      if (healthRes.ok) {
        const h = await healthRes.json()
        engineRaw = h.engine ?? engineRaw
        if (h.mode !== undefined) {
          mode = h.mode
          engineSync = true
        }
        if (h.localAvailable !== undefined) {
          localAvailable = Boolean(h.localAvailable)
        } else {
          localAvailable =
            String(engineRaw).includes('argostranslate') ||
            (h.status === 'ok' && !String(engineRaw).includes('mymemory'))
        }
        if (h.mymemoryEmailConfigured !== undefined) {
          mymemoryEmailConfigured = Boolean(h.mymemoryEmailConfigured)
        }
      }
    } catch {
      /* ignore */
    }

    if (!engineSync) {
      mode = userEngineMode
      engineRaw = resolveEngineForMode(userEngineMode, engineRaw, localAvailable)
    }

    return {
      ok: true,
      engine: engineRaw,
      mode,
      localAvailable,
      engineSync,
      mymemoryEmailConfigured,
      url,
      languages: codes.length,
      enToZh: hasZh,
      message: engineSync
        ? localAvailable
          ? '翻译引擎就绪'
          : '已连接（本地未安装，可切换在线模式或重启引擎安装语言包）'
        : '翻译模式已保存；请重启「启动翻译引擎.bat」使切换完全生效',
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

export async function postEngineMode(body) {
  const { mode } = body ?? {}
  if (!mode || !['auto', 'local', 'online'].includes(mode)) {
    return { status: 400, data: { error: '无效模式，请使用 auto、local 或 online' } }
  }

  saveStoredEngineMode(mode)

  let engineRaw = 'mymemory-online'
  let localAvailable = false
  let mymemoryEmailConfigured = false
  try {
    const base = await getLtBase()
    const res = await fetch(`${base}/engine/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
      signal: AbortSignal.timeout(120_000),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      return { status: 200, data: { ...data, engineSync: true } }
    }
    if (typeof data.error === 'string' && !data.error.includes('接口不存在')) {
      return {
        status: res.status,
        data: { error: friendlyTranslateError(data.error) },
      }
    }
    engineRaw = data.engine ?? engineRaw
    localAvailable = Boolean(data.localAvailable)
    if (data.mymemoryEmailConfigured !== undefined) {
      mymemoryEmailConfigured = Boolean(data.mymemoryEmailConfigured)
    }
  } catch {
    /* 旧版引擎无 /engine/mode，走本地保存 */
  }

  try {
    const health = await getHealth()
    engineRaw = health.engine ?? engineRaw
    localAvailable = Boolean(health.localAvailable)
    if (health.mymemoryEmailConfigured !== undefined) {
      mymemoryEmailConfigured = Boolean(health.mymemoryEmailConfigured)
    }
  } catch {
    /* ignore */
  }

  return {
    status: 200,
    data: buildModePayload(engineRaw, localAvailable, false, mymemoryEmailConfigured),
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

  if (req.method === 'POST' && pathname === '/api/engine/mode') {
    const body = await readJsonBody(req)
    return await postEngineMode(body)
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
