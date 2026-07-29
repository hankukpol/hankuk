import type { TenantType } from '@/lib/tenant'
import { normalizeBirthDate } from '@/lib/auth/student-auth'
import { generateStudentPin } from '@/lib/auth/pin'
import { createServerClient } from '@/lib/supabase/server'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import type { Course, Enrollment, Student } from '@/types/database'
import { normalizeGenderLabel } from '@/lib/gender'
import { normalizeExamNumber, normalizeName, normalizePhone } from '@/lib/utils'

type DbClient = ReturnType<typeof createServerClient>

type EnrollmentWithStudentRow = Enrollment & {
  students?: Student | null
}

type MaybeJoinedOne<T> = T | T[] | null | undefined

type EnrollmentWithCourseAndStudentRow = Pick<
  Enrollment,
  'id' | 'course_id' | 'student_id' | 'name' | 'phone' | 'exam_number' | 'status'
> & {
  courses?: MaybeJoinedOne<Pick<Course, 'id' | 'name' | 'status' | 'sort_order'>>
  students?: MaybeJoinedOne<Pick<Student, 'id' | 'birth_date' | 'auth_method'>>
}

export type StudentProfileSnapshot = {
  name: string
  phone: string
  exam_number?: string | null
  cohort_option_id?: number | null
  birth_date?: string | null
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

export type EnsureStudentProfileBatchInput = StudentProfileSnapshot & {
  key: string
  division: TenantType
  currentStudentId?: number | null
}

export type StudentProfileBatchInspection = {
  student: Student | null
  conflict: {
    message: string
    fields: string[]
  } | null
}

export type InitializeStudentAuthBatchInput = {
  key: string
  student: Student
  birthDate?: string | null
}

export type GeneratedStudentPin = {
  studentId: number
  name: string
  phone: string
  pin: string
}

export type PendingStudentAuthStats = {
  total: number
  birthDateReadyCount: number
  pinRequiredCount: number
}

export type MissingBirthDateStudent = {
  enrollmentId: number
  studentId: number | null
  name: string
  phone: string
  examNumber: string | null
  authMethod: Student['auth_method']
}

export type MissingBirthDateCourseGroup = {
  courseId: number
  courseName: string
  courseStatus: Course['status']
  students: MissingBirthDateStudent[]
}

type NormalizedStudentSnapshot = {
  name: string
  phone: string
  exam_number?: string | null
  cohort_option_id?: number | null
  birth_date?: string | null
  photo_url?: string | null
}

type PreparedEnsureBatchInput = EnsureStudentProfileBatchInput & {
  dedupKey: string
  normalized: NormalizedStudentSnapshot
}

export class StudentIdentityConflictError extends Error {
  status = 409
  code = 'STUDENT_IDENTITY_CONFLICT'
  fields: string[]

  constructor(message: string, fields: string[] = []) {
    super(message)
    this.name = 'StudentIdentityConflictError'
    this.fields = fields
  }
}

export function isStudentIdentityConflictError(error: unknown): error is StudentIdentityConflictError {
  return error instanceof StudentIdentityConflictError
    || (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: unknown }).code === 'STUDENT_IDENTITY_CONFLICT'
    )
}

