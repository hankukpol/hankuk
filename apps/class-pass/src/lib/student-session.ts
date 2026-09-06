import type { PassCourseSummary } from '@/types/database'
import { withTenantPrefix, type TenantType } from '@/lib/tenant'
import { normalizeName, normalizePhone } from '@/lib/utils'

export const STUDENT_SESSION_NAME_KEY = 'class_pass_student_name'
export const STUDENT_SESSION_PHONE_KEY = 'class_pass_student_phone'
export const STUDENT_SESSION_VERIFICATION_KEY = 'class_pass_student_verification'
export const STUDENT_SESSION_COURSES_KEY = 'class_pass_student_courses'
const STUDENT_COURSE_CACHE_VERSION = 3

type StudentCourseCachePayload = {
  version: number
  tenant: TenantType
  name: string
  phone: string
  verificationCode: string
  courses: PassCourseSummary[]
}

type StudentCourseCacheIdentity = Omit<StudentCourseCachePayload, 'courses' | 'version'>

function normalizeVerificationCode(value: string) {
  return value.replace(/\D/g, '')
}

function matchesCachedIdentity(
  cached: StudentCourseCachePayload,
  params: StudentCourseCacheIdentity,
) {
  return (
    cached.tenant === params.tenant
    && normalizeName(cached.name) === normalizeName(params.name)
    && normalizePhone(cached.phone) === normalizePhone(params.phone)
    && normalizeVerificationCode(cached.verificationCode) === normalizeVerificationCode(params.verificationCode)
  )
}

export function writeStudentCourseCache(
  storage: Pick<Storage, 'setItem'>,
  payload: StudentCourseCacheIdentity & Pick<StudentCourseCachePayload, 'courses'>,
) {
  storage.setItem(STUDENT_SESSION_COURSES_KEY, JSON.stringify({
    ...payload,
    version: STUDENT_COURSE_CACHE_VERSION,
  }))
}

export function readStudentCourseCache(
  storage: Pick<Storage, 'getItem'>,
  params: StudentCourseCacheIdentity,
) {
  const raw = storage.getItem(STUDENT_SESSION_COURSES_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as StudentCourseCachePayload
    if (parsed.version !== STUDENT_COURSE_CACHE_VERSION) {
      return null
    }
    return matchesCachedIdentity(parsed, params) ? parsed.courses : null
  } catch {
    return null
  }
}

export function clearStudentSession(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(STUDENT_SESSION_NAME_KEY)
  storage.removeItem(STUDENT_SESSION_PHONE_KEY)
  storage.removeItem(STUDENT_SESSION_VERIFICATION_KEY)
  storage.removeItem(STUDENT_SESSION_COURSES_KEY)
}

/** A rejected server session never falls back to name/phone or stored credentials. */
export async function fetchStudentApi(division: TenantType, input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, { ...init, credentials: 'same-origin', cache: 'no-store' })
  if (response.status === 401 && typeof window !== 'undefined') {
    clearStudentSession(window.sessionStorage)
    window.location.replace(`${withTenantPrefix('/', division)}?loggedOut=1&sessionExpired=1`)
  }
  return response
}

const STUDENT_REMEMBER_KEY = 'class_pass_remember_me'
const STUDENT_SAVED_NAME_KEY = 'class_pass_saved_name'
const STUDENT_SAVED_PHONE_KEY = 'class_pass_saved_phone'
const STUDENT_SAVED_VERIFICATION_KEY = 'class_pass_saved_verification'

export function isStudentRemembered(): boolean {
  try {
    return localStorage.getItem(STUDENT_REMEMBER_KEY) === '1'
  } catch {
    return false
  }
}

export function getSavedStudentCredentials(): { name: string; phone: string; verificationCode: string } | null {
  try {
    if (localStorage.getItem(STUDENT_REMEMBER_KEY) !== '1') {
      return null
    }
    const name = localStorage.getItem(STUDENT_SAVED_NAME_KEY) ?? ''
    const phone = localStorage.getItem(STUDENT_SAVED_PHONE_KEY) ?? ''
    const verificationCode = localStorage.getItem(STUDENT_SAVED_VERIFICATION_KEY) ?? ''
    if (!name || !phone || !verificationCode) {
      return null
    }
    return { name, phone, verificationCode }
  } catch {
    return null
  }
}

export function saveStudentCredentials(name: string, phone: string, verificationCode: string) {
  try {
    localStorage.setItem(STUDENT_REMEMBER_KEY, '1')
    localStorage.setItem(STUDENT_SAVED_NAME_KEY, name)
    localStorage.setItem(STUDENT_SAVED_PHONE_KEY, phone)
    localStorage.setItem(STUDENT_SAVED_VERIFICATION_KEY, verificationCode)
  } catch {
    // localStorage unavailable
  }
}

export function clearSavedStudentCredentials() {
  try {
    localStorage.removeItem(STUDENT_REMEMBER_KEY)
    localStorage.removeItem(STUDENT_SAVED_NAME_KEY)
    localStorage.removeItem(STUDENT_SAVED_PHONE_KEY)
    localStorage.removeItem(STUDENT_SAVED_VERIFICATION_KEY)
  } catch {
    // localStorage unavailable
  }
}
