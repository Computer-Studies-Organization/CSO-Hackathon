import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'

import { parseRangeHeader, handleServe } from '../src/serve.js'
import { handlePresign } from '../src/presign.js'
import { AuthError, verifyFirebaseToken } from '../src/auth.js'
import worker from '../src/index.js'

// ---------------------------------------------------------------------------
// Range parsing (video seek)
// ---------------------------------------------------------------------------
describe('parseRangeHeader', () => {
  test('parses open-ended range', () => {
    assert.deepEqual(parseRangeHeader('bytes=0-99', 1000), {
      offset: 0,
      length: 100,
    })
  })

  test('parses bounded range and clamps end to size', () => {
    assert.deepEqual(parseRangeHeader('bytes=10-9999', 100), {
      offset: 10,
      length: 90,
    })
  })

  test('parses suffix range bytes=-50', () => {
    assert.deepEqual(parseRangeHeader('bytes=-50', 100), {
      offset: 50,
      length: 50,
    })
  })

  test('rejects invalid / multi ranges', () => {
    assert.equal(parseRangeHeader('bytes=0-10,20-30', 100), null)
    assert.equal(parseRangeHeader('items=0-10', 100), null)
    assert.equal(parseRangeHeader(null, 100), null)
    assert.equal(parseRangeHeader('bytes=200-300', 100), null)
  })
})

