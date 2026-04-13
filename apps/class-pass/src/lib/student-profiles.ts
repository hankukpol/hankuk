import type { TenantType } from '@/lib/tenant'
import { normalizeBirthDate } from '@/lib/auth/student-auth'
import { generateStudentPin } from '@/lib/auth/pin'
import { createServerClient } from '@/lib/supabase/server'
import type { Enrollment, Student } from '@/types/database'
import { normalizeExamNumber, normalizeName, normalizePhone } from '@/lib/utils'

type DbClient = ReturnType<typeof createServerClient>

type EnrollmentWithStudentRow = Enrollment & {
  students?: Student | null
}

export type StudentProfileSnapshot = {
  name: string
  phone: string
  exam_number?: string | null
  photo_url?: string | null
}

export type EnsureStudentProfileResult = {
  student: Student
  created: boolean
  changed: boolean
}

export type StudentAuthSetupResult = {
  student: Student
  changed: boolean
  generatedPin: string | null
}

function normalizeStudentSnapshot(snapshot: StudentProfileSnapshot) {
  return {
    name: normalizeName(snapshot.name),
    phone: normalizePhone(snapshot.phone),
    exam_number: snapshot.exam_number === undefined
      ? undefined
      : normalizeExamNumber(snapshot.exam_number) || null,
    photo_url: snapshot.photo_url === undefined
      ? undefined
      : snapshot.photo_url?.trim() || null,
  }
}

async function getStudentById(
  db: DbClient,
  studentId: number,
  division?: TenantType,
) {
  let query = db
    .from('students')
    .select('*')
    .eq('id', studentId)

  if (division) {
    query = query.eq('division', division)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw error
  }

  return (data as Student | null) ?? null
}

async function updateStudentRecord(
  db: DbClient,
  studentId: number,
  payload: Partial<Pick<Student, 'name' | 'phone' | 'exam_number' | 'birth_date' | 'pin_hash' | 'auth_method' | 'photo_url' | 'updated_at'>>,
) {
  const { data, error } = await db
    .from('students')
    .update(payload)
    .eq('id', studentId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data as Student
}

async function findStudentByExamNumber(
  db: DbClient,
  division: TenantType,
  examNumber: string,
) {
  const { data, error } = await db
    .from('students')
    .select('*')
    .eq('division', division)
    .eq('exam_number', examNumber)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as Student | null) ?? null
}

async function findStudentByPhone(
  db: DbClient,
  division: TenantType,
  phone: string,
  name: string,
) {
  const { data, error } = await db
    .from('students')
    .select('*')
    .eq('division', division)
    .eq('phone', phone)
    .order('updated_at', { ascending: false })
    .order('id')

  if (error) {
    throw error
  }

  const rows = (data ?? []) as Student[]
  if (rows.length === 0) {
    return null
  }

  const matchedByName = rows.find((row) => normalizeName(row.name) === name)
  if (matchedByName) {
    return matchedByName
  }

  if (rows.length === 1) {
    return rows[0] ?? null
  }

  return null
}

export async function findMatchingStudentProfile(
  db: DbClient,
  params: StudentProfileSnapshot & {
    division: TenantType
    currentStudentId?: number | null
  },
) {
  const normalized = normalizeStudentSnapshot(params)
  let student: Student | null = null

  if (params.currentStudentId) {
    student = await getStudentById(db, params.currentStudentId, params.division)
  }

  if (!student && normalized.exam_number) {
    student = await findStudentByExamNumber(db, params.division, normalized.exam_number)
  }

  if (!student) {
    student = await findStudentByPhone(db, params.division, normalized.phone, normalized.name)
  }

  return student
}

export async function getStudentProfileById(
  db: DbClient,
  studentId: number,
  division?: TenantType,
) {
  return getStudentById(db, studentId, division)
}

export function getStudentAuthProfile(student: Student) {
  return {
    id: student.id,
    birth_date: student.birth_date,
    auth_method: student.auth_method,
  }
}

export async function initializeStudentAuth(
  db: DbClient,
  studentOrId: Student | number,
  birthDate?: string | null,
): Promise<StudentAuthSetupResult> {
  const student = typeof studentOrId === 'number'
    ? await getStudentById(db, studentOrId)
    : studentOrId

  if (!student) {
    throw new Error('student_profiles.initializeStudentAuth: student not found')
  }

  if (student.auth_method) {
    return {
      student,
      changed: false,
      generatedPin: null,
    }
  }

  const normalizedBirthDate = normalizeBirthDate(birthDate ?? student.birth_date)
  if (normalizedBirthDate) {
    const updatedStudent = await updateStudentRecord(db, student.id, {
      birth_date: normalizedBirthDate,
      pin_hash: null,
      auth_method: 'birth_date',
      updated_at: new Date().toISOString(),
    })

    return {
      student: updatedStudent,
      changed: true,
      generatedPin: null,
    }
  }

  const { pin, hash } = await generateStudentPin()
  const updatedStudent = await updateStudentRecord(db, student.id, {
    pin_hash: hash,
    auth_method: 'pin',
    updated_at: new Date().toISOString(),
  })

  return {
    student: updatedStudent,
    changed: true,
    generatedPin: pin,
  }
}

