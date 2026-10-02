import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'

import { onRequest, onRequestOptions } from '../../functions/videos/[[path]].js'

// ---------------------------------------------------------------------------
// Pages Function playback (functions/videos/[[path]].js)
// ---------------------------------------------------------------------------
describe('Pages Function /videos', () => {
  function makeBucket() {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    return {
      async head() {
        return { size: 10, httpMetadata: { contentType: 'video/mp4' } }
      },
      async get(_k, opts) {
        if (!opts?.range) return { body: bytes, httpMetadata: { contentType: 'video/mp4' } }
        const { offset, length } = opts.range
        return { body: bytes.slice(offset, offset + length), httpMetadata: { contentType: 'video/mp4' } }
      },
    }
  }

  test('serves ranged bytes with CORS headers (no caches global → origin path)', async () => {
    const context = {
      request: new Request('https://cso-opensource.pages.dev/videos/uid-1/f.mp4', {
        headers: { Range: 'bytes=2-5' },
      }),
      env: { VIDEOS: makeBucket() },
      waitUntil: () => {},
    }

    const res = await onRequest(context)
    assert.equal(res.status, 206)
    assert.equal(res.headers.get('Content-Range'), 'bytes 2-5/10')
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*')
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [2, 3, 4, 5])
  })

  test('rejects non-GET methods', async () => {
    const res = await onRequest({
      request: new Request('https://cso-opensource.pages.dev/videos/uid-1/f.mp4', {
        method: 'POST',
      }),
      env: { VIDEOS: makeBucket() },
      waitUntil: () => {},
    })
    assert.equal(res.status, 405)
  })

  test('503 when the VIDEOS binding is missing', async () => {
    const res = await onRequest({
      request: new Request('https://cso-opensource.pages.dev/videos/uid-1/f.mp4'),
      env: {},
      waitUntil: () => {},
    })
    assert.equal(res.status, 503)
  })

  test('answers CORS preflight', async () => {
    const res = await onRequestOptions()
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*')
    assert.match(res.headers.get('Access-Control-Allow-Headers'), /Range/)
  })
})

// ---------------------------------------------------------------------------
// POST /videos/__purge — drops immutable edge-cache entries after R2 objects
// are replaced (scripts/reduce-videos.mjs).
// ---------------------------------------------------------------------------
describe('POST /videos/__purge', () => {
  const originalCaches = globalThis.caches

  after(() => {
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = originalCaches
  })

  function purgeRequest(body, headers = {}) {
    return new Request('https://cso-opensource.pages.dev/videos/__purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body == null ? null : JSON.stringify(body),
    })
  }

  test('GET on the purge route → 405', async () => {
    const res = await onRequest({
      request: new Request('https://cso-opensource.pages.dev/videos/__purge'),
      env: { PURGE_SECRET: 's' },
    })
    assert.equal(res.status, 405)
  })

  test('missing / wrong secret → 403', async () => {
    const noSecret = await onRequest({ request: purgeRequest({ keys: [] }), env: {} })
    assert.equal(noSecret.status, 403)

    const wrong = await onRequest({
      request: purgeRequest({ keys: [] }, { 'X-Purge-Secret': 'nope' }),
      env: { PURGE_SECRET: 'right' },
    })
    assert.equal(wrong.status, 403)
  })

  test('keys must be an array → 400', async () => {
    const res = await onRequest({
      request: purgeRequest({ keys: 'videos/x.mp4' }, { 'X-Purge-Secret': 's' }),
      env: { PURGE_SECRET: 's' },
    })
    assert.equal(res.status, 400)
  })

  test('deletes cached entries for valid keys, skips junk', async () => {
    const deleted = []
    globalThis.caches = {
      default: {
        async delete(req) {
          deleted.push(req.url)
          return true
        },
      },
    }

    const res = await onRequest({
      request: purgeRequest(
        {
          keys: [
            'videos/uid-1/a.mp4',
            'videos/uid-1/a.mov.original',
            'https://evil.example.com/not-a-key',
            '../etc/passwd',
            42,
          ],
        },
        { 'X-Purge-Secret': 's' },
      ),
      env: { PURGE_SECRET: 's' },
    })

    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.purged, 2)
    assert.deepEqual(deleted, [
      'https://cso-opensource.pages.dev/videos/uid-1/a.mp4',
      'https://cso-opensource.pages.dev/videos/uid-1/a.mov.original',
    ])
  })

  test('works without a caches global → purged: 0', async () => {
    if (originalCaches === undefined) delete globalThis.caches
    else globalThis.caches = undefined

    const res = await onRequest({
      request: purgeRequest({ keys: ['videos/uid-1/a.mp4'] }, { 'X-Purge-Secret': 's' }),
      env: { PURGE_SECRET: 's' },
    })
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.purged, 0)
  })
})
