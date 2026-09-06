import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import type { TenantType } from '@/lib/tenant'
import { parsePositiveInt } from '@/lib/utils'

const MAX_FILE_SIZE = 2 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const BUCKET = 'enrollment-photos'

function createStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase environment variables are not configured.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

type PhotoOwner = {
  id: number
  student_id: number | null
  course_id: number
  photo_url: string | null
}

async function getVerifiedEnrollment(db: ReturnType<typeof createServerClient>, enrollmentId: number, division: string) {
  const { data } = await db
    .from('enrollments')
    .select('id,student_id,course_id,photo_url,courses!inner(id)')
    .eq('id', enrollmentId)
    .eq('courses.division', division)
    .maybeSingle()
  const enrollment = data as PhotoOwner | null
  if (!enrollment?.student_id) return enrollment

  // A stale enrollment snapshot is not the owner of a shared student photo.
  const { data: student } = await db.from('students')
    .select('id,photo_url').eq('id', enrollment.student_id).eq('division', division).maybeSingle()
  if (!student) return null
  return { ...enrollment, photo_url: student.photo_url as string | null }
}

function photoPrefix(owner: PhotoOwner, division: string) {
  return `${encodeURIComponent(division)}/${owner.student_id ? `students/${owner.student_id}` : `enrollments/${owner.id}`}/`
}

function ownedStoragePath(owner: PhotoOwner, division: string) {
  if (!owner.photo_url) return null
  try {
    const url = new URL(owner.photo_url)
    const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin
    const prefix = `/storage/v1/object/public/${BUCKET}/`
    if (url.origin !== origin || !url.pathname.startsWith(prefix)) return null
    const path = url.pathname.slice(prefix.length)
    const ownerPrefix = photoPrefix(owner, division)
    if (!path.startsWith(ownerPrefix)) return null
    const filename = path.slice(ownerPrefix.length)
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(filename) ? path : null
  } catch {
    return null
  }
}

async function savePhotoReference(db: ReturnType<typeof createServerClient>, owner: PhotoOwner, division: TenantType, photoUrl: string | null) {
  const { data, error } = await db.rpc('set_enrollment_photo_atomic', {
    p_division: division,
    p_enrollment_id: owner.id,
    p_student_id: owner.student_id,
    p_expected_photo_url: owner.photo_url,
    p_photo_url: photoUrl,
  })
  if (error?.code === 'CP002') return NextResponse.json({ error: '사진 정보가 변경되었습니다. 새로고침 후 다시 시도해 주세요.' }, { status: 409 })
  if (error?.code === 'P0002') return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  if (error || !data?.success || data.photo_url !== photoUrl) {
    return NextResponse.json({ error: '사진 정보 저장 결과를 확인하지 못했습니다. 새로고침 후 확인해 주세요.' }, { status: 500 })
  }
  return null
}

async function removeOwnedPhoto(storage: ReturnType<typeof createStorageClient>, path: string | null) {
  if (!path) return true
  try {
    const { error } = await storage.storage.from(BUCKET).remove([path])
    return !error
  } catch {
    return false
  }
}

async function refreshPhotoCache() {
  try {
    await invalidateCache('enrollments')
    return true
  } catch {
    return false
  }
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

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const storagePath = `${photoPrefix(enrollment, division)}${randomUUID()}.${ext}`

  const storage = createStorageClient()
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await storage.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: '사진 업로드에 실패했습니다.' }, { status: 500 })
  }

  const { data: urlData } = storage.storage.from(BUCKET).getPublicUrl(storagePath)
  const photoUrl = urlData.publicUrl
  const saveError = await savePhotoReference(db, enrollment, division, photoUrl)
  if (saveError) {
    // A transport error can hide a committed update. Only a confirmed conflict
    // proves that this request's immutable object is not referenced.
    if (saveError.status === 409) await removeOwnedPhoto(storage, storagePath)
    return saveError
  }

  const cleaned = await removeOwnedPhoto(storage, ownedStoragePath(enrollment, division))
  const refreshed = await refreshPhotoCache()
  return NextResponse.json({ photo_url: photoUrl, ...(!cleaned || !refreshed ? { warning: '사진은 저장됐지만 일부 화면 갱신 또는 이전 파일 정리가 지연되었습니다.' } : {}) })
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

  const saveError = await savePhotoReference(db, enrollment, division, null)
  if (saveError) return saveError

  // Never delete legacy by-exam/by-student files: ownership may be shared or ambiguous.
  const path = ownedStoragePath(enrollment, division)
  const cleaned = path ? await removeOwnedPhoto(createStorageClient(), path) : true
  const refreshed = await refreshPhotoCache()
  return NextResponse.json({ success: true, ...(!cleaned || !refreshed ? { warning: '사진 연결은 해제됐지만 일부 화면 갱신 또는 파일 정리가 지연되었습니다.' } : {}) })
}
