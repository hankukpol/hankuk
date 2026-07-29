import { comparePin } from '@/lib/auth/pin'
import type { StudentAuthMethod } from '@/types/database'

export { normalizeBirthDate } from '@/lib/utils'

type StudentAuthRecord = {
  auth_method: StudentAuthMethod | null
  birth_date: string | null
  pin_hash: string | null
}

export type VerifyStudentAuthResult =
  | { ok: true }
  | { ok: false; reason: 'no_auth_configured' | 'invalid_code' }

export async function verifyStudentAuth(
  student: StudentAuthRecord,
  code: string,
): Promise<VerifyStudentAuthResult> {
  const normalizedCode = code.replace(/\D/g, '')

  if (!student.auth_method) {
    return { ok: false, reason: 'no_auth_configured' }
  }

  if (student.auth_method === 'birth_date') {
    return student.birth_date === normalizedCode
      ? { ok: true }
      : { ok: false, reason: 'invalid_code' }
  }

  if (student.pin_hash && await comparePin(normalizedCode, student.pin_hash)) {
    return { ok: true }
  }

  return { ok: false, reason: 'invalid_code' }
}
