/**
 * Pages Function: GET /videos/*
 *
 * Same playback pipeline as the Worker (Range → 206, R2 binding) but running
 * on the Pages project, where the Cache API actually works (*.workers.dev
 * deployments are a no-op for caching). serve.js caches each object once at
 * the edge and serves later Range/seek requests from the cache.
 *
 * Requires an R2 binding named VIDEOS on the Pages project
 * (Settings → Bindings → R2 → cso-video-submissions).
 */
import { handleServe } from '../../worker/src/serve.js'

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

export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Pages binding is named "Video" (dashboard); the Worker uses "VIDEOS".
  const playbackEnv = env.VIDEOS ? env : { ...env, VIDEOS: env.Video }

  const url = new URL(request.url)
  const res = await handleServe(url.pathname, request, playbackEnv, context)
  return cors(res)
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Max-Age': '86400',
    },
  })
}
