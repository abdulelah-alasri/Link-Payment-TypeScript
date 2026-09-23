import { defineConfig, loadEnv } from 'vite'
import { linkLiveDemoPlugin } from './vite.linkLiveDemo.ts'

/**
 * Dev proxy: browser calls same-origin `/api/...` → forwarded to Aysali platform-api.
 * Demo checkout (`checkoutToken=demo`) is handled locally against Link test gateway
 * so preview works without Postgres/Redis.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget =
    env.VITE_PROXY_API_TARGET?.trim() || 'http://localhost:3000'

  return {
    plugins: [linkLiveDemoPlugin(process.cwd())],
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
