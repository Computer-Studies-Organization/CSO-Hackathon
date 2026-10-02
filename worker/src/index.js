import { AuthError, verifyFirebaseToken } from './auth.js'
import { handlePresign, json } from './presign.js'
import { handleServe } from './serve.js'

function allowedOrigins(env) {
  const raw = env.ALLOWED_ORIGINS || ''
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || ''
  const allow = allowedOrigins(env)
  const allowed = allow.includes(origin) ? origin : allow[0] || ''

  return {
    'Access-Control-Allow-Origin': allowed || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'ETag, Content-Length, Content-Range, Accept-Ranges',
    Vary: 'Origin',
  }
}

/** Origin of the custom domain attached to this Worker, or '' when unset. */
function playbackOrigin(env) {
  if (!env.PLAYBACK_ORIGIN) return ''
  try {
    return new URL(env.PLAYBACK_ORIGIN).origin
  } catch {
    return ''
  }
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers)
  const cors = corsHeaders(request, env)
  for (const [k, v] of Object.entries(cors)) {
    headers.set(k, v)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      })
    }

    try {
      // Presign endpoint
      if (url.pathname === '/presign' && request.method === 'POST') {
        const auth = await verifyFirebaseToken(request, env)
        request.userId = auth.uid
        const res = await handlePresign(request, env)
        return withCors(res, request, env)
      }

      // Public video playback
      if (url.pathname.startsWith('/videos/') && request.method === 'GET') {
        // The Cache API (edge caching) only takes effect off *.workers.dev —
        // send legacy workers.dev playback URLs to the custom domain.
        const playback = playbackOrigin(env)
        if (playback && url.origin !== playback) {
          // Cacheable redirect: media stacks re-request the ORIGINAL URL for
          // every Range chunk, and a bare 302 (no Cache-Control) is not cached
          // — that doubled every playback request. With immutable caching the
          // browser resolves the hop once, then goes straight to the origin.
          return withCors(
            new Response(null, {
              status: 302,
              headers: {
                Location: `${playback}${url.pathname}${url.search}`,
                'Cache-Control': 'public, max-age=31536000, immutable',
              },
            }),
            request,
            env,
          )
        }
        const res = await handleServe(url.pathname, request, env, ctx)
        return withCors(res, request, env)
      }

      // Health
      if (url.pathname === '/' || url.pathname === '/health') {
        return withCors(json({ ok: true, service: 'cso-videos' }), request, env)
      }

      return withCors(json({ error: 'Not found' }, 404), request, env)
    } catch (err) {
      if (err instanceof AuthError) {
        return withCors(json({ error: err.message }, err.status || 401), request, env)
      }
      console.error('Worker error:', err)
      return withCors(json({ error: 'Internal error' }, 500), request, env)
    }
  },
}
