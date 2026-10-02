/**
 * Pages Function: GET /videos/*  ·  POST /videos/__purge
 *
 * Same playback pipeline as the Worker (Range → 206, R2 binding) but running
 * on the Pages project, where the Cache API actually works (*.workers.dev
 * deployments are a no-op for caching). serve.js caches each object once at
 * the edge and serves later Range/seek requests from the cache.
 *
 * /videos/__purge drops those cache entries. Needed because playback is stored
 * with `immutable` — replacing an object in R2 (scripts/reduce-videos.mjs)
 * would otherwise keep serving the old bytes from the edge for a year.
 * Guarded by the PURGE_SECRET Pages environment variable.
 *
 * Requires an R2 binding named VIDEOS on the Pages project
 * (Settings → Bindings → R2 → cso-video-submissions).
 */
import { handleServe } from '../../worker/src/serve.js'

const PURGE_PATH = '/videos/__purge'

// Object keys we are willing to drop from the cache — never accept raw URLs.
const KEY_PATTERN = /^videos\/[A-Za-z0-9_./-]+$/

function cors(response) {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Expose-Headers', 'Accept-Ranges, Content-Length, Content-Range')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

/** Length-independent string compare so the secret cannot be guessed byte by byte. */
function secretMatches(a, b) {
  const pad = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < pad; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

async function handlePurge(context) {
  const { request, env } = context

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const secret = env.PURGE_SECRET
  const provided = request.headers.get('X-Purge-Secret') || ''
  if (!secret || !secretMatches(provided, secret)) {
    return json({ error: 'Forbidden' }, 403)
  }

  let keys
  try {
    keys = (await request.json())?.keys
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!Array.isArray(keys)) {
    return json({ error: 'Expected { keys: string[] }' }, 400)
  }

  const cache = globalThis.caches?.default
  if (!cache) {
    return json({ purged: 0, note: 'Cache API unavailable here' })
  }

  const origin = new URL(request.url).origin
  let purged = 0
  for (const key of keys.slice(0, 100)) {
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) continue
    if (await cache.delete(new Request(`${origin}/${key}`))) purged++
  }

  return json({ purged })
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)

  if (url.pathname === PURGE_PATH || url.pathname === `${PURGE_PATH}/`) {
    return handlePurge(context)
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Pages binding is named "Video" (dashboard); the Worker uses "VIDEOS".
  const playbackEnv = env.VIDEOS ? env : { ...env, VIDEOS: env.Video }

  const res = await handleServe(url.pathname, request, playbackEnv, context)
  return cors(res)
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, X-Purge-Secret',
      'Access-Control-Max-Age': '86400',
    },
  })
}
