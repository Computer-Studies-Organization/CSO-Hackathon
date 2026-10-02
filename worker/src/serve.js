/**
 * GET /videos/{key...}
 * Public playback with HTTP Range support (seek) via R2 binding.
 *
 * Edge caching (Cache API):
 *   - miss → stream the requested range from R2 to the client and, in the
 *     background (waitUntil), store the full object once under the request
 *     URL. Every later viewer in the same colo is served from the edge.
 *   - hit  → cache.match() honors the Range header, so the edge returns
 *     proper 206 slices without touching R2 (or even calling head()).
 *
 * Cache API operations only take effect when the Worker is reached through a
 * custom domain or route — *.workers.dev deployments silently no-op and fall
 * back to plain R2 serving. Set PLAYBACK_ORIGIN (index.js) once a custom
 * domain is attached.
 */

const VIDEO_CONTENT_TYPES = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
}

// Cloudflare's cache rejects objects larger than this (cache.put → 413).
const MAX_CACHE_BYTES = 512 * 1024 * 1024

// Same-isolate guard so concurrent misses don't stack full-object fills.
const inflightFills = new Set()

function contentTypeForKey(key, fallback) {
  const dot = key.lastIndexOf('.')
  if (dot === -1) return fallback || 'application/octet-stream'
  const ext = key.slice(dot).toLowerCase()
  return VIDEO_CONTENT_TYPES[ext] || fallback || 'application/octet-stream'
}

/** Parse a single-range Range header for R2 get(). Exported for tests. */
export function parseRangeHeader(rangeHeader, size) {
  if (!rangeHeader) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!m) return null

  const [, startStr, endStr] = m
  let start
  let end

  if (startStr === '' && endStr === '') return null

  if (startStr === '') {
    // suffix: bytes=-N
    const suffix = Number(endStr)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startStr)
    end = endStr === '' ? size - 1 : Number(endStr)
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start > end || start >= size) return null
  end = Math.min(end, size - 1)

  return { offset: start, length: end - start + 1 }
}

function edgeCache() {
  return globalThis.caches?.default || null
}

/**
 * Match key: same URL as the request, with the client's Range header copied
 * over so Cloudflare slices the cached object into a 206 at the edge.
 */
async function matchEdge(cache, url, rangeHeader) {
  try {
    const headers = new Headers()
    if (rangeHeader) headers.set('Range', rangeHeader)
    const hit = await cache.match(new Request(url, { headers }))
    return hit || null
  } catch {
    return null
  }
}

/**
 * Background fill: download the whole object once from R2 and store it in the
 * edge cache (status 200 + Content-Length so later Range matches work).
 */
function scheduleCacheFill(cache, ctx, env, key, url, size, contentType) {
  if (!cache || typeof ctx?.waitUntil !== 'function') return
  if (!Number.isFinite(size) || size <= 0 || size > MAX_CACHE_BYTES) return
  if (inflightFills.has(url)) return
  inflightFills.add(url)

  const fill = (async () => {
    const object = await env.VIDEOS.get(key)
    if (!object) return

    const headers = new Headers()
    headers.set('Content-Type', contentType)
    headers.set('Content-Length', String(size))
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    headers.set('Accept-Ranges', 'bytes')
    headers.set('X-Content-Type-Options', 'nosniff')

    await cache.put(new Request(url), new Response(object.body, { status: 200, headers }))
  })()
    .catch(() => {})
    .finally(() => inflightFills.delete(url))

  ctx.waitUntil(fill)
}

export async function handleServe(pathname, request, env, ctx) {
  // pathname /videos/{uid}/{file}.mp4 → R2 key videos/{uid}/{file}.mp4
  let key = decodeURIComponent(pathname)
  if (key.startsWith('/')) key = key.slice(1)

  if (!key.startsWith('videos/') || key.includes('..')) {
    return new Response(key.startsWith('videos/') ? 'Bad key' : 'Not found', {
      status: key.startsWith('videos/') ? 400 : 404,
    })
  }

  const bucket = env.VIDEOS
  if (!bucket) {
    return new Response('Storage not configured', { status: 503 })
  }

  const cache = edgeCache()
  const rangeHeader = request.headers.get('Range')

  // Edge hit: no head(), no R2 — the cached 200 (sliced to 206 by Range) wins.
  if (cache) {
    const hit = await matchEdge(cache, request.url, rangeHeader)
    if (hit) return hit
  }

  // Need size first for Range math — head() then get with range
  const head = await bucket.head(key)
  if (!head) {
    return new Response('Not found', { status: 404 })
  }

  const size = head.size
  const baseType = contentTypeForKey(key, head.httpMetadata?.contentType)

  const headers = new Headers()
  headers.set('Content-Type', baseType)
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('X-Content-Type-Options', 'nosniff')

  const range = parseRangeHeader(rangeHeader, size)

  if (range) {
    const object = await bucket.get(key, { range })
    if (!object) {
      return new Response('Not found', { status: 404 })
    }

    const contentEnd = range.offset + range.length - 1
    headers.set('Content-Range', `bytes ${range.offset}-${contentEnd}/${size}`)
    headers.set('Content-Length', String(range.length))
    if (object.httpMetadata?.contentType) {
      headers.set('Content-Type', contentTypeForKey(key, object.httpMetadata.contentType))
    }

    scheduleCacheFill(cache, ctx, env, key, request.url, size, baseType)

    return new Response(object.body, {
      status: 206,
      headers,
    })
  }

  const object = await bucket.get(key)
  if (!object) {
    return new Response('Not found', { status: 404 })
  }

  headers.set('Content-Length', String(size))
  if (object.httpMetadata?.contentType) {
    headers.set('Content-Type', contentTypeForKey(key, object.httpMetadata.contentType))
  }

  scheduleCacheFill(cache, ctx, env, key, request.url, size, baseType)

  return new Response(object.body, {
    status: 200,
    headers,
  })
}