// ---------------------------------------------------------------------------
// Presign validation (no R2 secrets required for negative paths)
// ---------------------------------------------------------------------------
describe('handlePresign validation', () => {
  const baseEnv = {
    FIREBASE_PROJECT_ID: 'cso-repository',
    MAX_UPLOAD_BYTES: '1073741824',
    R2_ACCOUNT_ID: 'acct',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'cso-video-submissions',
  }

  function makeRequest(body, userId = 'uid-123') {
    const req = new Request('https://worker.test/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    req.userId = userId
    return req
  }

  test('rejects non-JSON body', async () => {
    const req = new Request('https://worker.test/presign', {
      method: 'POST',
      body: 'not-json',
    })
    req.userId = 'u'
    const res = await handlePresign(req, baseEnv)
    assert.equal(res.status, 400)
  })

  test('rejects unsupported content type', async () => {
    const res = await handlePresign(
      makeRequest({ contentType: 'application/pdf', size: 1000 }),
      baseEnv,
    )
    assert.equal(res.status, 400)
    const data = await res.json()
    assert.match(data.error, /Unsupported content type/)
  })

  test('rejects missing size', async () => {
    const res = await handlePresign(makeRequest({ contentType: 'video/mp4' }), baseEnv)
    assert.equal(res.status, 400)
  })

  test('rejects size over 1GB', async () => {
    const res = await handlePresign(
      makeRequest({ contentType: 'video/mp4', size: 1024 * 1024 * 1024 + 1 }),
      baseEnv,
    )
    assert.equal(res.status, 413)
  })

  test('returns 503 when R2 secrets missing', async () => {
    const env = { ...baseEnv, R2_ACCESS_KEY_ID: '', R2_SECRET_ACCESS_KEY: '' }
    const res = await handlePresign(makeRequest({ contentType: 'video/mp4', size: 1024 }), env)
    assert.equal(res.status, 503)
  })

  test('signs a presigned PUT URL when configured', async () => {
    const res = await handlePresign(makeRequest({ contentType: 'video/mp4', size: 1024 }), baseEnv)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.match(data.key, /^videos\/uid-123\/.+\.mp4$/)
    assert.equal(data.publicUrl, `https://worker.test/${data.key}`)
    assert.ok(data.publicUrl.endsWith(`.mp4`))
    assert.ok(data.uploadUrl.includes('r2.cloudflarestorage.com'))
    assert.ok(data.uploadUrl.includes('X-Amz-Expires=900'))
    assert.ok(data.uploadUrl.includes('X-Amz-Signature='))
    assert.equal(data.contentType, 'video/mp4')
    assert.equal(data.expiresIn, 900)
  })

  test('publicUrl uses PLAYBACK_ORIGIN when configured', async () => {
    const env = { ...baseEnv, PLAYBACK_ORIGIN: 'https://media.example.com/' }
    const res = await handlePresign(makeRequest({ contentType: 'video/mp4', size: 1024 }), env)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.match(data.publicUrl, /^https:\/\/media\.example\.com\/videos\/uid-123\//)
  })

  test('no reduce → single key, no .original companion', async () => {
    const res = await handlePresign(
      makeRequest({ contentType: 'video/quicktime', size: 1024 }),
      baseEnv,
    )
    const data = await res.json()
    assert.match(data.key, /^videos\/uid-123\/.+\.mov$/)
    assert.equal(data.originalKey, null)
    assert.equal(data.originalUploadUrl, null)
  })

  test('reduce → public .mp4 key plus a .original companion', async () => {
    const res = await handlePresign(
      makeRequest({
        contentType: 'video/quicktime',
        size: 512,
        originalSize: 1024,
        reduce: true,
      }),
      baseEnv,
    )
    assert.equal(res.status, 200)
    const data = await res.json()

    // public key is always .mp4 — that is the reduced file
    assert.match(data.key, /^videos\/uid-123\/[^/]+\.mp4$/)
    // original keeps the SOURCE extension and is suffixed .original
    assert.match(data.originalKey, /^videos\/uid-123\/[^/]+\.mov\.original$/)
    // same base name → url + ".original"
    assert.equal(data.originalKey, `${data.key.slice(0, -'.mp4'.length)}.mov.original`)

    assert.ok(data.uploadUrl.includes(data.key))
    assert.ok(data.originalUploadUrl.includes(data.originalKey))
    assert.ok(data.uploadUrl.includes('X-Amz-Signature='))
    assert.ok(data.originalUploadUrl.includes('X-Amz-Signature='))
    assert.notEqual(data.uploadUrl, data.originalUploadUrl)
    assert.equal(data.publicUrl, `https://worker.test/${data.key}`)
  })

  test('reduce without originalSize → 400', async () => {
    const res = await handlePresign(
      makeRequest({ contentType: 'video/mp4', size: 512, reduce: true }),
      baseEnv,
    )
    assert.equal(res.status, 400)
    const data = await res.json()
    assert.match(data.error, /original file size/)
  })

  test('reduce with originalSize over 1GB → 413', async () => {
    const res = await handlePresign(
      makeRequest({
        contentType: 'video/mp4',
        size: 512,
        originalSize: 1024 * 1024 * 1024 + 1,
        reduce: true,
      }),
      baseEnv,
    )
    assert.equal(res.status, 413)
  })
})

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
describe('verifyFirebaseToken', () => {
  test('throws AuthError when Authorization missing', async () => {
    const req = new Request('https://worker.test/presign', { method: 'POST' })
    await assert.rejects(
      () => verifyFirebaseToken(req, { FIREBASE_PROJECT_ID: 'p' }),
      (err) => err instanceof AuthError && err.status === 401,
    )
  })

  test('throws AuthError on garbage token', async () => {
    const req = new Request('https://worker.test/presign', {
      method: 'POST',
      headers: { Authorization: 'Bearer not.a.jwt' },
    })
    await assert.rejects(
      () => verifyFirebaseToken(req, { FIREBASE_PROJECT_ID: 'cso-repository' }),
      (err) => err instanceof AuthError,
    )
  })
})

// ---------------------------------------------------------------------------
// Playback path guards
// ---------------------------------------------------------------------------
describe('handleServe path guards', () => {
  const env = { VIDEOS: null }

  test('404 for non-/videos path', async () => {
    const req = new Request('https://worker.test/other')
    const res = await handleServe('/other', req, env)
    assert.equal(res.status, 404)
  })

  test('400 for path traversal key', async () => {
    const req = new Request('https://worker.test/videos/../secret')
    const res = await handleServe('/videos/../secret', req, env)
    assert.equal(res.status, 400)
  })

  test('503 when R2 binding missing', async () => {
    const req = new Request('https://worker.test/videos/u/f.mp4')
    const res = await handleServe('/videos/u/f.mp4', req, { VIDEOS: null })
    assert.equal(res.status, 503)
  })

  test('maps /videos/uid/file to R2 key videos/uid/file', async () => {
    let headKey
    const bucket = {
      async head(k) {
        headKey = k
        return { size: 10 }
      },
      async get() {
        return { body: new Uint8Array([0]), httpMetadata: { contentType: 'video/mp4' } }
      },
    }
    const req = new Request('https://worker.test/videos/uid-1/f.mp4')
    const res = await handleServe('/videos/uid-1/f.mp4', req, { VIDEOS: bucket })
    assert.equal(res.status, 200)
    assert.equal(headKey, 'videos/uid-1/f.mp4')
  })
})

// ---------------------------------------------------------------------------
// Edge cache (Cache API) — hit skips R2, miss schedules a full-object fill
// ---------------------------------------------------------------------------
describe('handleServe edge cache', () => {
  const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

  function makeBucket({ size = 10 } = {}) {
    const calls = { head: [], get: [] }
    return {
      calls,
      async head(k) {
        calls.head.push(k)
        return { size, httpMetadata: { contentType: 'video/mp4' } }
      },
      async get(k, opts) {
        calls.get.push(opts ?? null)
        if (!opts?.range) {
          return { body: bytes, httpMetadata: { contentType: 'video/mp4' } }
        }
        const { offset, length } = opts.range
        return {
          body: bytes.slice(offset, offset + length),
          httpMetadata: { contentType: 'video/mp4' },
        }
      },
    }
  }

  // Minimal caches.default stand-in: stores full 200s, slices on Range like
  // Cloudflare's edge does.
  function makeCache() {
    const store = new Map()
    return {
      store,
      async match(req) {
        const entry = store.get(req.url)
        if (!entry) return undefined
        const headers = new Headers(entry.headers)
        const range = req.headers.get('Range')
        if (!range) return new Response(entry.body, { status: entry.status, headers })
        const m = /^bytes=(\d+)-(\d*)$/.exec(range)
        if (!m) return new Response(entry.body, { status: entry.status, headers })
        const start = Number(m[1])
        const end = m[2] === '' ? entry.body.length - 1 : Math.min(Number(m[2]), entry.body.length - 1)
        if (start >= entry.body.length || start > end) return undefined
        headers.set('Content-Range', `bytes ${start}-${end}/${entry.body.length}`)
        headers.set('Content-Length', String(end - start + 1))
        return new Response(entry.body.slice(start, end + 1), { status: 206, headers })
      },
      async put(req, res) {
        const body = new Uint8Array(await res.arrayBuffer())
        store.set(req.url, { body, status: res.status, headers: Object.fromEntries(res.headers) })
      },
    }
  }

  const originalCaches = globalThis.caches

  function useCache(cache) {
    globalThis.caches = { default: cache }
  }

  // Restore the global so earlier/later groups never see a fake cache.
  after(() => {
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
  })

  test('miss: serves ranged bytes from R2 and schedules an edge cache fill', async () => {
    const cache = makeCache()
    useCache(cache)
    const bucket = makeBucket()
    const waits = []
    const ctx = { waitUntil: (p) => waits.push(p) }

    const req = new Request('https://worker.test/videos/uid-1/f.mp4', {
      headers: { Range: 'bytes=2-5' },
    })
    const res = await handleServe('/videos/uid-1/f.mp4', req, { VIDEOS: bucket }, ctx)

    assert.equal(res.status, 206)
    assert.equal(res.headers.get('Content-Range'), 'bytes 2-5/10')
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [2, 3, 4, 5])
    assert.deepEqual(bucket.calls.get[0], { range: { offset: 2, length: 4 } })

    assert.equal(waits.length, 1)
    await Promise.all(waits)

    assert.equal(cache.store.size, 1)
    const stored = [...cache.store.values()][0]
    assert.equal(stored.status, 200)
    assert.equal(stored.headers['content-length'], '10')
    assert.equal(stored.headers['cache-control'], 'public, max-age=31536000, immutable')
    assert.deepEqual([...stored.body], [...bytes])
  })

  test('hit: returns the edge-cached slice without touching R2', async () => {
    const cache = makeCache()
    cache.store.set('https://worker.test/videos/uid-1/cached.mp4', {
      body: bytes,
      status: 200,
      headers: {
        'content-type': 'video/mp4',
        'content-length': '10',
        'cache-control': 'public, max-age=31536000, immutable',
        'accept-ranges': 'bytes',
      },
    })
    useCache(cache)

    const bucket = {
      async head() {
        throw new Error('R2 head() must not run on a cache hit')
      },
      async get() {
        throw new Error('R2 get() must not run on a cache hit')
      },
    }

    const req = new Request('https://worker.test/videos/uid-1/cached.mp4', {
      headers: { Range: 'bytes=4-6' },
    })
    const res = await handleServe('/videos/uid-1/cached.mp4', req, { VIDEOS: bucket })

    assert.equal(res.status, 206)
    assert.equal(res.headers.get('Content-Range'), 'bytes 4-6/10')
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [4, 5, 6])
  })

  test('skips the cache fill for objects over the cache size cap', async () => {
    const cache = makeCache()
    useCache(cache)
    const bucket = makeBucket({ size: 512 * 1024 * 1024 + 1 })
    const waits = []
    const ctx = { waitUntil: (p) => waits.push(p) }

    const req = new Request('https://worker.test/videos/uid-1/big.mp4', {
      headers: { Range: 'bytes=0-3' },
    })
    const res = await handleServe('/videos/uid-1/big.mp4', req, { VIDEOS: bucket }, ctx)

    assert.equal(res.status, 206)
    assert.equal(waits.length, 0)
    assert.equal(cache.store.size, 0)
  })

  test('works without a ctx (no fill scheduled, no crash)', async () => {
    const cache = makeCache()
    useCache(cache)
    const bucket = makeBucket()

    const req = new Request('https://worker.test/videos/uid-1/noctx.mp4', {
      headers: { Range: 'bytes=0-' },
    })
    const res = await handleServe('/videos/uid-1/noctx.mp4', req, { VIDEOS: bucket })

    assert.equal(res.status, 206)
    assert.equal(cache.store.size, 0)
  })
})

