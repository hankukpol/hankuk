import type { QrTokenPayload } from '@/types/database'

const ALGO = { name: 'HMAC', hash: 'SHA-256' }
const TTL_MS = 24 * 60 * 60 * 1000 // 24시간

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.QR_HMAC_SECRET!
  if (!secret) throw new Error('QR_HMAC_SECRET 환경변수가 설정되지 않았습니다.')
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    ALGO,
    false,
    ['sign', 'verify'],
  )
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const pad = str.length % 4
  const padded = pad ? str + '='.repeat(4 - pad) : str
  const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return arr
}

export async function generateQrToken(studentId: string): Promise<string> {
  const now = Date.now()
  const payload: QrTokenPayload = { sid: studentId, ts: now, exp: now + TTL_MS }
  const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  const key = await getKey()
  const sig = await crypto.subtle.sign(ALGO.name, key, new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${b64url(sig)}`
}

export async function verifyQrToken(token: string): Promise<QrTokenPayload | null> {
  try {
    const [payloadB64, sigB64] = token.split('.')
    if (!payloadB64 || !sigB64) return null

    const key = await getKey()
    const valid = await crypto.subtle.verify(
      ALGO.name,
      key,
      b64urlDecode(sigB64),
      new TextEncoder().encode(payloadB64),
    )
    if (!valid) return null

    const payload = JSON.parse(
      new TextDecoder().decode(b64urlDecode(payloadB64)),
    ) as QrTokenPayload

    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}
