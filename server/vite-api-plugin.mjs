import { handleApiRequest } from './api-core.mjs'

export function viteApiPlugin() {
  return {
    name: 'vite-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api')) {
          next()
          return
        }

        try {
          const result = await handleApiRequest(req, url.pathname)
          if (!result) {
            res.statusCode = 404
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: 'Not found' }))
            return
          }
          res.statusCode = result.status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(result.data))
        } catch (e) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              error: e instanceof Error ? e.message : '服务器错误',
            }),
          )
        }
      })
    },
  }
}
