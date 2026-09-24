import { createRemoteJWKSet, jwtVerify } from 'jose'

const JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
)

let jwks

function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(JWKS_URL)
  }
  return jwks
}

/**
 * Verify a Firebase ID token from `Authorization: Bearer <token>`.
 * Returns { uid, email } or throws.
 */
export async function verifyFirebaseToken(request, env) {
  const header = request.headers.get('Authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    throw new AuthError('Missing Authorization bearer token')
  }

  const token = match[1].trim()
  const projectId = env.FIREBASE_PROJECT_ID
  if (!projectId) {
    throw new AuthError('FIREBASE_PROJECT_ID not configured')
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    })

    const uid = payload.sub
    if (!uid || typeof uid !== 'string') {
      throw new AuthError('Token missing sub/uid')
    }

    return {
      uid,
      email: typeof payload.email === 'string' ? payload.email : null,
    }
  } catch (err) {
    if (err instanceof AuthError) throw err
    throw new AuthError('Invalid or expired token')
  }
}

export class AuthError extends Error {
  constructor(message) {
    super(message)
    this.name = 'AuthError'
    this.status = 401
  }
}
