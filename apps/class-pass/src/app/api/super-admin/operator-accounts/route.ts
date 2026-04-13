import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateSuperAdminRequest } from '@/lib/auth/authenticate'
import { listOperatorAccounts, upsertOperatorAccount } from '@/lib/branch-ops'

const membershipSchema = z.object({
  role: z.enum(['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF']),
  branch_slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional().nullable(),
  is_active: z.boolean().optional(),
})

const schema = z.object({
  login_id: z.string().min(1).max(50),
  display_name: z.string().min(1).max(80),
  pin: z.string().min(4).max(20).optional(),
  shared_user_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
  memberships: z.array(membershipSchema).min(1),
})

export async function GET(req: NextRequest) {
  const { error } = await authenticateSuperAdminRequest(req)
  if (error) {
    return error
  }

  const accounts = await listOperatorAccounts()
  return NextResponse.json({ accounts })
}

export async function POST(req: NextRequest) {
  const { error } = await authenticateSuperAdminRequest(req)
  if (error) {
    return error
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '운영자 계정 정보가 올바르지 않습니다.' }, { status: 400 })
  }

  const account = await upsertOperatorAccount(parsed.data)
  return NextResponse.json({ account }, { status: 201 })
}
