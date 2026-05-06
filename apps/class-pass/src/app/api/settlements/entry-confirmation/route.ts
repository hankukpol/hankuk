import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { getPaymentServiceMessage, getPaymentServiceStatus } from '@/lib/payments/service'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import type { StaffJwtPayload } from '@/types/database'
import type { SettlementEntryConfirmation } from '@/lib/payments/types'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const schema = z.object({
  date: dateSchema,
  kind: z.enum(['payment', 'refund']),
  paymentId: z.number().int().positive(),
  refundId: z.number().int().positive().optional().nullable(),
  action: z.enum(['confirm', 'cancel']),
})

type ServerClient = ReturnType<typeof createServerClient>

function createSettlementEntryError(message: string, status = 400) {
  const error = new Error(message) as Error & { status?: number }
  error.status = status
  return error
}

function getActorStaffId(payload: StaffJwtPayload | null) {
  return payload?.accountId ?? payload?.membershipId ?? null
}

async function loadPaymentForDivision(db: ServerClient, paymentId: number, division: string) {
  const { data, error } = await db
    .from('enrollment_payments')
    .select('id,paid_date,courses!inner(division)')
    .eq('id', paymentId)
    .eq('courses.division', division)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data as { id: number; paid_date: string } | null
}

function buildPatch(action: 'confirm' | 'cancel', actorStaffId: number) {
  const nowIso = new Date().toISOString()

  if (action === 'confirm') {
    return {
      status: 'confirmed',
      confirmed_at: nowIso,
      confirmed_by_staff_id: actorStaffId,
      canceled_at: null,
      canceled_by_staff_id: null,
    }
  }

  return {
    status: 'canceled',
    canceled_at: nowIso,
    canceled_by_staff_id: actorStaffId,
  }
}

function toEntryPayload(row: SettlementEntryConfirmation) {
  return row
}

function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === '23505'
}

