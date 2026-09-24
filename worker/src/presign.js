import { AwsClient } from 'aws4fetch'

const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
  'video/mpeg',
]

const EXT_BY_TYPE = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'video/mpeg': 'mpeg',
}

function extFor(contentType) {
  return EXT_BY_TYPE[contentType] || 'mp4'
}

/**
 * POST /presign
 * Body: { contentType, size?, filename? }
 * Auth: Firebase ID token
 * Returns: { uploadUrl, key, publicUrl, expiresIn }
 */
export async function handlePresign(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const contentType = String(body?.contentType || '')
    .toLowerCase()
    .trim()
  if (!ALLOWED_VIDEO_TYPES.includes(contentType)) {
    return json(
      { error: `Unsupported content type. Allowed: ${ALLOWED_VIDEO_TYPES.join(', ')}` },
      400,
    )
  }

  const maxBytes = Number(env.MAX_UPLOAD_BYTES || 100 * 1024 * 1024)
  const size = Number(body?.size)
  if (!Number.isFinite(size) || size <= 0) {
    return json({ error: 'Missing or invalid file size' }, 400)
  }
  if (size > maxBytes) {
    return json(
      { error: `File exceeds max size of ${Math.floor(maxBytes / (1024 * 1024))}MB` },
      413,
    )
  }

  const accountId = env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY
  const bucket = env.R2_BUCKET || 'cso-video-submissions'

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return json({ error: 'Upload service is not configured' }, 503)
  }

  // Key namespaced by uid — one folder per user
  const uid = request.userId
  const ext = extFor(contentType)
  const random =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const key = `videos/${uid}/${random}.${ext}`

  const host = `${accountId}.r2.cloudflarestorage.com`
  const expiresIn = 900 // 15 minutes — must be in query BEFORE signing
  const putUrl = new URL(`https://${host}/${bucket}/${key}`)
  putUrl.searchParams.set('X-Amz-Expires', String(expiresIn))

  const signer = new AwsClient({
    region: 'auto',
    accessKeyId,
    secretAccessKey,
    service: 's3',
  })

  // ContentType is signed — client must send the exact same header on PUT
  const signed = await signer.sign(putUrl.toString(), {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    aws: { signQuery: true },
  })

  // key is already "videos/{uid}/…", so public path is /{key}
  const origin = new URL(request.url).origin
  const publicUrl = `${origin}/${key}`

  return json({
    uploadUrl: signed.url,
    key,
    publicUrl,
    contentType,
    expiresIn,
  })
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}
