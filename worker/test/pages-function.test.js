import { test, describe } from 'node:test'
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
