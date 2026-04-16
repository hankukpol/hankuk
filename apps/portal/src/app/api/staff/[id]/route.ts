import { NextResponse } from 'next/server'
import { requirePortalApiSuperAdmin } from '@/lib/portal-route-auth'
import { getStaffDetail } from '@/lib/staff-management'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalApiSuperAdmin()
  if (auth.response) {
    return auth.response
  }

  const { id } = await params

  try {
    const staff = await getStaffDetail(id)
    if (!staff) {
      return NextResponse.json({ error: '직원 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json(staff)
  } catch (error) {
    console.error('[portal-staff] failed to load staff detail.', error)
    return NextResponse.json({ error: '직원 정보를 불러오지 못했습니다.' }, { status: 500 })
  }
}
