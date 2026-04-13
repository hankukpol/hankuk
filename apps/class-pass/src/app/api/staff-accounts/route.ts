import { NextRequest, NextResponse } from 'next/server'
import { hashPin } from '@/lib/auth/pin'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { handleRouteError } from '@/lib/api/error-response'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

type StaffAccount = {
  id: string
  name: string
  pin_hash: string
  created_at: string
}

async function getStaffAccountsKey() {
  const division = await getServerTenantType()
  return `${division}::staff_accounts`
}

async function loadStaffAccounts(): Promise<StaffAccount[]> {
  const db = createServerClient()
  const key = await getStaffAccountsKey()
  const data = unwrapSupabaseResult(
    'staffAccounts.load',
    await db
      .from('app_config')
      .select('value')
      .eq('key', key)
      .maybeSingle(),
  ) as { value?: string | null } | null

  if (!data?.value) {
    return []
  }

  try {
    return JSON.parse(data.value) as StaffAccount[]
  } catch {
    return []
  }
}

async function saveStaffAccounts(accounts: StaffAccount[]) {
  const db = createServerClient()
  const key = await getStaffAccountsKey()
  unwrapSupabaseResult(
    'staffAccounts.save',
    await db.from('app_config').upsert({
      key,
      value: JSON.stringify(accounts),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' }),
  )
}

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const accounts = await loadStaffAccounts()
    const safeAccounts = accounts.map((account) => ({
      id: account.id,
      name: account.name,
      created_at: account.created_at,
    }))

    return NextResponse.json({ accounts: safeAccounts })
  } catch (error) {
    return handleRouteError('staffAccounts.GET', '직원 계정을 불러오지 못했습니다.', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const body = await req.json().catch(() => null)
    const name = (body?.name ?? '').trim()
    const pin = (body?.pin ?? '').trim()

    if (!name || !pin) {
      return NextResponse.json({ error: '이름과 PIN을 입력해주세요.' }, { status: 400 })
    }

    if (pin.length < 4) {
      return NextResponse.json({ error: 'PIN은 최소 4자리 이상이어야 합니다.' }, { status: 400 })
    }

    const accounts = await loadStaffAccounts()

    if (accounts.some((account) => account.name === name)) {
      return NextResponse.json({ error: '이미 같은 이름의 직원이 있습니다.' }, { status: 409 })
    }

    const newAccount: StaffAccount = {
      id: crypto.randomUUID(),
      name,
      pin_hash: await hashPin(pin),
      created_at: new Date().toISOString(),
    }

    accounts.push(newAccount)
    await saveStaffAccounts(accounts)

    return NextResponse.json({
      account: { id: newAccount.id, name: newAccount.name, created_at: newAccount.created_at },
    })
  } catch (error) {
    return handleRouteError('staffAccounts.POST', '직원 계정을 생성하지 못했습니다.', error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const body = await req.json().catch(() => null)
    const id = body?.id as string | undefined
    const name = (body?.name ?? '').trim()
    const pin = (body?.pin ?? '').trim()

    if (!id) {
      return NextResponse.json({ error: '직원 ID가 필요합니다.' }, { status: 400 })
    }

    const accounts = await loadStaffAccounts()
    const index = accounts.findIndex((account) => account.id === id)

    if (index === -1) {
      return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (name) {
      accounts[index].name = name
    }

    if (pin) {
      if (pin.length < 4) {
        return NextResponse.json({ error: 'PIN은 최소 4자리 이상이어야 합니다.' }, { status: 400 })
      }

      accounts[index].pin_hash = await hashPin(pin)
    }

    await saveStaffAccounts(accounts)

    return NextResponse.json({
      account: { id: accounts[index].id, name: accounts[index].name, created_at: accounts[index].created_at },
    })
  } catch (error) {
    return handleRouteError('staffAccounts.PATCH', '직원 계정을 수정하지 못했습니다.', error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const body = await req.json().catch(() => null)
    const id = body?.id as string | undefined

    if (!id) {
      return NextResponse.json({ error: '직원 ID가 필요합니다.' }, { status: 400 })
    }

    const accounts = await loadStaffAccounts()
    const filtered = accounts.filter((account) => account.id !== id)

    if (filtered.length === accounts.length) {
      return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 })
    }

    await saveStaffAccounts(filtered)
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError('staffAccounts.DELETE', '직원 계정을 삭제하지 못했습니다.', error)
  }
}
