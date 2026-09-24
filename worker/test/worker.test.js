import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { parseRangeHeader, handleServe } from '../src/serve.js'
import { handlePresign } from '../src/presign.js'
import { AuthError, verifyFirebaseToken } from '../src/auth.js'

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
    MAX_UPLOAD_BYTES: '104857600',
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

  test('rejects size over 100MB', async () => {
    const res = await handlePresign(
      makeRequest({ contentType: 'video/mp4', size: 101 * 1024 * 1024 }),
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
