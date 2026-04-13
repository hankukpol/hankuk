import { NextRequest, NextResponse } from 'next/server'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import { listPopupsByDivision, type PopupRow } from '@/lib/popups'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const division = await getServerTenantType()
    return NextResponse.json({ popups: await listPopupsByDivision(division) })
  } catch (error) {
    return handleRouteError('popups.GET', '팝업 목록을 불러오지 못했습니다.', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const division = await getServerTenantType()
    const db = createServerClient()
    const body = await req.json().catch(() => null)

    const type = (body?.type ?? '').trim()
    const title = (body?.title ?? '').trim() || null
    const content = (body?.content ?? '').trim() || null
    const is_active = body?.is_active !== false

    if (!type) {
      return NextResponse.json({ error: '팝업 유형을 입력해 주세요.' }, { status: 400 })
    }

    const { data, error } = await db
      .from('popup_content')
      .insert({
        division,
        type,
        title,
        content,
        is_active,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: '팝업을 생성하지 못했습니다.' }, { status: 500 })
    }

    await invalidateCache('popups')
    return NextResponse.json({ popup: data as PopupRow })
  } catch (error) {
    return handleRouteError('popups.POST', '팝업을 생성하지 못했습니다.', error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const division = await getServerTenantType()
    const db = createServerClient()
    const body = await req.json().catch(() => null)

    const id = body?.id as number | undefined
    if (!id) {
      return NextResponse.json({ error: '팝업 ID가 필요합니다.' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (body.title !== undefined) updates.title = body.title || null
    if (body.content !== undefined) updates.content = body.content || null
    if (body.type !== undefined) updates.type = body.type
    if (body.is_active !== undefined) updates.is_active = body.is_active

    const { data, error } = await db
      .from('popup_content')
      .update(updates)
      .eq('id', id)
      .eq('division', division)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: '팝업을 수정하지 못했습니다.' }, { status: 500 })
    }

    await invalidateCache('popups')
    return NextResponse.json({ popup: data as PopupRow })
  } catch (error) {
    return handleRouteError('popups.PATCH', '팝업을 수정하지 못했습니다.', error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const division = await getServerTenantType()
    const db = createServerClient()
    const body = await req.json().catch(() => null)

    const id = body?.id as number | undefined
    if (!id) {
      return NextResponse.json({ error: '팝업 ID가 필요합니다.' }, { status: 400 })
    }

    const result = await db
      .from('popup_content')
      .delete()
      .eq('id', id)
      .eq('division', division)

    if (result.error) {
      return NextResponse.json({ error: '팝업을 삭제하지 못했습니다.' }, { status: 500 })
    }

    await invalidateCache('popups')
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError('popups.DELETE', '팝업을 삭제하지 못했습니다.', error)
  }
}