function hasOwnField<T extends object>(value: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function normalizeStudentSnapshot(snapshot: StudentProfileSnapshot): NormalizedStudentSnapshot {
  return {
    name: normalizeName(snapshot.name),
    phone: normalizePhone(snapshot.phone),
    exam_number: snapshot.exam_number === undefined
      ? undefined
      : normalizeExamNumber(snapshot.exam_number) || null,
    cohort_option_id: hasOwnField(snapshot, 'cohort_option_id')
      ? snapshot.cohort_option_id ?? null
      : undefined,
    birth_date: hasOwnField(snapshot, 'birth_date')
      ? normalizeBirthDate(snapshot.birth_date) || null
      : undefined,
    photo_url: snapshot.photo_url === undefined
      ? undefined
      : snapshot.photo_url?.trim() || null,
  }
}

function buildStudentIdentityKey(snapshot: StudentProfileSnapshot | Student | NormalizedStudentSnapshot) {
  const examNumber = normalizeExamNumber(snapshot.exam_number) || ''
  if (examNumber) {
    return `exam:${examNumber}`
  }

  const birthDate = normalizeBirthDate('birth_date' in snapshot ? snapshot.birth_date : undefined) || ''
  return `identity:${normalizePhone(snapshot.phone)}::${normalizeName(snapshot.name)}::${birthDate}`
}

function normalizeJoinedOne<T>(value: MaybeJoinedOne<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function hasStoredBirthDate(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}

function getNormalizedStudentBirthDate(student: Pick<Student, 'birth_date'>) {
  return normalizeBirthDate(student.birth_date) || null
}

function getStudentIdentityMismatches(
  student: Student,
  normalized: NormalizedStudentSnapshot,
) {
  const mismatches: string[] = []
  const studentExamNumber = normalizeExamNumber(student.exam_number) || null
  const studentBirthDate = getNormalizedStudentBirthDate(student)

  if (normalizeName(student.name) !== normalized.name) {
    mismatches.push('name')
  }

  if (normalizePhone(student.phone) !== normalized.phone) {
    mismatches.push('phone')
  }

  if (
    normalized.exam_number
    && studentExamNumber
    && studentExamNumber !== normalized.exam_number
  ) {
    mismatches.push('exam_number')
  }

  if (
    normalized.birth_date
    && studentBirthDate
    && studentBirthDate !== normalized.birth_date
  ) {
    mismatches.push('birth_date')
  }

  return mismatches
}

function assertStudentIdentityMatches(
  student: Student,
  normalized: NormalizedStudentSnapshot,
  matchedBy: 'exam_number' | 'identity',
) {
  const mismatches = getStudentIdentityMismatches(student, normalized)
  if (mismatches.length === 0) {
    return
  }

  throw new StudentIdentityConflictError(
    `Student identity conflict while matching by ${matchedBy}. Check exam number, name, phone, and birth date.`,
    mismatches,
  )
}

async function assertNoStudentIdentityCollision(
  db: DbClient,
  division: TenantType,
  normalized: NormalizedStudentSnapshot,
  currentStudent?: Student | null,
) {
  const currentStudentId = currentStudent?.id ?? null
  const nextExamNumber = normalized.exam_number !== undefined
    ? normalized.exam_number
    : normalizeExamNumber(currentStudent?.exam_number) || null
  const nextBirthDate = normalized.birth_date !== undefined
    ? normalized.birth_date
    : normalizeBirthDate(currentStudent?.birth_date) || null

  if (nextExamNumber) {
    const sameExamStudent = await findStudentByExamNumber(db, division, nextExamNumber)
    if (sameExamStudent && sameExamStudent.id !== currentStudentId) {
      throw new StudentIdentityConflictError(
        'Another student already uses this exam number.',
        ['exam_number'],
      )
    }
  }

  if (normalized.name && normalized.phone && nextBirthDate) {
    const sameIdentityStudent = await findStudentByIdentity(
      db,
      division,
      normalized.name,
      normalized.phone,
      nextBirthDate,
    )

    if (sameIdentityStudent && sameIdentityStudent.id !== currentStudentId) {
      throw new StudentIdentityConflictError(
        'Another student already uses this name, phone, and birth date.',
        ['name', 'phone', 'birth_date'],
      )
    }
  }
}

function shouldUpdateStudent(
  student: Student,
  normalized: NormalizedStudentSnapshot,
) {
  return (
    student.name !== normalized.name
    || student.phone !== normalized.phone
    || (normalized.exam_number !== undefined && student.exam_number !== normalized.exam_number)
    || (normalized.cohort_option_id !== undefined && student.cohort_option_id !== normalized.cohort_option_id)
    || (normalized.birth_date !== undefined && normalized.birth_date !== null && student.birth_date !== normalized.birth_date)
    || (normalized.photo_url !== undefined && student.photo_url !== normalized.photo_url)
  )
}

function buildStudentUpsertPayload(
  student: Student,
  overrides: Partial<Pick<Student, 'name' | 'phone' | 'exam_number' | 'cohort_option_id' | 'birth_date' | 'pin_hash' | 'auth_method' | 'photo_url' | 'updated_at'>>,
) {
  return {
    id: student.id,
    division: student.division,
    name: overrides.name ?? student.name,
    phone: overrides.phone ?? student.phone,
    exam_number: overrides.exam_number ?? student.exam_number,
    cohort_option_id: hasOwnField(overrides, 'cohort_option_id')
      ? overrides.cohort_option_id ?? null
      : student.cohort_option_id ?? null,
    birth_date: overrides.birth_date ?? student.birth_date,
    pin_hash: overrides.pin_hash ?? student.pin_hash,
    auth_method: overrides.auth_method ?? student.auth_method,
    photo_url: overrides.photo_url ?? student.photo_url,
    updated_at: overrides.updated_at ?? student.updated_at,
  }
}

async function getStudentById(
  db: DbClient,
  studentId: number,
  division: TenantType,
) {
  const { data, error } = await db
    .from('students')
    .select('*')
    .eq('id', studentId)
    .eq('division', division)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as Student | null) ?? null
}

async function listStudentsByIds(
  db: DbClient,
  studentIds: number[],
  division?: TenantType,
) {
  if (studentIds.length === 0) {
    return []
  }

  let query = db
    .from('students')
    .select('*')
    .in('id', studentIds)

  if (division) {
    query = query.eq('division', division)
  }

  const rows = unwrapSupabaseResult(
    'studentProfiles.listStudentsByIds',
    await query,
  ) as Student[] | null

  return rows ?? []
}

async function updateStudentRecord(
  db: DbClient,
  studentId: number,
  payload: Partial<Pick<Student, 'name' | 'phone' | 'exam_number' | 'cohort_option_id' | 'birth_date' | 'pin_hash' | 'auth_method' | 'photo_url' | 'updated_at'>>,
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
  const exactNameRows = unwrapSupabaseResult(
    'studentProfiles.findStudentByPhone.exactName',
    await db
      .from('students')
      .select('*')
      .eq('division', division)
      .eq('phone', phone)
      .eq('name', name)
      .order('updated_at', { ascending: false })
      .order('id')
      .limit(2),
  ) as Student[] | null

  if ((exactNameRows?.length ?? 0) > 1) {
    throw new StudentIdentityConflictError(
      'Multiple students match this name and phone. Birth date is required to disambiguate.',
      ['name', 'phone', 'birth_date'],
    )
  }

  if ((exactNameRows?.length ?? 0) === 1) {
    return exactNameRows?.[0] ?? null
  }

  return null
}

async function findStudentByIdentity(
  db: DbClient,
  division: TenantType,
  name: string,
  phone: string,
  birthDate: string,
) {
  const rows = unwrapSupabaseResult(
    'studentProfiles.findStudentByIdentity',
    await db
      .from('students')
      .select('*')
      .eq('division', division)
      .eq('name', name)
      .eq('phone', phone)
      .eq('birth_date', birthDate)
      .order('updated_at', { ascending: false })
      .order('id')
      .limit(2),
  ) as Student[] | null

  if ((rows?.length ?? 0) > 1) {
    throw new StudentIdentityConflictError(
      'Multiple students have the same name, phone, and birth date.',
      ['name', 'phone', 'birth_date'],
    )
  }

  return rows?.[0] ?? null
}

async function findCanonicalDuplicateStudent(
  db: DbClient,
  insertedStudent: Student,
  normalized: NormalizedStudentSnapshot,
) {
  const query = db
    .from('students')
    .select('*')
    .eq('division', insertedStudent.division)
    .eq('phone', normalized.phone)
    .eq('name', normalized.name)
    .order('id')
    .limit(2)

  const rows = unwrapSupabaseResult(
    'studentProfiles.findCanonicalDuplicate',
    normalized.exam_number
      ? await query.eq('exam_number', normalized.exam_number)
      : normalized.birth_date
        ? await query.eq('birth_date', normalized.birth_date)
        : await query.is('exam_number', null),
  ) as Student[] | null

  const canonical = rows?.[0] ?? null
  if (!canonical || canonical.id === insertedStudent.id) {
    return null
  }

  await db.from('students').delete().eq('id', insertedStudent.id)
  return canonical
}

function findMatchingStudentFromPhoneCandidates(
  candidates: Student[] | undefined,
  normalized: NormalizedStudentSnapshot,
) {
  if (!candidates || candidates.length === 0) {
    return null
  }

  const nameMatches = candidates.filter((row) => normalizeName(row.name) === normalized.name)
  if (nameMatches.length === 0) {
    return null
  }

  if (normalized.birth_date) {
    const birthMatches = nameMatches.filter((row) => {
      const storedBirthDate = getNormalizedStudentBirthDate(row)
      return storedBirthDate === normalized.birth_date || storedBirthDate === null
    })

    if (birthMatches.length === 1) {
      return birthMatches[0] ?? null
    }

    if (birthMatches.length > 1) {
      throw new StudentIdentityConflictError(
        'Multiple students match this name, phone, and birth date.',
        ['name', 'phone', 'birth_date'],
      )
    }
  }

  if (nameMatches.length === 1) {
    return nameMatches[0] ?? null
  }

  if (nameMatches.length > 1) {
    throw new StudentIdentityConflictError(
      'Multiple students match this name and phone. Birth date is required to disambiguate.',
      ['name', 'phone', 'birth_date'],
    )
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
    if (student) {
      assertStudentIdentityMatches(student, normalized, 'exam_number')
    }
  }

  if (!student && normalized.birth_date) {
    student = await findStudentByIdentity(
      db,
      params.division,
      normalized.name,
      normalized.phone,
      normalized.birth_date,
    )
    if (student) {
      assertStudentIdentityMatches(student, normalized, 'identity')
    }
  }

  if (!student && !normalized.birth_date) {
    student = await findStudentByPhone(db, params.division, normalized.phone, normalized.name)
  }

  return student
}

export async function getStudentProfileById(
  db: DbClient,
  studentId: number,
  division: TenantType,
) {
  return getStudentById(db, studentId, division)
}

export function getStudentAuthProfile(student: Student) {
  return {
    id: student.id,
    birth_date: student.birth_date,
    auth_method: student.auth_method,
    cohort_option_id: student.cohort_option_id ?? null,
    cohort_label: student.cohort_label ?? null,
  }
}

export function getEnrollmentStudentMismatchFields(
  enrollment: Pick<Enrollment, 'name' | 'phone' | 'exam_number'>,
  student: Pick<Student, 'name' | 'phone' | 'exam_number'>,
) {
  const fields: string[] = []
  const enrollmentName = normalizeName(enrollment.name)
  const studentName = normalizeName(student.name)
  const enrollmentPhone = normalizePhone(enrollment.phone)
  const studentPhone = normalizePhone(student.phone)
  const enrollmentExamNumber = normalizeExamNumber(enrollment.exam_number)
  const studentExamNumber = normalizeExamNumber(student.exam_number)

  if (enrollmentName && studentName && enrollmentName !== studentName) {
    fields.push('name')
  }

  if (enrollmentPhone && studentPhone && enrollmentPhone !== studentPhone) {
    fields.push('phone')
  }

  if (enrollmentExamNumber && studentExamNumber && enrollmentExamNumber !== studentExamNumber) {
    fields.push('exam_number')
  }

  return fields
}

export async function initializeStudentAuth(
  db: DbClient,
  studentOrId: Student | number,
  birthDate?: string | null,
  division?: TenantType,
): Promise<StudentAuthSetupResult> {
  const student = typeof studentOrId === 'number'
    ? (division ? await getStudentById(db, studentOrId, division) : null)
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

export async function initializeStudentAuthBatch(
  db: DbClient,
  inputs: InitializeStudentAuthBatchInput[],
) {
  const results = new Map<string, StudentAuthSetupResult>()
  const generatedPins: GeneratedStudentPin[] = []

  if (inputs.length === 0) {
    return { results, generatedPins }
  }

  const birthDateUpdatesByStudentId = new Map<number, { student: Student; birthDate: string }>()
  const pinStudentsByStudentId = new Map<number, Student>()

  for (const input of inputs) {
    if (input.student.auth_method) {
      results.set(input.key, {
        student: input.student,
        changed: false,
        generatedPin: null,
      })
      continue
    }

    const normalizedBirthDate = normalizeBirthDate(input.birthDate ?? input.student.birth_date)
    if (normalizedBirthDate) {
      birthDateUpdatesByStudentId.set(input.student.id, {
        student: input.student,
        birthDate: normalizedBirthDate,
      })
      continue
    }

    pinStudentsByStudentId.set(input.student.id, input.student)
  }

  const updatedStudentsById = new Map<number, Student>()
  const generatedPinByStudentId = new Map<number, string>()

  if (birthDateUpdatesByStudentId.size > 0) {
    const nowIso = new Date().toISOString()
    const payloads = Array.from(birthDateUpdatesByStudentId.values()).map(({ student, birthDate }) => (
      buildStudentUpsertPayload(student, {
        birth_date: birthDate,
        pin_hash: null,
        auth_method: 'birth_date',
        updated_at: nowIso,
      })
    ))

    const rows = unwrapSupabaseResult(
      'studentProfiles.initializeStudentAuthBatch.birthDate',
      await db
        .from('students')
        .upsert(payloads, { onConflict: 'id' })
        .select('*'),
    ) as Student[] | null

    for (const row of rows ?? []) {
      updatedStudentsById.set(row.id, row)
    }
  }

  if (pinStudentsByStudentId.size > 0) {
    const nowIso = new Date().toISOString()
    const generated = await Promise.all(
      Array.from(pinStudentsByStudentId.values()).map(async (student) => {
        const { pin, hash } = await generateStudentPin()
        return {
          student,
          pin,
          payload: buildStudentUpsertPayload(student, {
            pin_hash: hash,
            auth_method: 'pin',
            updated_at: nowIso,
          }),
        }
      }),
    )

    const rows = unwrapSupabaseResult(
      'studentProfiles.initializeStudentAuthBatch.pin',
      await db
        .from('students')
        .upsert(generated.map((entry) => entry.payload), { onConflict: 'id' })
        .select('*'),
    ) as Student[] | null

    for (const row of rows ?? []) {
      updatedStudentsById.set(row.id, row)
    }

    for (const entry of generated) {
      generatedPinByStudentId.set(entry.student.id, entry.pin)
    }
  }

  for (const input of inputs) {
    if (results.has(input.key)) {
      continue
    }

    const updatedStudent = updatedStudentsById.get(input.student.id) ?? input.student
    const generatedPin = generatedPinByStudentId.get(input.student.id) ?? null

    const result = {
      student: updatedStudent,
      changed: updatedStudentsById.has(input.student.id),
      generatedPin,
    }

    results.set(input.key, result)

    if (generatedPin) {
      generatedPins.push({
        studentId: updatedStudent.id,
        name: updatedStudent.name,
        phone: updatedStudent.phone,
        pin: generatedPin,
      })
    }
  }

  return { results, generatedPins }
}

export async function applyStudentBirthDate(
  db: DbClient,
  studentOrId: Student | number,
  birthDate: string | null | undefined,
  division?: TenantType,
): Promise<StudentAuthSetupResult> {
  const student = typeof studentOrId === 'number'
    ? (division ? await getStudentById(db, studentOrId, division) : null)
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

  await assertNoStudentIdentityCollision(
    db,
    student.division as TenantType,
    {
      name: normalizeName(student.name),
      phone: normalizePhone(student.phone),
      birth_date: normalizedBirthDate,
    },
    student,
  )

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

export async function applyStudentCohortOption(
  db: DbClient,
  studentOrId: Student | number,
  cohortOptionId: number | null | undefined,
  division?: TenantType,
): Promise<EnsureStudentProfileResult> {
  const student = typeof studentOrId === 'number'
    ? (division ? await getStudentById(db, studentOrId, division) : null)
    : studentOrId

  if (!student) {
    throw new Error('student_profiles.applyStudentCohortOption: student not found')
  }

  const nextCohortOptionId = cohortOptionId ?? null
  if ((student.cohort_option_id ?? null) === nextCohortOptionId) {
    return {
      student,
      created: false,
      changed: false,
    }
  }

  const updatedStudent = await updateStudentRecord(db, student.id, {
    cohort_option_id: nextCohortOptionId,
    updated_at: new Date().toISOString(),
  })

  return {
    student: updatedStudent,
    created: false,
    changed: true,
  }
}

export async function resetStudentPin(
  db: DbClient,
  studentOrId: Student | number,
  division?: TenantType,
): Promise<StudentAuthSetupResult> {
  const student = typeof studentOrId === 'number'
    ? (division ? await getStudentById(db, studentOrId, division) : null)
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

export async function countStudentsPendingAuthSetup(
  db: DbClient,
  division: TenantType,
  options?: { birthDateReadyOnly?: boolean },
) {
  let query = db
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('division', division)
    .is('auth_method', null)

  if (options?.birthDateReadyOnly) {
    query = query.not('birth_date', 'is', null)
  }

  const { count, error } = await query

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function getPendingStudentAuthStats(
  db: DbClient,
  division: TenantType,
): Promise<PendingStudentAuthStats> {
  const [total, birthDateReadyCount] = await Promise.all([
    countStudentsPendingAuthSetup(db, division),
    countStudentsPendingAuthSetup(db, division, { birthDateReadyOnly: true }),
  ])

  return {
    total,
    birthDateReadyCount,
    pinRequiredCount: Math.max(total - birthDateReadyCount, 0),
  }
}

export async function listMissingBirthDateStudentsByCourse(
  db: DbClient,
  division: TenantType,
): Promise<MissingBirthDateCourseGroup[]> {
  const rows = unwrapSupabaseResult(
    'studentProfiles.listMissingBirthDateStudentsByCourse',
    await db
      .from('enrollments')
      .select([
        'id,course_id,student_id,name,phone,exam_number,status',
        'courses!inner(id,name,status,sort_order)',
        'students(id,birth_date,auth_method)',
      ].join(','))
      .eq('status', 'active')
      .eq('courses.division', division)
      .order('course_id')
      .order('created_at', { ascending: false }),
  ) as EnrollmentWithCourseAndStudentRow[] | null

  const collator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' })
  const groupsByCourseId = new Map<
    number,
    MissingBirthDateCourseGroup & {
      sortOrder: number
    }
  >()

  for (const row of rows ?? []) {
    const course = normalizeJoinedOne(row.courses)
    if (!course) {
      continue
    }

    const student = normalizeJoinedOne(row.students)
    if (hasStoredBirthDate(student?.birth_date)) {
      continue
    }

    const group = groupsByCourseId.get(course.id) ?? {
      courseId: course.id,
      courseName: course.name,
      courseStatus: course.status,
      students: [],
      sortOrder: course.sort_order,
    }

    group.students.push({
      enrollmentId: row.id,
      studentId: row.student_id,
      name: row.name,
      phone: row.phone,
      examNumber: row.exam_number,
      authMethod: student?.auth_method ?? null,
    })

    groupsByCourseId.set(course.id, group)
  }

  return Array.from(groupsByCourseId.values())
    .map((group) => ({
      ...group,
      students: group.students.sort((left, right) => {
        const nameCompare = collator.compare(left.name, right.name)
        if (nameCompare !== 0) {
          return nameCompare
        }

        return collator.compare(left.examNumber ?? '', right.examNumber ?? '')
      }),
    }))
    .sort((left, right) => {
      if (left.courseStatus !== right.courseStatus) {
        return left.courseStatus === 'active' ? -1 : 1
      }

      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder
      }

      const nameCompare = collator.compare(left.courseName, right.courseName)
      if (nameCompare !== 0) {
        return nameCompare
      }

      return left.courseId - right.courseId
    })
    .map((group) => ({
      courseId: group.courseId,
      courseName: group.courseName,
      courseStatus: group.courseStatus,
      students: group.students,
    }))
}

export async function listStudentsPendingAuthSetup(
  db: DbClient,
  division: TenantType,
  options?: { limit?: number },
) {
  let query = db
    .from('students')
    .select('*')
    .eq('division', division)
    .is('auth_method', null)
    .order('id')

  if (options?.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

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
    await assertNoStudentIdentityCollision(db, params.division, normalized)

    const insertPayload: Record<string, string | number | null> = {
      division: params.division,
      name: normalized.name,
      phone: normalized.phone,
      exam_number: normalized.exam_number ?? null,
      cohort_option_id: normalized.cohort_option_id ?? null,
      birth_date: normalized.birth_date ?? null,
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

    const insertedStudent = data as Student
    const canonicalStudent = await findCanonicalDuplicateStudent(db, insertedStudent, normalized)

    return {
      student: canonicalStudent ?? insertedStudent,
      created: canonicalStudent ? false : true,
      changed: canonicalStudent ? false : true,
    }
  }

  if (!shouldUpdateStudent(student, normalized)) {
    return {
      student,
      created: false,
      changed: false,
    }
  }

  await assertNoStudentIdentityCollision(db, params.division, normalized, student)

  const updatedStudent = await updateStudentRecord(db, student.id, {
    name: normalized.name,
    phone: normalized.phone,
    exam_number: normalized.exam_number !== undefined ? normalized.exam_number : student.exam_number,
    cohort_option_id: normalized.cohort_option_id !== undefined
      ? normalized.cohort_option_id
      : student.cohort_option_id,
    birth_date: normalized.birth_date !== undefined && normalized.birth_date !== null
      ? normalized.birth_date
      : student.birth_date,
    photo_url: normalized.photo_url !== undefined ? normalized.photo_url : student.photo_url,
    updated_at: timestamp,
  })

  return {
    student: updatedStudent,
    created: false,
    changed: true,
  }
}

/**
 * Resolve every import row against the student master without writing anything.
 *
 * Bulk enrollment uses this as a preflight so one conflicting student does not
 * abort the remaining valid rows and the UI can show the matching master values.
 */
export async function inspectStudentProfilesBatch(
  db: DbClient,
  inputs: EnsureStudentProfileBatchInput[],
) {
  const results = new Map<string, StudentProfileBatchInspection>()

  if (inputs.length === 0) {
    return results
  }

  const divisionGroups = new Map<TenantType, EnsureStudentProfileBatchInput[]>()
  for (const input of inputs) {
    divisionGroups.set(input.division, [...(divisionGroups.get(input.division) ?? []), input])
  }

  if (divisionGroups.size > 1) {
    for (const group of divisionGroups.values()) {
      const groupResults = await inspectStudentProfilesBatch(db, group)
      for (const [key, value] of groupResults.entries()) {
        results.set(key, value)
      }
    }

    return results
  }

  const prepared = inputs.map((input): PreparedEnsureBatchInput => ({
    ...input,
    normalized: normalizeStudentSnapshot(input),
    dedupKey: buildStudentIdentityKey(input),
  }))
  const division = prepared[0]!.division
  const currentStudentIds = Array.from(new Set(
    prepared
      .map((input) => input.currentStudentId ?? null)
      .filter((value): value is number => value !== null && Number.isInteger(value) && value > 0),
  ))
  const examNumbers = Array.from(new Set(
    prepared
      .map((input) => input.normalized.exam_number)
      .filter((value): value is string => Boolean(value)),
  ))
  const phones = Array.from(new Set(
    prepared.map((input) => input.normalized.phone).filter(Boolean),
  ))

  const [currentStudents, examStudents, phoneStudents] = await Promise.all([
    listStudentsByIds(db, currentStudentIds, division),
    examNumbers.length === 0
      ? Promise.resolve([] as Student[])
      : (async () => {
        const rows = unwrapSupabaseResult(
          'studentProfiles.inspectBatch.examStudents',
          await db
            .from('students')
            .select('*')
            .eq('division', division)
            .in('exam_number', examNumbers),
        ) as Student[] | null

        return rows ?? []
      })(),
    phones.length === 0
      ? Promise.resolve([] as Student[])
      : (async () => {
        const rows = unwrapSupabaseResult(
          'studentProfiles.inspectBatch.phoneStudents',
          await db
            .from('students')
            .select('*')
            .eq('division', division)
            .in('phone', phones)
            .order('updated_at', { ascending: false })
            .order('id'),
        ) as Student[] | null

        return rows ?? []
      })(),
  ])

  const currentStudentsById = new Map(currentStudents.map((student) => [student.id, student]))
  const examStudentsByNumber = new Map<string, Student>()
  const phoneStudentsByPhone = new Map<string, Student[]>()

  for (const student of examStudents) {
    const examNumber = normalizeExamNumber(student.exam_number)
    if (examNumber && !examStudentsByNumber.has(examNumber)) {
      examStudentsByNumber.set(examNumber, student)
    }
  }

  for (const student of phoneStudents) {
    const phone = normalizePhone(student.phone)
    phoneStudentsByPhone.set(phone, [...(phoneStudentsByPhone.get(phone) ?? []), student])
  }

  for (const input of prepared) {
    const currentStudent = input.currentStudentId
      ? currentStudentsById.get(input.currentStudentId) ?? null
      : null
    const examStudent = input.normalized.exam_number
      ? examStudentsByNumber.get(input.normalized.exam_number) ?? null
      : null

    if (currentStudent && examStudent && currentStudent.id !== examStudent.id) {
      results.set(input.key, {
        student: examStudent,
        conflict: {
          message: '현재 수강생과 같은 학번을 사용하는 다른 학생 마스터가 있습니다.',
          fields: ['exam_number'],
        },
      })
      continue
    }

    let matched = currentStudent ?? examStudent
    if (matched) {
      const mismatches = getStudentIdentityMismatches(matched, input.normalized)
      results.set(input.key, {
        student: matched,
        conflict: mismatches.length > 0
          ? {
              message: '기존 학생 마스터와 가져오기 행의 정보가 다릅니다.',
              fields: mismatches,
            }
          : null,
      })
      continue
    }

    try {
      matched = findMatchingStudentFromPhoneCandidates(
        phoneStudentsByPhone.get(input.normalized.phone),
        input.normalized,
      )
      const mismatches = matched
        ? getStudentIdentityMismatches(matched, input.normalized)
        : []

      results.set(input.key, {
        student: matched,
        conflict: mismatches.length > 0
          ? {
              message: '기존 학생 마스터와 가져오기 행의 정보가 다릅니다.',
              fields: mismatches,
            }
          : null,
      })
    } catch (error) {
      if (!isStudentIdentityConflictError(error)) {
        throw error
      }

      results.set(input.key, {
        student: null,
        conflict: {
          message: error.message,
          fields: error.fields,
        },
      })
    }
  }

  return results
}

export async function ensureStudentProfilesBatch(
  db: DbClient,
  inputs: EnsureStudentProfileBatchInput[],
) {
  const results = new Map<string, EnsureStudentProfileResult>()

  if (inputs.length === 0) {
    return results
  }

  const divisionGroups = new Map<TenantType, EnsureStudentProfileBatchInput[]>()
  for (const input of inputs) {
    divisionGroups.set(input.division, [...(divisionGroups.get(input.division) ?? []), input])
  }

  if (divisionGroups.size > 1) {
    for (const group of divisionGroups.values()) {
      const groupResults = await ensureStudentProfilesBatch(db, group)
      for (const [key, value] of groupResults.entries()) {
        results.set(key, value)
      }
    }

    return results
  }

  const prepared = inputs.map((input): PreparedEnsureBatchInput => ({
    ...input,
    normalized: normalizeStudentSnapshot(input),
    dedupKey: buildStudentIdentityKey(input),
  }))

  const preparedByDedupKey = new Map<string, PreparedEnsureBatchInput>()
  for (const input of prepared) {
    const existing = preparedByDedupKey.get(input.dedupKey)
    if (!existing) {
      preparedByDedupKey.set(input.dedupKey, input)
      continue
    }

    if (
      existing.normalized.name !== input.normalized.name
      || existing.normalized.phone !== input.normalized.phone
      || existing.normalized.birth_date !== input.normalized.birth_date
      || existing.normalized.exam_number !== input.normalized.exam_number
    ) {
      throw new StudentIdentityConflictError(
        'Duplicate import rows use the same student key with different identity values.',
        ['exam_number', 'name', 'phone', 'birth_date'],
      )
    }
  }

  const currentStudentIds = Array.from(new Set(
    prepared
      .map((input) => input.currentStudentId ?? null)
      .filter((value): value is number => value !== null && Number.isInteger(value) && value > 0),
  ))
  const examNumbers = Array.from(new Set(
    prepared
      .map((input) => input.normalized.exam_number)
      .filter((value): value is string => Boolean(value)),
  ))
  const phones = Array.from(new Set(
    prepared.map((input) => input.normalized.phone).filter(Boolean),
  ))
  const division = prepared[0]?.division

  const [currentStudents, examStudents, phoneStudents] = await Promise.all([
    listStudentsByIds(db, currentStudentIds, division),
    examNumbers.length === 0
      ? Promise.resolve([] as Student[])
      : (async () => {
        const rows = unwrapSupabaseResult(
          'studentProfiles.ensureBatch.examStudents',
          await db
            .from('students')
            .select('*')
            .eq('division', division)
            .in('exam_number', examNumbers),
        ) as Student[] | null

        return rows ?? []
      })(),
    phones.length === 0
      ? Promise.resolve([] as Student[])
      : (async () => {
        const rows = unwrapSupabaseResult(
          'studentProfiles.ensureBatch.phoneStudents',
          await db
            .from('students')
            .select('*')
            .eq('division', division)
            .in('phone', phones)
            .order('updated_at', { ascending: false })
            .order('id'),
        ) as Student[] | null

        return rows ?? []
      })(),
  ])

  const currentStudentsById = new Map(currentStudents.map((student) => [student.id, student]))
  const examStudentsByNumber = new Map<string, Student>()
  const phoneStudentsByPhone = new Map<string, Student[]>()

  for (const student of examStudents) {
    const examNumber = normalizeExamNumber(student.exam_number)
    if (examNumber && !examStudentsByNumber.has(examNumber)) {
      examStudentsByNumber.set(examNumber, student)
    }
  }

  for (const student of phoneStudents) {
    const phone = normalizePhone(student.phone)
    const candidates = phoneStudentsByPhone.get(phone) ?? []
    candidates.push(student)
    phoneStudentsByPhone.set(phone, candidates)
  }

  const matchedStudentsByKey = new Map<string, Student | null>()

  for (const input of prepared) {
    let matched = input.currentStudentId ? currentStudentsById.get(input.currentStudentId) ?? null : null

    if (!matched && input.normalized.exam_number) {
      matched = examStudentsByNumber.get(input.normalized.exam_number) ?? null
      if (matched) {
        assertStudentIdentityMatches(matched, input.normalized, 'exam_number')
      }
    }

    if (!matched) {
      matched = findMatchingStudentFromPhoneCandidates(
        phoneStudentsByPhone.get(input.normalized.phone),
        input.normalized,
      )
    }

    matchedStudentsByKey.set(input.key, matched)
  }

  const insertInputsByDedupKey = new Map<string, PreparedEnsureBatchInput>()
  const updateInputByStudentId = new Map<number, { student: Student; normalized: NormalizedStudentSnapshot }>()

  for (const input of prepared) {
    const matchedStudent = matchedStudentsByKey.get(input.key)

    if (!matchedStudent) {
      insertInputsByDedupKey.set(input.dedupKey, input)
      continue
    }

    await assertNoStudentIdentityCollision(db, input.division, input.normalized, matchedStudent)

    if (shouldUpdateStudent(matchedStudent, input.normalized)) {
      updateInputByStudentId.set(matchedStudent.id, {
        student: matchedStudent,
        normalized: input.normalized,
      })
    }
  }

  const nowIso = new Date().toISOString()
  const insertedStudentsByDedupKey = new Map<string, Student>()
  const updatedStudentsById = new Map<number, Student>()

  if (insertInputsByDedupKey.size > 0) {
    const rows = unwrapSupabaseResult(
      'studentProfiles.ensureBatch.insertStudents',
      await db
        .from('students')
        .insert(
          Array.from(insertInputsByDedupKey.values()).map((input) => ({
            division: input.division,
            name: input.normalized.name,
            phone: input.normalized.phone,
            exam_number: input.normalized.exam_number ?? null,
            cohort_option_id: input.normalized.cohort_option_id ?? null,
            birth_date: input.normalized.birth_date ?? null,
            photo_url: input.normalized.photo_url ?? null,
            updated_at: nowIso,
          })),
        )
        .select('*'),
    ) as Student[] | null

    for (const row of rows ?? []) {
      insertedStudentsByDedupKey.set(buildStudentIdentityKey(row), row)
    }
  }

  if (updateInputByStudentId.size > 0) {
    const rows = unwrapSupabaseResult(
      'studentProfiles.ensureBatch.updateStudents',
      await db
        .from('students')
        .upsert(
          Array.from(updateInputByStudentId.values()).map(({ student, normalized }) => (
            buildStudentUpsertPayload(student, {
              name: normalized.name,
              phone: normalized.phone,
              exam_number: normalized.exam_number !== undefined ? normalized.exam_number : student.exam_number,
              cohort_option_id: normalized.cohort_option_id !== undefined
                ? normalized.cohort_option_id
                : student.cohort_option_id,
              birth_date: normalized.birth_date !== undefined && normalized.birth_date !== null
                ? normalized.birth_date
                : student.birth_date,
              photo_url: normalized.photo_url !== undefined ? normalized.photo_url : student.photo_url,
              updated_at: nowIso,
            })
          )),
          { onConflict: 'id' },
        )
        .select('*'),
    ) as Student[] | null

    for (const row of rows ?? []) {
      updatedStudentsById.set(row.id, row)
    }
  }

  for (const input of prepared) {
    const matchedStudent = matchedStudentsByKey.get(input.key)

    if (matchedStudent) {
      results.set(input.key, {
        student: updatedStudentsById.get(matchedStudent.id) ?? matchedStudent,
        created: false,
        changed: updatedStudentsById.has(matchedStudent.id),
      })
      continue
    }

    const insertedStudent = insertedStudentsByDedupKey.get(input.dedupKey)
    if (!insertedStudent) {
      throw new Error('student_profiles.ensureStudentProfilesBatch: inserted student not found')
    }

    results.set(input.key, {
      student: insertedStudent,
      created: true,
      changed: true,
    })
  }

  return results
}

export async function syncStudentEnrollmentSnapshots(
  db: DbClient,
  studentOrId: number | Student,
  division?: TenantType,
) {
  const student = typeof studentOrId === 'number'
    ? (division ? await getStudentById(db, studentOrId, division) : null)
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

export async function syncStudentEnrollmentSnapshotsBatch(
  db: DbClient,
  studentsOrIds: Array<number | Student>,
) {
  if (studentsOrIds.length === 0) {
    return []
  }

  const studentIds = Array.from(new Set(
    studentsOrIds
      .map((studentOrId) => typeof studentOrId === 'number' ? studentOrId : studentOrId.id)
      .filter((value) => Number.isInteger(value) && value > 0),
  ))

  const providedStudents = new Map<number, Student>()
  const missingStudentIds: number[] = []

  for (const studentOrId of studentsOrIds) {
    if (typeof studentOrId === 'number') {
      missingStudentIds.push(studentOrId)
      continue
    }

    providedStudents.set(studentOrId.id, studentOrId)
  }

  if (missingStudentIds.length > 0) {
    const fetchedStudents = await listStudentsByIds(db, missingStudentIds)
    for (const student of fetchedStudents) {
      providedStudents.set(student.id, student)
    }
  }

  const students = studentIds
    .map((studentId) => providedStudents.get(studentId))
    .filter((student): student is Student => Boolean(student))

  if (students.length === 0) {
    return []
  }

  await Promise.all(students.map(async (student) => {
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
  }))

  return students
}

export async function getLatestStudentEnrollmentGender(
  db: DbClient,
  studentId: number | null | undefined,
  division?: TenantType,
) {
  if (!studentId) {
    return null
  }

  let query = db
    .from('enrollments')
    .select('gender,created_at,courses!inner(division)')
    .eq('student_id', studentId)
    .not('gender', 'is', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(10)

  if (division) {
    query = query.eq('courses.division', division)
  }

  const { data, error } = await query
  if (error) {
    throw error
  }

  for (const row of data ?? []) {
    const gender = normalizeGenderLabel(row.gender)
    if (gender) {
      return gender
    }
  }

  return null
}

export type StudentEnrollmentSharedDetailsInput = {
  gender?: string | null
  series_option_id?: number | null
  series_group?: Enrollment['series_group'] | null
  series?: string | null
  student_type?: Enrollment['student_type'] | null
}

export type StudentEnrollmentSharedDetailsScope =
  | { courseId: number }
  | { enrollmentId: number }

function buildStudentEnrollmentSharedDetailsPayload(details: StudentEnrollmentSharedDetailsInput) {
  const payload: Record<string, unknown> = {}

  if (hasOwnField(details, 'gender')) {
    payload.gender = normalizeGenderLabel(details.gender) || null
  }
  if (hasOwnField(details, 'series_option_id')) {
    payload.series_option_id = details.series_option_id ?? null
  }
  if (hasOwnField(details, 'series_group')) {
    payload.series_group = details.series_group ?? null
  }
  if (hasOwnField(details, 'series')) {
    payload.series = details.series?.trim() || null
  }
  if (hasOwnField(details, 'student_type') && details.student_type) {
    payload.student_type = details.student_type
  }

  return payload
}

export async function syncStudentEnrollmentSharedDetails(
  db: DbClient,
  studentId: number | null | undefined,
  details: StudentEnrollmentSharedDetailsInput,
  scope: StudentEnrollmentSharedDetailsScope,
) {
  if (!studentId) {
    return null
  }

  const payload = buildStudentEnrollmentSharedDetailsPayload(details)
  if (Object.keys(payload).length === 0) {
    return null
  }

  let query = db
    .from('enrollments')
    .update(payload)
    .eq('student_id', studentId)

  if ('courseId' in scope) {
    query = query.eq('course_id', scope.courseId)
  } else {
    query = query.eq('id', scope.enrollmentId)
  }

  const { error } = await query

  if (error) {
    throw error
  }

  return payload
}

export async function syncStudentEnrollmentSharedDetailsBatch(
  db: DbClient,
  entries: Array<{
    studentId: number | null | undefined
    details: StudentEnrollmentSharedDetailsInput
    scope: StudentEnrollmentSharedDetailsScope
  }>,
) {
  const detailsByScopedStudent = new Map<string, {
    studentId: number
    details: StudentEnrollmentSharedDetailsInput
    scope: StudentEnrollmentSharedDetailsScope
  }>()

  for (const entry of entries) {
    if (!entry.studentId) {
      continue
    }

    const payload = buildStudentEnrollmentSharedDetailsPayload(entry.details)
    if (Object.keys(payload).length === 0) {
      continue
    }

    const scopeKey = 'courseId' in entry.scope
      ? `course:${entry.scope.courseId}`
      : `enrollment:${entry.scope.enrollmentId}`
    const key = `${entry.studentId}:${scopeKey}`
    const current = detailsByScopedStudent.get(key)
    detailsByScopedStudent.set(key, {
      studentId: entry.studentId,
      scope: entry.scope,
      details: {
        ...(current?.details ?? {}),
        ...entry.details,
      },
    })
  }

  await Promise.all(Array.from(detailsByScopedStudent.values()).map(async (entry) => {
    await syncStudentEnrollmentSharedDetails(db, entry.studentId, entry.details, entry.scope)
  }))

  return detailsByScopedStudent
}

export async function syncStudentEnrollmentGenderSnapshots(
  db: DbClient,
  studentId: number | null | undefined,
  gender: string | null | undefined,
  scope: StudentEnrollmentSharedDetailsScope,
) {
  return syncStudentEnrollmentSharedDetails(db, studentId, { gender }, scope)
}

export async function syncStudentEnrollmentGenderSnapshotsBatch(
  db: DbClient,
  entries: Array<{
    studentId: number | null | undefined
    gender: string | null | undefined
    scope: StudentEnrollmentSharedDetailsScope
  }>,
) {
  return syncStudentEnrollmentSharedDetailsBatch(
    db,
    entries.map((entry) => ({
      studentId: entry.studentId,
      details: { gender: entry.gender },
      scope: entry.scope,
    })),
  )
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
  const mismatchFields = getEnrollmentStudentMismatchFields(enrollment, student)
  const compatible = mismatchFields.length === 0

  return {
    ...enrollment,
    student_id: enrollment.student_id ?? student.id,
    student_profile: {
      ...getStudentAuthProfile(student),
      identity_mismatch: !compatible,
      mismatch_fields: mismatchFields,
      profile_name: student.name,
      profile_phone: student.phone,
      profile_exam_number: student.exam_number,
      cohort_option_id: student.cohort_option_id ?? null,
      cohort_label: student.cohort_label ?? null,
    },
    name: enrollment.name || (compatible ? student.name : enrollment.name),
    phone: enrollment.phone || (compatible ? student.phone : enrollment.phone),
    exam_number: enrollment.exam_number ?? (compatible ? student.exam_number : enrollment.exam_number),
    cohort_option_id: student.cohort_option_id ?? null,
    cohort_label: student.cohort_label ?? null,
    photo_url: enrollment.photo_url ?? (compatible ? student.photo_url : enrollment.photo_url),
  }
}
