import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import { syncStudentEnrollmentSnapshots } from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizeExamNumber, parsePositiveInt } from '@/lib/utils'

const MAX_FILE_SIZE = 2 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const BUCKET = 'enrollment-photos'

function createStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase environment variables are not configured.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Fetch enrollment with division check in a single query */
async function getVerifiedEnrollment(db: ReturnType<typeof createServerClient>, enrollmentId: number, division: string) {
  const { data } = await db
    .from('enrollments')
    .select('id,student_id,exam_number,course_id,courses!inner(id)')
    .eq('id', enrollmentId)
    .eq('courses.division', division)
    .maybeSingle()
  return data as { id: number; student_id: number | null; exam_number: string | null; course_id: number } | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) return authError

  const { id } = await params
  const enrollmentId = parsePositiveInt(id)
  if (!enrollmentId) {
    return NextResponse.json({ error: '잘못된 수강생 ID입니다.' }, { status: 400 })
  }

  const formData = await req.formData().catch(() => null)
  const file = formData?.get('photo')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: '사진 파일이 필요합니다.' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'JPEG, PNG, WebP 형식만 허용됩니다.' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: '파일 크기는 2MB 이하여야 합니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const db = createServerClient()
  const enrollment = await getVerifiedEnrollment(db, enrollmentId, division)
  if (!enrollment) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  const studentId = enrollment.student_id ?? enrollmentId
  const examNumber = normalizeExamNumber(enrollment.exam_number)
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const storagePath = examNumber
    ? `by-exam/${examNumber}.${ext}`
    : `by-student/${studentId}.${ext}`

  const storage = createStorageClient()
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await storage.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: '사진 업로드에 실패했습니다.' }, { status: 500 })
  }

  const { data: urlData } = storage.storage.from(BUCKET).getPublicUrl(storagePath)
  const photoUrl = `${urlData.publicUrl}?t=${Date.now()}`

  if (enrollment.student_id) {
    const { error: studentUpdateError } = await db
      .from('students')
      .update({ photo_url: photoUrl, updated_at: new Date().toISOString() })
      .eq('id', enrollment.student_id)

    if (studentUpdateError) {
      return NextResponse.json({ error: '사진 URL 저장에 실패했습니다.' }, { status: 500 })
    }

    await syncStudentEnrollmentSnapshots(db, enrollment.student_id)
  } else {
    const { error: updateError } = await db
      .from('enrollments')
      .update({ photo_url: photoUrl })
      .eq('id', enrollmentId)

    if (updateError) {
      return NextResponse.json({ error: '사진 URL 저장에 실패했습니다.' }, { status: 500 })
    }
  }

  await invalidateCache('enrollments')
  return NextResponse.json({ photo_url: photoUrl })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) return authError

  const { id } = await params
  const enrollmentId = parsePositiveInt(id)
  if (!enrollmentId) {
    return NextResponse.json({ error: '잘못된 수강생 ID입니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const db = createServerClient()
  const enrollment = await getVerifiedEnrollment(db, enrollmentId, division)
  if (!enrollment) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  const studentId = enrollment.student_id ?? enrollmentId
  const examNumber = normalizeExamNumber(enrollment.exam_number)
  const storage = createStorageClient()

  if (examNumber) {
    for (const ext of ['jpg', 'png', 'webp']) {
      await storage.storage.from(BUCKET).remove([`by-exam/${examNumber}.${ext}`])
    }
  } else {
    for (const ext of ['jpg', 'png', 'webp']) {
      await storage.storage.from(BUCKET).remove([`by-student/${studentId}.${ext}`])
    }
  }

  if (enrollment.student_id) {
    const { error: studentUpdateError } = await db
      .from('students')
      .update({ photo_url: null, updated_at: new Date().toISOString() })
      .eq('id', enrollment.student_id)

    if (studentUpdateError) {
      return NextResponse.json({ error: '사진 삭제에 실패했습니다.' }, { status: 500 })
    }

    await syncStudentEnrollmentSnapshots(db, enrollment.student_id)
  } else {
    const { error: updateError } = await db
      .from('enrollments')
      .update({ photo_url: null })
      .eq('id', enrollmentId)

    if (updateError) {
      return NextResponse.json({ error: '사진 삭제에 실패했습니다.' }, { status: 500 })
    }
  }

  await invalidateCache('enrollments')
  return NextResponse.json({ success: true })
}
