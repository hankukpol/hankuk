import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateSuperAdminRequest } from '@/lib/auth/authenticate'
import {
  deleteOperatorAccount,
  getOperatorAccountWithMembershipsById,
  upsertOperatorAccount,
} from '@/lib/branch-ops'

const membershipSchema = z.object({
  role: z.enum(['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF']),
  branch_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional().nullable(),
  is_active: z.boolean().optional(),
})

const schema = z.object({
  login_id: z.string().min(1).max(50).optional(),
  display_name: z.string().min(1).max(80).optional(),
  shared_user_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
  memberships: z.array(membershipSchema).optional(),
})

function requiresPortalLinkedUser(memberships: Array<z.infer<typeof membershipSchema>>) {
  return memberships.some(
    (membership) => membership.role === 'SUPER_ADMIN' || membership.role === 'BRANCH_ADMIN',
  )
}

function getPortalLinkedUserError(
  sharedUserId: string | null | undefined,
  memberships: Array<z.infer<typeof membershipSchema>>,
) {
  if (!requiresPortalLinkedUser(memberships) || sharedUserId) {
    return null
  }

  return '슈퍼 관리자와 지점 관리자 계정은 포털 사용자 ID가 필요합니다.'
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { error } = await authenticateSuperAdminRequest(req)
  if (error) {
    return error
  }

  const { id } = await context.params
  const accountId = Number(id)
  const existing = await getOperatorAccountWithMembershipsById(accountId)
  if (!existing) {
    return NextResponse.json({ error: '운영자 계정을 찾을 수 없습니다.' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '운영자 계정 수정 정보가 올바르지 않습니다.' }, { status: 400 })
  }

  const memberships =
    parsed.data.memberships
    ?? existing.memberships.map((membership) => ({
      role: membership.role,
      branch_slug: membership.branch?.slug ?? null,
      is_active: membership.is_active,
    }))
  const sharedUserId =
    parsed.data.shared_user_id === undefined ? existing.shared_user_id : parsed.data.shared_user_id
  const portalLinkError = getPortalLinkedUserError(sharedUserId, memberships)
  if (portalLinkError) {
    return NextResponse.json({ error: portalLinkError }, { status: 400 })
  }

  const account = await upsertOperatorAccount({
    id: existing.id,
    login_id: parsed.data.login_id ?? existing.login_id,
    display_name: parsed.data.display_name ?? existing.display_name,
    shared_user_id: sharedUserId,
    is_active: parsed.data.is_active ?? existing.is_active,
    memberships,
  })

  return NextResponse.json({ account })
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { error } = await authenticateSuperAdminRequest(req)
  if (error) {
    return error
  }

  const { id } = await context.params
  const deleted = await deleteOperatorAccount(Number(id))
  if (!deleted) {
    return NextResponse.json({ error: '운영자 계정을 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
