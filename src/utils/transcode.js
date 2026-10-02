import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const BASE = import.meta.env.BASE_URL || '/'
const CLASS_WORKER_URL = `${BASE}ffmpeg/worker.js`

// ffmpeg-core.wasm is 30.7 MiB — Cloudflare Pages rejects anything over 25 MiB
// per file — so production pulls the pinned npm build from jsdelivr and turns it
// into blob URLs (same-origin, CORS + CSP safe). Dev serves it straight from
// node_modules via the vite plugin. Keep in sync with package.json.
const CORE_VERSION = '0.12.10'
const CORE_CDN = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`

let corePromise = null

async function loadCoreUrls() {
  if (import.meta.env.DEV) {
    return {
      coreURL: `${BASE}ffmpeg/ffmpeg-core.js`,
      wasmURL: `${BASE}ffmpeg/ffmpeg-core.wasm`,
    }
  }
  return {
    coreURL: await toBlobURL(`${CORE_CDN}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CORE_CDN}/ffmpeg-core.wasm`, 'application/wasm'),
  }
}

// ~31 MB — cache the blob URLs for the session, retry on failure.
function coreUrls() {
  if (!corePromise) {
    corePromise = loadCoreUrls().catch((err) => {
      corePromise = null
      throw err
    })
  }
  return corePromise
}

// README recipe (1080p / 30fps H.264 + faststart). `scale` never upscales —
// a 720p source stays 720p. `veryfast` instead of `medium`: the single-thread
// WASM encoder is roughly 10x slower than native and the preset barely moves
// CRF-23 quality.
const ENCODE_ARGS = [
  '-vf',
  'scale=-2:min(1080\\,ih),fps=30',
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-crf',
  '23',
  '-profile:v',
  'high',
  '-level:v',
  '4.1',
  '-pix_fmt',
  'yuv420p',
  '-g',
  '60',
  '-c:a',
  'aac',
  '-b:a',
  '128k',
  '-ac',
  '2',
  '-movflags',
  '+faststart',
]

// Fallback if the core build lacks scale/fps: same target, no filtergraph.
const ENCODE_ARGS_NO_FILTER = [
  '-c:v',
  'libx264',
  '-preset',
  'veryfast',
  '-crf',
  '23',
  '-pix_fmt',
  'yuv420p',
  '-g',
  '60',
  '-c:a',
  'aac',
  '-b:a',
  '128k',
  '-ac',
  '2',
  '-movflags',
  '+faststart',
]

let ffmpeg = null

async function getFFmpeg() {
  if (!ffmpeg) {
    const instance = new FFmpeg()
    // Publish before load() so terminateTranscoder() can kill a load in flight.
    ffmpeg = instance
    try {
      const { coreURL, wasmURL } = await coreUrls()
      await instance.load({
        classWorkerURL: CLASS_WORKER_URL,
        coreURL,
        wasmURL,
      })
    } catch (err) {
      if (ffmpeg === instance) ffmpeg = null // never cache a broken instance
      throw err
    }
  }
  return ffmpeg
}

/** Hard-cancel: kills the worker (in-flight exec never resolves). */
export function terminateTranscoder() {
  if (!ffmpeg) return
  ffmpeg.terminate()
  ffmpeg = null
}

/**
 * ffmpeg.wasm promises never settle once the worker is terminated, so every
 * await is raced against the caller's AbortSignal — otherwise Cancel would
 * leave the submit hanging forever.
 */
function withAbort(promise, signal) {
  if (!signal) return promise
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'))
    if (signal.aborted) return abort()
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (err) => {
        signal.removeEventListener('abort', abort)
        reject(err)
      },
    )
  })
}

function inputNameFor(file) {
  const dot = file.name.lastIndexOf('.')
  const ext =
    dot > 0
      ? file.name
          .slice(dot)
          .replace(/[^.a-z0-9]/gi, '')
          .toLowerCase()
      : '.mp4'
  return `input${ext || '.mp4'}`
}

async function runExec(instance, args, signal) {
  return withAbort(instance.exec(args), signal)
}

/**
 * Re-encode `file` to 1080p30 H.264 (CRF 23, faststart) inside the browser.
 *
 * Returns a `video/mp4` Blob, always smaller than the source in practice —
 * callers should still compare sizes and keep the source when it did not shrink.
 *
 * Throws on cancel (AbortError), on OOM, or when both encode attempts fail;
 * the store then falls back to uploading the untouched file.
 */
export async function transcodeVideo(file, { onProgress, signal } = {}) {
  const instance = await withAbort(getFFmpeg(), signal)
  const input = inputNameFor(file)
  const output = 'output.mp4'

  const handleProgress = ({ progress }) => {
    if (!onProgress) return
    const pct = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0
    onProgress(pct)
  }
  instance.on('progress', handleProgress)

  try {
    signal?.throwIfAborted()

    await withAbort(instance.writeFile(input, await fetchFile(file)), signal)
    signal?.throwIfAborted()
    onProgress?.(0)

    let code = await runExec(instance, ['-i', input, ...ENCODE_ARGS, output], signal)
    if (code !== 0) {
      // Some core builds ship without the scale/fps filters — retry plain.
      code = await runExec(instance, ['-i', input, ...ENCODE_ARGS_NO_FILTER, output], signal)
    }
    if (code !== 0) {
      throw new Error(`ffmpeg failed (exit ${code})`)
    }

    signal?.throwIfAborted()
    onProgress?.(1)

    const data = await withAbort(instance.readFile(output), signal)
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data))
    return new Blob([bytes], { type: 'video/mp4' })
  } finally {
    instance.off('progress', handleProgress)
    // Best-effort FS cleanup — keeps the heap usable for the next submission.
    try {
      await instance.deleteFile(input)
    } catch {
      /* already gone */
    }
    try {
      await instance.deleteFile(output)
    } catch {
      /* already gone */
    }
  }
}
