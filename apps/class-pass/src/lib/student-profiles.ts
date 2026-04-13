import type { TenantType } from '@/lib/tenant'
import { normalizeBirthDate } from '@/lib/auth/student-auth'
import { generateStudentPin } from '@/lib/auth/pin'
import { createServerClient } from '@/lib/supabase/server'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
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

export type EnsureStudentProfileBatchInput = StudentProfileSnapshot & {
  key: string
  division: TenantType
  currentStudentId?: number | null
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

type NormalizedStudentSnapshot = {
  name: string
  phone: string
  exam_number?: string | null
  photo_url?: string | null
}

type PreparedEnsureBatchInput = EnsureStudentProfileBatchInput & {
  dedupKey: string
  normalized: NormalizedStudentSnapshot
}

function normalizeStudentSnapshot(snapshot: StudentProfileSnapshot): NormalizedStudentSnapshot {
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

function buildStudentIdentityKey(snapshot: StudentProfileSnapshot | Student | NormalizedStudentSnapshot) {
  const examNumber = normalizeExamNumber(snapshot.exam_number) || ''
  if (examNumber) {
    return `exam:${examNumber}`
  }

  return `phone:${normalizePhone(snapshot.phone)}::${normalizeName(snapshot.name)}`
}

function shouldUpdateStudent(
  student: Student,
  normalized: NormalizedStudentSnapshot,
) {
  return (
    student.name !== normalized.name
    || student.phone !== normalized.phone
    || (normalized.exam_number !== undefined && student.exam_number !== normalized.exam_number)
    || (normalized.photo_url !== undefined && student.photo_url !== normalized.photo_url)
  )
}

function buildStudentUpsertPayload(
  student: Student,
  overrides: Partial<Pick<Student, 'name' | 'phone' | 'exam_number' | 'birth_date' | 'pin_hash' | 'auth_method' | 'photo_url' | 'updated_at'>>,
) {
  return {
    id: student.id,
    division: student.division,
    name: overrides.name ?? student.name,
    phone: overrides.phone ?? student.phone,
    exam_number: overrides.exam_number ?? student.exam_number,
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
      .limit(1),
  ) as Student[] | null

  if ((exactNameRows?.length ?? 0) > 0) {
    return exactNameRows?.[0] ?? null
  }

  const fallbackRows = unwrapSupabaseResult(
    'studentProfiles.findStudentByPhone.fallback',
    await db
      .from('students')
      .select('*')
      .eq('division', division)
      .eq('phone', phone)
      .order('updated_at', { ascending: false })
      .order('id')
      .limit(2),
  ) as Student[] | null

  if ((fallbackRows?.length ?? 0) === 1) {
    return fallbackRows?.[0] ?? null
  }

  return null
}

function findMatchingStudentFromPhoneCandidates(
  candidates: Student[] | undefined,
  name: string,
) {
  if (!candidates || candidates.length === 0) {
    return null
  }

  const matchedByName = candidates.find((row) => normalizeName(row.name) === name)
  if (matchedByName) {
    return matchedByName
  }

  if (candidates.length === 1) {
    return candidates[0] ?? null
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

  if (!shouldUpdateStudent(student, normalized)) {
    return {
      student,
      created: false,
      changed: false,
    }
  }

  const updatedStudent = await updateStudentRecord(db, student.id, {
    name: normalized.name,
    phone: normalized.phone,
    exam_number: normalized.exam_number !== undefined ? normalized.exam_number : student.exam_number,
    photo_url: normalized.photo_url !== undefined ? normalized.photo_url : student.photo_url,
    updated_at: timestamp,
  })

  return {
    student: updatedStudent,
    created: false,
    changed: true,
  }
}

export async function ensureStudentProfilesBatch(
  db: DbClient,
  inputs: EnsureStudentProfileBatchInput[],
) {
  const results = new Map<string, EnsureStudentProfileResult>()

  if (inputs.length === 0) {
    return results
  }

  const prepared = inputs.map((input): PreparedEnsureBatchInput => ({
    ...input,
    normalized: normalizeStudentSnapshot(input),
    dedupKey: buildStudentIdentityKey(input),
  }))

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
    const matched = (
      (input.currentStudentId ? currentStudentsById.get(input.currentStudentId) : null)
      ?? (input.normalized.exam_number ? examStudentsByNumber.get(input.normalized.exam_number) : null)
      ?? findMatchingStudentFromPhoneCandidates(phoneStudentsByPhone.get(input.normalized.phone), input.normalized.name)
      ?? null
    )

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

  const studentMap = new Map(students.map((student) => [student.id, student]))
  const rows = unwrapSupabaseResult(
    'studentProfiles.syncEnrollmentSnapshotsBatch.selectEnrollments',
    await db
      .from('enrollments')
      .select('id,course_id,student_id,status,gender,region,series,memo,refunded_at,custom_data')
      .in('student_id', students.map((student) => student.id)),
  ) as Array<
    Pick<Enrollment, 'id' | 'course_id' | 'student_id' | 'status' | 'gender' | 'region' | 'series' | 'memo' | 'refunded_at' | 'custom_data'>
  > | null

  const payloads = (rows ?? [])
    .map((row) => {
      const student = row.student_id ? studentMap.get(row.student_id) : null
      if (!student) {
        return null
      }

      return {
        id: row.id,
        course_id: row.course_id,
        student_id: student.id,
        name: student.name,
        phone: student.phone,
        exam_number: student.exam_number,
        gender: row.gender,
        region: row.region,
        series: row.series,
        status: row.status,
        photo_url: student.photo_url,
        memo: row.memo,
        refunded_at: row.refunded_at,
        custom_data: row.custom_data ?? {},
      }
    })
    .filter((value): value is {
      id: number
      course_id: number
      student_id: number
      name: string
      phone: string
      exam_number: string | null
      gender: string | null
      region: string | null
      series: string | null
      status: Enrollment['status']
      photo_url: string | null
      memo: string | null
      refunded_at: string | null
      custom_data: Record<string, string>
    } => Boolean(value))

  if (payloads.length === 0) {
    return students
  }

  unwrapSupabaseResult(
    'studentProfiles.syncEnrollmentSnapshotsBatch.upsertEnrollments',
    await db
      .from('enrollments')
      .upsert(payloads, { onConflict: 'id' }),
  )

  return students
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
