import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import type { Student } from '@/types/database'

type StudentCredential = Pick<Student, 'id' | 'division' | 'auth_method' | 'pin_hash' | 'birth_date'>
const STUDENT_TTL_SEC = 60 * 60
const ISSUER = 'class-pass-student'
const AUDIENCE = 'class-pass-student-api'

function secret() {
  const value = process.env.JWT_SECRET
  if (!value || value.length < 32) throw new Error('JWT_SECRET must be at least 32 characters.')
  return value
}

function credentialFingerprint(student: StudentCredential) {
  // A keyed digest cannot be used to guess a low-entropy birth date or PIN offline.
  return createHmac('sha256', secret()).update(JSON.stringify([
    ISSUER, student.id, student.division, student.auth_method, student.pin_hash, student.birth_date,
  ])).digest('hex')
}

export function studentCookieName(division: string) {
  return `class_pass_student_${encodeURIComponent(division)}`
}

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: STUDENT_TTL_SEC,
})

/** Only call after verifyStudentAuth succeeds against this exact credential snapshot. */
export async function attachStudentSession(response: NextResponse, student: StudentCredential) {
  if (!student.auth_method) throw new Error('Student credentials are not configured.')
  const token = await new SignJWT({
    role: 'student', division: student.division, credential: credentialFingerprint(student),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(student.id))
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${STUDENT_TTL_SEC}s`)
    .sign(new TextEncoder().encode(secret()))
  response.cookies.set(studentCookieName(student.division), token, cookieOptions())
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export function clearStudentSessionCookie(response: NextResponse, division: string) {
  response.cookies.set(studentCookieName(division), '', { ...cookieOptions(), maxAge: 0 })
  response.headers.set('Cache-Control', 'no-store')
  return response
}

function sessionRequired(division: string) {
  return clearStudentSessionCookie(NextResponse.json({
    error: '학생 인증이 만료되었거나 변경되었습니다. 다시 로그인해 주세요.',
    code: 'STUDENT_SESSION_REQUIRED',
  }, { status: 401 }), division)
}

export async function requireStudentSession(req: NextRequest): Promise<
  { studentId: number; division: Student['division'] } | NextResponse
> {
  const originError = validateSameOriginRequest(req)
  if (originError) return originError
  const division = await getServerTenantType()
  const token = req.cookies.get(studentCookieName(division))?.value
  if (!token) return sessionRequired(division)

  let subject: number
  let credential: string
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret()), {
      algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE, maxTokenAge: `${STUDENT_TTL_SEC}s`,
    })
    subject = Number(payload.sub)
    if (payload.role !== 'student' || payload.division !== division || !Number.isSafeInteger(subject) || subject <= 0
      || typeof payload.credential !== 'string' || !/^[a-f0-9]{64}$/.test(payload.credential)
      || typeof payload.exp !== 'number') return sessionRequired(division)
    credential = payload.credential
  } catch {
    return sessionRequired(division)
  }

  // No cache: deletion, PIN reset and authentication-method changes revoke the next request.
  const { data, error } = await createServerClient().from('students')
    .select('id,division,auth_method,pin_hash,birth_date').eq('id', subject).eq('division', division).maybeSingle()
  if (error) throw error
  const student = data as StudentCredential | null
  if (!student || !student.auth_method || !timingSafeEqual(
    Buffer.from(credential, 'hex'), Buffer.from(credentialFingerprint(student), 'hex'),
  )) return sessionRequired(division)
  return { studentId: student.id, division }
}
