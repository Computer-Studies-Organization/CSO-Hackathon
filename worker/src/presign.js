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
 * Body: { contentType, size?, originalSize?, filename?, reduce? }
 *   - contentType: type of the SOURCE file
 *   - size: bytes of what will be PUT to `key` (the reduced file when
 *     `reduce: true`, otherwise the source file itself)
 *   - originalSize: bytes of the source file (only meaningful with reduce)
 *   - reduce: true → two objects are signed:
 *       key          videos/{uid}/{rand}.mp4        (public — the reduced file)
 *       originalKey  videos/{uid}/{rand}.{ext}.original (the untouched source)
 * Auth: Firebase ID token
 * Returns: { uploadUrl, key, publicUrl, originalKey?, originalUploadUrl?, expiresIn }
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

  const reduce = body?.reduce === true

  const maxBytes = Number(env.MAX_UPLOAD_BYTES || 1024 * 1024 * 1024)
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

  const originalSize = body?.originalSize == null ? null : Number(body.originalSize)
  if (reduce && (!Number.isFinite(originalSize) || originalSize <= 0)) {
    return json({ error: 'Missing or invalid original file size' }, 400)
  }
  if (originalSize != null && originalSize > maxBytes) {
    return json(
      { error: `File exceeds max size of ${Math.floor(maxBytes / (1024 * 1024))}MB` },
      413,
    )
  }

  // Key namespaced by uid — one folder per user
  const uid = request.userId
  const ext = extFor(contentType)
  const random =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  // reduce → public key always ends .mp4 (the reduced file the client
  // transcodes), the untouched source lives next to it as .{ext}.original.
  const key = reduce ? `videos/${uid}/${random}.mp4` : `videos/${uid}/${random}.${ext}`
  const originalKey = reduce ? `videos/${uid}/${random}.${ext}.original` : null

  const accountId = env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY
  const bucket = env.R2_BUCKET || 'cso-video-submissions'

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return json({ error: 'Upload service is not configured' }, 503)
  }

  const host = `${accountId}.r2.cloudflarestorage.com`
  const expiresIn = 900 // 15 minutes — must be in query BEFORE signing

  const signer = new AwsClient({
    region: 'auto',
    accessKeyId,
    secretAccessKey,
    service: 's3',
  })

  /** Presigned PUT — ContentType is signed, client must echo the same header. */
  const signPut = (objectKey, objectContentType) => {
    const putUrl = new URL(`https://${host}/${bucket}/${objectKey}`)
    putUrl.searchParams.set('X-Amz-Expires', String(expiresIn))
    return signer
      .sign(putUrl.toString(), {
        method: 'PUT',
        headers: { 'Content-Type': objectContentType },
        aws: { signQuery: true },
      })
      .then((signed) => signed.url)
  }

  // Reduced file (or the source itself when reduce is off) → video/mp4
  const uploadUrl = await signPut(key, reduce ? 'video/mp4' : contentType)
  const originalUploadUrl = originalKey ? await signPut(originalKey, contentType) : null

  // key is already "videos/{uid}/…", so public path is /{key}
  // Playback origin (custom domain) wins when set — the Cache API only works
  // there, so new submissions should store URLs that hit the edge cache.
  let origin = new URL(request.url).origin
  if (env.PLAYBACK_ORIGIN) {
    try {
      origin = new URL(env.PLAYBACK_ORIGIN).origin
    } catch {
      // keep request origin
    }
  }
  const publicUrl = `${origin}/${key}`

  return json({
    uploadUrl,
    key,
    publicUrl,
    contentType,
    originalKey,
    originalUploadUrl,
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
