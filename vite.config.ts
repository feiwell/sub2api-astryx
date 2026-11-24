import { defineConfig, loadEnv, normalizePath, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { distributionNotices } from './scripts/distributionNotices.ts'
import { devProxy } from './scripts/devProxy.ts'

const appSrc = resolve(import.meta.dirname, 'src')

/** Dev-only: inject public settings into index.html, mirroring the Go backend. */
function injectPublicSettings(backendUrl: string): Plugin {
  return {
    name: 'inject-public-settings',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      async handler(html) {
        try {
          const response = await fetch(`${backendUrl}/api/v1/settings/public`, {
            signal: AbortSignal.timeout(2000),
          })
          if (response.ok) {
            const data = await response.json()
            if (data.code === 0 && data.data) {
              const settings = JSON.stringify(data.data).replaceAll('<', '\\u003c')
              const script = `<script>window.__APP_CONFIG__=${settings};</script>`
              return html.replace('</head>', `${script}\n</head>`)
            }
          }
        } catch (e) {
          console.warn('[vite] could not fetch public settings, falling back to API:', (e as Error).message)
        }
        return html
      },
    },
  }
}

/**
 * The catalog of the language in use is only asked for once the app's code runs, and that is after all of it
 * has arrived. src/i18n/warm.ts asks for the catalog and nothing else: built as a script of its own and put
 * first on the page, it runs early, and the catalog arrives alongside the app's code instead of after it.
 */
function warmLocale(): Plugin {
  const source = normalizePath(resolve(appSrc, 'i18n/warm.ts'))
  let base = '/'
  let isBuild = false
  return {
    name: 'warm-locale',
    configResolved(config) {
      base = config.base
      isBuild = config.command === 'build'
    },
    buildStart() {
      if (isBuild) this.emitFile({ type: 'chunk', id: source })
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, { bundle }) {
        if (!isBuild) return [{ tag: 'script', attrs: { type: 'module', src: `${base}src/i18n/warm.ts` }, injectTo: 'head-prepend' }]
        const built = Object.values(bundle ?? {}).find((file) => file.type === 'chunk' && file.facadeModuleId === source)
        if (!built) return
        return [{ tag: 'script', attrs: { type: 'module', crossorigin: true, src: base + built.fileName }, injectTo: 'head-prepend' }]
      },
    },
  }
}

/**
 * The title in index.html is a placeholder so a deployment does not flash the
 * upstream product name before the app renames the tab from its own settings.
 * VITE_DEFAULT_SITE_NAME fills it in at build time.
 */
function siteNameTitle(siteName: string | undefined): Plugin {
  return {
    name: 'site-name-title',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replaceAll('%VITE_DEFAULT_SITE_NAME%', siteName || 'Sub2API')
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_')
  const backendUrl = env.VITE_DEV_PROXY_TARGET || 'http://localhost:8080'
  const devPort = Number(env.VITE_DEV_PORT || 3100)

  return {
    plugins: [
      react(),
      siteNameTitle(env.VITE_DEFAULT_SITE_NAME),
      injectPublicSettings(backendUrl),
      warmLocale(),
      distributionNotices(import.meta.dirname),
    ],
    resolve: { tsconfigPaths: true },
    server: {
      port: devPort,
      proxy: devProxy(backendUrl),
    },
    build: {
      outDir: 'dist',
      license: { fileName: 'licenses/bundled-dependencies.md' },
      emptyOutDir: true,
    },
  }
})