async function upsertPaymentConfirmation(input: {
  db: ServerClient
  division: string
  paymentId: number
  settlementDate: string
  actorStaffId: number
}) {
  const patch = buildPatch('confirm', input.actorStaffId)
  const { data: existing, error: existingError } = await input.db
    .from('settlement_entry_confirmations')
    .select('*')
    .eq('entry_kind', 'payment')
    .eq('payment_id', input.paymentId)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing) {
    const { data, error } = await input.db
      .from('settlement_entry_confirmations')
      .update({
        ...patch,
        division: input.division,
        settlement_date: input.settlementDate,
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return data as SettlementEntryConfirmation
  }

  const { data, error } = await input.db
    .from('settlement_entry_confirmations')
    .insert({
      division: input.division,
      entry_kind: 'payment',
      payment_id: input.paymentId,
      refund_id: null,
      settlement_date: input.settlementDate,
      ...patch,
    })
    .select('*')
    .single()

  if (error) {
    if (isUniqueViolation(error)) {
      const retry = await input.db
        .from('settlement_entry_confirmations')
        .update({
          ...patch,
          division: input.division,
          settlement_date: input.settlementDate,
        })
        .eq('entry_kind', 'payment')
        .eq('payment_id', input.paymentId)
        .select('*')
        .single()

      if (retry.error) {
        throw retry.error
      }

      return retry.data as SettlementEntryConfirmation
    }

    throw error
  }

  return data as SettlementEntryConfirmation
}

async function upsertRefundConfirmation(input: {
  db: ServerClient
  division: string
  paymentId: number
  refundId: number
  settlementDate: string
  actorStaffId: number
}) {
  const patch = buildPatch('confirm', input.actorStaffId)
  const { data: existing, error: existingError } = await input.db
    .from('settlement_entry_confirmations')
    .select('*')
    .eq('entry_kind', 'refund')
    .eq('refund_id', input.refundId)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing) {
    const { data, error } = await input.db
      .from('settlement_entry_confirmations')
      .update({
        ...patch,
        division: input.division,
        payment_id: input.paymentId,
        settlement_date: input.settlementDate,
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (error) {
      throw error
    }

    return data as SettlementEntryConfirmation
  }

  const { data, error } = await input.db
    .from('settlement_entry_confirmations')
    .insert({
      division: input.division,
      entry_kind: 'refund',
      payment_id: input.paymentId,
      refund_id: input.refundId,
      settlement_date: input.settlementDate,
      ...patch,
    })
    .select('*')
    .single()

  if (error) {
    if (isUniqueViolation(error)) {
      const retry = await input.db
        .from('settlement_entry_confirmations')
        .update({
          ...patch,
          division: input.division,
          payment_id: input.paymentId,
          settlement_date: input.settlementDate,
        })
        .eq('entry_kind', 'refund')
        .eq('refund_id', input.refundId)
        .select('*')
        .single()

      if (retry.error) {
        throw retry.error
      }

      return retry.data as SettlementEntryConfirmation
    }

    throw error
  }

  return data as SettlementEntryConfirmation
}

async function cancelConfirmation(input: {
  db: ServerClient
  kind: 'payment' | 'refund'
  paymentId: number
  refundId: number | null
  actorStaffId: number
}) {
  let query = input.db
    .from('settlement_entry_confirmations')
    .update(buildPatch('cancel', input.actorStaffId))
    .eq('entry_kind', input.kind)

  query = input.kind === 'payment'
    ? query.eq('payment_id', input.paymentId)
    : query.eq('payment_id', input.paymentId).eq('refund_id', input.refundId)

  const { data, error } = await query
    .select('*')
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    throw createSettlementEntryError('취소할 정산 확인 기록을 찾을 수 없습니다.', 404)
  }

  return data as SettlementEntryConfirmation
}

export async function POST(req: NextRequest) {
  const auth = await authenticateAdminRequest(req)
  if (auth.error) {
    return auth.error
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '정산 행 확인 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  if (parsed.data.kind === 'refund' && !parsed.data.refundId) {
    return NextResponse.json({ error: '정산 행 확인 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const actorStaffId = getActorStaffId(auth.payload)
  if (!actorStaffId) {
    return NextResponse.json({ error: '정산 확인자를 확인하지 못했습니다. 관리자 계정으로 다시 로그인해 주세요.' }, { status: 400 })
  }

  try {
    const division = await getServerTenantType()
    const db = createServerClient()
    const payment = await loadPaymentForDivision(db, parsed.data.paymentId, division)
    if (!payment) {
      throw createSettlementEntryError('정산 행의 결제 정보를 찾을 수 없습니다.', 404)
    }

    if (parsed.data.kind === 'payment') {
      if (payment.paid_date !== parsed.data.date) {
        throw createSettlementEntryError('조회 중인 정산일과 결제일이 일치하지 않습니다.', 409)
      }

      const confirmation = parsed.data.action === 'confirm'
        ? await upsertPaymentConfirmation({
          db,
          division,
          paymentId: parsed.data.paymentId,
          settlementDate: parsed.data.date,
          actorStaffId,
        })
        : await cancelConfirmation({
          db,
          kind: 'payment',
          paymentId: parsed.data.paymentId,
          refundId: null,
          actorStaffId,
        })

      return NextResponse.json({
        kind: 'payment',
        paymentId: parsed.data.paymentId,
        refundId: null,
        entry: toEntryPayload(confirmation),
      })
    }

    const { data: refund, error: refundLoadError } = await db
      .from('enrollment_refunds')
      .select('id,payment_id,refund_date')
      .eq('id', parsed.data.refundId)
      .maybeSingle()

    if (refundLoadError) {
      throw refundLoadError
    }

    if (!refund || Number(refund.payment_id) !== parsed.data.paymentId) {
      throw createSettlementEntryError('정산 행의 환불 정보를 찾을 수 없습니다.', 404)
    }

    if (String(refund.refund_date) !== parsed.data.date) {
      throw createSettlementEntryError('조회 중인 정산일과 환불일이 일치하지 않습니다.', 409)
    }

    const confirmation = parsed.data.action === 'confirm'
      ? await upsertRefundConfirmation({
        db,
        division,
        paymentId: parsed.data.paymentId,
        refundId: parsed.data.refundId!,
        settlementDate: parsed.data.date,
        actorStaffId,
      })
      : await cancelConfirmation({
        db,
        kind: 'refund',
        paymentId: parsed.data.paymentId,
        refundId: parsed.data.refundId!,
        actorStaffId,
      })

    return NextResponse.json({
      kind: 'refund',
      paymentId: parsed.data.paymentId,
      refundId: parsed.data.refundId,
      entry: toEntryPayload(confirmation),
    })
  } catch (error) {
    return NextResponse.json(
      { error: getPaymentServiceMessage(error, '정산 행 확인 상태를 저장하지 못했습니다.') },
      { status: getPaymentServiceStatus(error) },
    )
  }
}
