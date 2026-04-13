import type { StaffJwtPayload } from '@/types/database'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
let importedKeyPromise: Promise<CryptoKey> | null = null

function getJwtSecret() {
  const value = process.env.JWT_SECRET
  if (!value || value.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters.')
  }

  return value
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4
  const padded = padding === 0 ? normalized : normalized + '='.repeat(4 - padding)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function decodeJsonPart<T>(input: string): T | null {
  try {
    return JSON.parse(decoder.decode(decodeBase64Url(input))) as T
  } catch {
    return null
  }
}

async function getJwtKey() {
  if (!importedKeyPromise) {
    importedKeyPromise = crypto.subtle.importKey(
      'raw',
      encoder.encode(getJwtSecret()),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
  }

  return importedKeyPromise
}

export async function verifyJwtInMiddleware(token: string): Promise<StaffJwtPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts
    const header = decodeJsonPart<{ alg?: string; typ?: string }>(encodedHeader)
    const payload = decodeJsonPart<StaffJwtPayload>(encodedPayload)

    if (!header || header.alg !== 'HS256' || !payload) {
      return null
    }

    const verified = await crypto.subtle.verify(
      'HMAC',
      await getJwtKey(),
      decodeBase64Url(encodedSignature),
      encoder.encode(`${encodedHeader}.${encodedPayload}`),
    )

    if (!verified) {
      return null
    }

    const now = Math.floor(Date.now() / 1000)
    if (typeof payload.exp !== 'number' || payload.exp <= now) {
      return null
    }

    const payloadWithNbf = payload as StaffJwtPayload & { nbf?: number }
    if (typeof payloadWithNbf.nbf === 'number') {
      const { nbf } = payloadWithNbf
      if (nbf > now) {
        return null
      }
    }

    return payload
  } catch {
    return null
  }
}
