import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(), tailwindcss(),
    {
      name: 'local-browser-origin',
      configureServer(server) {
        const origin = new URL(process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173')
        const localNames = ['localhost', '127.0.0.1', '[::1]']
        if (origin.protocol !== 'http:' || !localNames.includes(origin.hostname)) return
        const aliases = localNames.map(host => host + (origin.port ? ':' + origin.port : ''))
        server.middlewares.use((req, res, next) => {
          const host = req.headers.host
          if (req.method !== 'GET' || !req.headers.accept?.includes('text/html') ||
              !host || host === origin.host || !aliases.includes(host)) return next()
          res.writeHead(307, {Location: origin.origin + (req.url ?? '/'), 'Cache-Control': 'no-store'})
          res.end()
        })
      },
    },
  ],
  server: {proxy:{'/api':{target:'http://127.0.0.1:3000',changeOrigin:false}}},
  optimizeDeps: { entries: ['index.html'] },
})
