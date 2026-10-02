import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'

const root = fileURLToPath(new URL('.', import.meta.url))

// ffmpeg.wasm ships its runtime as loose files (core wasm + a class worker that
// imports its siblings) — they cannot go through the JS bundle. This plugin
// serves them from /ffmpeg/ in dev; on build only the tiny class-worker files
// are copied into dist/ — ffmpeg-core.wasm is 30.7 MiB, over the 25 MiB
// per-file limit Cloudflare Pages rejects, so production loads the core from
// the jsdelivr CDN (see src/utils/transcode.js).
const FFMPEG_DIR = 'ffmpeg'
const FFMPEG_SOURCES = [
  {
    dir: 'node_modules/@ffmpeg/core/dist/esm',
    mimes: { '.js': 'text/javascript', '.wasm': 'application/wasm' },
    emit: false, // CDN in production, local only in dev
  },
  { dir: 'node_modules/@ffmpeg/ffmpeg/dist/esm', mimes: { '.js': 'text/javascript' }, emit: true },
]

function ffmpegRuntime() {
  const list = () =>
    FFMPEG_SOURCES.flatMap(({ dir, mimes }) =>
      readdirSync(join(root, dir))
        .filter((name) => mimes[extname(name)])
        .map((name) => ({ path: join(root, dir, name), name, mime: mimes[extname(name)] })),
    )

  const emitted = () => FFMPEG_SOURCES.filter(({ emit }) => emit !== false)

  return {
    name: 'ffmpeg-runtime',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0]
        const prefix = `/${FFMPEG_DIR}/`
        if (!url.startsWith(prefix)) return next()
        const name = url.slice(prefix.length)
        const file = list().find((f) => f.name === name)
        if (!file) return next()
        res.setHeader('Content-Type', file.mime)
        res.end(readFileSync(file.path))
      })
    },
    generateBundle() {
      for (const { dir, mimes } of emitted()) {
        for (const name of readdirSync(join(root, dir)).filter((n) => mimes[extname(n)])) {
          this.emitFile({
            type: 'asset',
            fileName: `${FFMPEG_DIR}/${name}`,
            source: readFileSync(join(root, dir, name)),
          })
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueJsx(), tailwindcss(), vueDevTools(), ffmpegRuntime()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // @ffmpeg/ffmpeg itself is tiny; the 31MB core is a static asset loaded
    // only when someone actually submits a video.
    chunkSizeWarningLimit: 700,
  },
})