// ---------------------------------------------------------------------------
// Playback redirect to the custom domain (Cache API requires it)
// ---------------------------------------------------------------------------
describe('playback redirect to PLAYBACK_ORIGIN', () => {
  const env = {
    PLAYBACK_ORIGIN: 'https://media.example.com',
    ALLOWED_ORIGINS: 'https://cso-opensource.pages.dev',
  }

  test('302s legacy workers.dev playback URLs to the custom domain', async () => {
    const req = new Request('https://cso-videos.example.workers.dev/videos/uid-1/f.mp4', {
      headers: { Range: 'bytes=0-' },
    })
    const res = await worker.fetch(req, env, {})
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('Location'), 'https://media.example.com/videos/uid-1/f.mp4')
    // Cacheable: media stacks re-request the original URL per Range chunk —
    // an uncached 302 doubled every playback request.
    assert.match(res.headers.get('Cache-Control') || '', /immutable/)
  })

  test('serves directly when the host already matches', async () => {
    const req = new Request('https://media.example.com/videos/uid-1/f.mp4')
    const res = await worker.fetch(req, { ...env, VIDEOS: null }, {})
    // no redirect → playback path reached (no R2 binding in this test env)
    assert.equal(res.status, 503)
  })

  test('ignores a malformed PLAYBACK_ORIGIN', async () => {
    const req = new Request('https://cso-videos.example.workers.dev/videos/uid-1/f.mp4')
    const res = await worker.fetch(req, { ...env, PLAYBACK_ORIGIN: 'not-a-url', VIDEOS: null }, {})
    assert.equal(res.status, 503)
  })
})
