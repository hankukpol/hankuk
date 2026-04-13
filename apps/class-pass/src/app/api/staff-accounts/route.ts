import { NextRequest, NextResponse } from 'next/server'
import { hashPin } from '@/lib/auth/pin'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { handleRouteError } from '@/lib/api/error-response'
import {
  listStaffAccounts,
  loadStoredStaffAccounts,
  saveStoredStaffAccounts,
  type StoredStaffAccount,
} from '@/lib/staff-accounts'

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const accounts = await listStaffAccounts()
    return NextResponse.json({ accounts })
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
      return NextResponse.json({ error: '이름과 PIN을 입력해 주세요.' }, { status: 400 })
    }

    if (pin.length < 4) {
      return NextResponse.json({ error: 'PIN은 최소 4자리 이상이어야 합니다.' }, { status: 400 })
    }

    const accounts = await loadStoredStaffAccounts()

    if (accounts.some((account) => account.name === name)) {
      return NextResponse.json({ error: '이미 같은 이름의 직원이 있습니다.' }, { status: 409 })
    }

    const newAccount: StoredStaffAccount = {
      id: crypto.randomUUID(),
      name,
      pin_hash: await hashPin(pin),
      created_at: new Date().toISOString(),
    }

    accounts.push(newAccount)
    await saveStoredStaffAccounts(accounts)

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

    const accounts = await loadStoredStaffAccounts()
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

    await saveStoredStaffAccounts(accounts)

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

    const accounts = await loadStoredStaffAccounts()
    const filtered = accounts.filter((account) => account.id !== id)

    if (filtered.length === accounts.length) {
      return NextResponse.json({ error: '직원을 찾을 수 없습니다.' }, { status: 404 })
    }

    await saveStoredStaffAccounts(filtered)
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError('staffAccounts.DELETE', '직원 계정을 삭제하지 못했습니다.', error)
  }
}
