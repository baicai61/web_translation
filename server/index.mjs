import cors from 'cors'
import express from 'express'
import {
  friendlyTranslateError,
  getHealth,
  getLanguages,
  postEngineMode,
  postTranslate,
  postTranslateBatch,
} from './api-core.mjs'

const app = express()
const PORT = Number(process.env.API_PORT) || 3001

app.use(cors())
app.use(express.json({ limit: '4mb' }))

app.get('/api/health', async (_req, res) => {
  res.json(await getHealth())
})

app.get('/api/languages', async (_req, res) => {
  try {
    const result = await getLanguages()
    res.status(result.status).json(result.data)
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : '获取语言列表失败' })
  }
})

app.post('/api/engine/mode', async (req, res) => {
  try {
    const result = await postEngineMode(req.body)
    res.status(result.status).json(result.data)
  } catch (e) {
    res.status(502).json({
      error: friendlyTranslateError(e instanceof Error ? e.message : '切换翻译模式失败'),
    })
  }
})

app.post('/api/translate', async (req, res) => {
  try {
    const result = await postTranslate(req.body)
    res.status(result.status).json(result.data)
  } catch (e) {
    res.status(502).json({
      error: friendlyTranslateError(e instanceof Error ? e.message : '翻译失败'),
    })
  }
})

app.post('/api/translate/batch', async (req, res) => {
  try {
    const result = await postTranslateBatch(req.body)
    res.status(result.status).json(result.data)
  } catch (e) {
    res.status(502).json({
      error: friendlyTranslateError(e instanceof Error ? e.message : '批量翻译失败'),
    })
  }
})

app.listen(PORT, () => {
  console.log(`[api] 独立代理 http://127.0.0.1:${PORT}`)
  console.log(`[api] 日常开发只需运行 vite，API 已内置；本服务仅供单独调试`)
})
