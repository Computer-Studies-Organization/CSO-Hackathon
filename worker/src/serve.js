/**
 * GET /videos/{key...}
 * Public playback with HTTP Range support (seek) via R2 binding.
 */

const VIDEO_CONTENT_TYPES = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
}

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

export async function handleServe(pathname, request, env) {
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

  const rangeHeader = request.headers.get('Range')
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

  return new Response(object.body, {
    status: 200,
    headers,
  })
}