export async function applyStudentBirthDate(
  db: DbClient,
  studentOrId: Student | number,
  birthDate: string | null | undefined,
): Promise<StudentAuthSetupResult> {
  const student = typeof studentOrId === 'number'
    ? await getStudentById(db, studentOrId)
    : studentOrId

  if (!student) {
    throw new Error('student_profiles.applyStudentBirthDate: student not found')
  }

  const normalizedBirthDate = normalizeBirthDate(birthDate)
  if (!normalizedBirthDate) {
    return {
      student,
      changed: false,
      generatedPin: null,
    }
  }

  if (
    student.birth_date === normalizedBirthDate
    && student.auth_method === 'birth_date'
    && !student.pin_hash
  ) {
    return {
      student,
      changed: false,
      generatedPin: null,
    }
  }

  const updatedStudent = await updateStudentRecord(db, student.id, {
    birth_date: normalizedBirthDate,
    pin_hash: null,
    auth_method: 'birth_date',
    updated_at: new Date().toISOString(),
  })

  return {
    student: updatedStudent,
    changed: true,
    generatedPin: null,
  }
}

export async function resetStudentPin(
  db: DbClient,
  studentOrId: Student | number,
): Promise<StudentAuthSetupResult> {
  const student = typeof studentOrId === 'number'
    ? await getStudentById(db, studentOrId)
    : studentOrId

  if (!student) {
    throw new Error('student_profiles.resetStudentPin: student not found')
  }

  const { pin, hash } = await generateStudentPin()
  const updatedStudent = await updateStudentRecord(db, student.id, {
    pin_hash: hash,
    auth_method: 'pin',
    updated_at: new Date().toISOString(),
  })

  return {
    student: updatedStudent,
    changed: true,
    generatedPin: pin,
  }
}

export async function listStudentsPendingAuthSetup(
  db: DbClient,
  division: TenantType,
) {
  const { data, error } = await db
    .from('students')
    .select('*')
    .eq('division', division)
    .is('auth_method', null)
    .order('id')

  if (error) {
    throw error
  }

  return (data ?? []) as Student[]
}

export async function ensureStudentProfile(
  db: DbClient,
  params: StudentProfileSnapshot & {
    division: TenantType
    currentStudentId?: number | null
  },
): Promise<EnsureStudentProfileResult> {
  const normalized = normalizeStudentSnapshot(params)
  const student = await findMatchingStudentProfile(db, params)

  const timestamp = new Date().toISOString()

  if (!student) {
    const insertPayload: Record<string, string | null> = {
      division: params.division,
      name: normalized.name,
      phone: normalized.phone,
      exam_number: normalized.exam_number ?? null,
      photo_url: normalized.photo_url ?? null,
    }

    const { data, error } = await db
      .from('students')
      .insert({
        ...insertPayload,
        updated_at: timestamp,
      })
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return {
      student: data as Student,
      created: true,
      changed: true,
    }
  }

  const updatePayload: Record<string, string | null> = {
    name: normalized.name,
    phone: normalized.phone,
    updated_at: timestamp,
  }

  if (normalized.exam_number !== undefined) {
    updatePayload.exam_number = normalized.exam_number
  }

  if (normalized.photo_url !== undefined) {
    updatePayload.photo_url = normalized.photo_url
  }

  const shouldUpdate =
    student.name !== normalized.name
    || student.phone !== normalized.phone
    || (normalized.exam_number !== undefined && student.exam_number !== normalized.exam_number)
    || (normalized.photo_url !== undefined && student.photo_url !== normalized.photo_url)

  if (!shouldUpdate) {
    return {
      student,
      created: false,
      changed: false,
    }
  }

  const { data, error } = await db
    .from('students')
    .update(updatePayload)
    .eq('id', student.id)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return {
    student: data as Student,
    created: false,
    changed: true,
  }
}

export async function syncStudentEnrollmentSnapshots(
  db: DbClient,
  studentOrId: number | Student,
) {
  const student = typeof studentOrId === 'number'
    ? await getStudentById(db, studentOrId)
    : studentOrId

  if (!student) {
    throw new Error('student_profiles.syncStudentEnrollmentSnapshots: student not found')
  }

  const { error } = await db
    .from('enrollments')
    .update({
      name: student.name,
      phone: student.phone,
      exam_number: student.exam_number,
      photo_url: student.photo_url,
      student_id: student.id,
    })
    .eq('student_id', student.id)

  if (error) {
    throw error
  }

  return student
}

export async function deleteStudentIfOrphaned(
  db: DbClient,
  studentId: number | null | undefined,
) {
  if (!studentId) {
    return
  }

  const { count, error: countError } = await db
    .from('enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)

  if (countError) {
    throw countError
  }

  if ((count ?? 0) > 0) {
    return
  }

  const { error } = await db
    .from('students')
    .delete()
    .eq('id', studentId)

  if (error) {
    throw error
  }
}

export function mergeEnrollmentStudentSnapshot(row: EnrollmentWithStudentRow): Enrollment {
  const student = row.students
  if (!student) {
    const { students, ...enrollment } = row
    void students
    return enrollment
  }

  const { students, ...enrollment } = row
  void students
  return {
    ...enrollment,
    student_id: enrollment.student_id ?? student.id,
    name: student.name,
    phone: student.phone,
    exam_number: student.exam_number,
    photo_url: student.photo_url,
  }
}
