import { NextRequest, NextResponse } from 'next/server'
import { handleRouteError } from '@/lib/api/error-response'
import { hashPin } from '@/lib/auth/pin'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import {
  createStaffAccount,
  deleteStaffAccount,
  listStaffAccounts,
  StaffAccountConflictError,
  StaffAccountNotFoundError,
  StaffAccountsChangedError,
  updateStaffAccount,
} from '@/lib/staff-accounts'

function staffAccountMutationErrorResponse(error: unknown) {
  if (error instanceof StaffAccountConflictError) {
    return NextResponse.json({ error: '같은 이름의 직원 계정이 이미 있습니다. 다른 이름을 사용해 주세요.' }, { status: 409 })
  }

  if (error instanceof StaffAccountNotFoundError) {
    return NextResponse.json({ error: '직원 계정을 찾을 수 없습니다. 목록을 새로고침해 주세요.' }, { status: 404 })
  }

  if (error instanceof StaffAccountsChangedError) {
    return NextResponse.json({ error: '직원 계정이 다른 곳에서 변경되었습니다. 목록을 새로고침한 뒤 다시 시도해 주세요.' }, { status: 409 })
  }

  return null
}

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const accounts = await listStaffAccounts()
    return NextResponse.json({ accounts })
  } catch (error) {
    return handleRouteError('staffAccounts.GET', 'Failed to load staff accounts.', error)
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
      return NextResponse.json({ error: 'PIN은 4자리 이상 입력해 주세요.' }, { status: 400 })
    }

    const account = await createStaffAccount({
      name,
      pinHash: await hashPin(pin),
    })

    return NextResponse.json({ account })
  } catch (error) {
    const response = staffAccountMutationErrorResponse(error)
    if (response) return response

    return handleRouteError('staffAccounts.POST', 'Failed to create staff account.', error)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const body = await req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id.trim() : ''
    const name = (body?.name ?? '').trim()
    const pin = (body?.pin ?? '').trim()

    if (!id) {
      return NextResponse.json({ error: '직원 계정을 선택해 주세요.' }, { status: 400 })
    }

    if (pin && pin.length < 4) {
      return NextResponse.json({ error: 'PIN은 4자리 이상 입력해 주세요.' }, { status: 400 })
    }

    const account = await updateStaffAccount({
      id,
      name: name || undefined,
      pinHash: pin ? await hashPin(pin) : undefined,
    })

    return NextResponse.json({ account })
  } catch (error) {
    const response = staffAccountMutationErrorResponse(error)
    if (response) return response

    return handleRouteError('staffAccounts.PATCH', 'Failed to update staff account.', error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const body = await req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id.trim() : ''

    if (!id) {
      return NextResponse.json({ error: '직원 계정을 선택해 주세요.' }, { status: 400 })
    }

    await deleteStaffAccount(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    const response = staffAccountMutationErrorResponse(error)
    if (response) return response

    return handleRouteError('staffAccounts.DELETE', 'Failed to delete staff account.', error)
  }
}
