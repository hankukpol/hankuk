'use client'

import type { AppConfigSnapshot } from '@/lib/app-config.shared'

export type AppConfigResponse = AppConfigSnapshot
export type AppConfigPayload = Partial<AppConfigResponse>

export type PopupContent = {
  popup_key: string
  title: string
  body: string
  is_active: boolean
}

export type AdminIdPayload = {
  id: string
}

export type AdminClaimReservationStatus =
  | 'missing_admin_id'
  | 'missing_reservation'
  | 'reserved'
  | 'claimed'

export type AdminClaimStatus = {
  division: 'police' | 'fire'
  adminId: string
  reservationStatus: AdminClaimReservationStatus
  claimable: boolean
  claimedEmailMasked: string | null
}

export type AdminClaimPayload = {
  email: string
  password: string
}

export type AdminSessionStatus = {
  role: 'admin'
  division: 'police' | 'fire' | null
  adminId: string
  sharedLinked: boolean
  sharedUserId: string | null
}

export type StaffAccountStatus = 'active' | 'inactive'
export type StaffClaimReservationStatus = 'missing_reservation' | 'reserved' | 'claimed'

export type StaffAccountSummary = {
  id: string
  division: 'police' | 'fire'
  loginId: string
  displayName: string
  status: StaffAccountStatus
  note: string
  sharedUserId: string | null
  sharedLinked: boolean
  reservationStatus: StaffClaimReservationStatus
  claimable: boolean
  claimedEmailMasked: string | null
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export type StaffAccountCreatePayload = {
  loginId: string
  displayName: string
  pin: string
  note?: string
}

export type StaffAccountUpdatePayload = {
  loginId?: string
  displayName?: string
  pin?: string
  note?: string
  status?: StaffAccountStatus
}

export type StaffAccountClaimPayload = {
  email: string
  password: string
}

export type StaffSessionStatus = {
  role: 'staff' | 'admin'
  division: 'police' | 'fire' | null
  authMethod: 'legacy_staff_pin' | 'staff_account' | 'staff_shared' | 'admin_pin' | 'admin_shared' | null
  adminId: string
  staffAccountId: string | null
  staffLoginId: string
  staffName: string
  sharedLinked: boolean
  sharedUserId: string | null
}

type ApiErrorPayload = {
  error?: string
  message?: string
}

async function readJson<T>(response: Response, fallbackError: string): Promise<T> {
  const data = (await response.json().catch(() => null)) as (T & ApiErrorPayload) | null

  if (!response.ok) {
    throw new Error(data?.error ?? data?.message ?? fallbackError)
  }

  return (data ?? {}) as T
}

export async function loadAppConfig(): Promise<AppConfigResponse> {
  const response = await fetch('/api/config/app', { method: 'GET', cache: 'no-store' })
  return readJson<AppConfigResponse>(response, '앱 설정을 불러오지 못했습니다.')
}

export async function saveAppConfig(payload: AppConfigPayload): Promise<void> {
  const response = await fetch('/api/config/app', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  await readJson<{ success?: boolean }>(response, '앱 설정 저장에 실패했습니다.')
}

export async function loadPopupConfigs(): Promise<PopupContent[]> {
  const response = await fetch('/api/config/popups', { method: 'GET', cache: 'no-store' })
  return readJson<PopupContent[]>(response, '팝업 설정을 불러오지 못했습니다.')
}

export async function savePopupConfig(payload: PopupContent): Promise<PopupContent> {
  const response = await fetch('/api/config/popups', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return readJson<PopupContent>(response, '팝업 설정 저장에 실패했습니다.')
}

export async function loadAdminId(): Promise<AdminIdPayload> {
  const response = await fetch('/api/auth/admin/id', { method: 'GET', cache: 'no-store' })
  return readJson<AdminIdPayload>(response, '관리자 아이디를 불러오지 못했습니다.')
}

export async function saveAdminId(payload: AdminIdPayload): Promise<void> {
  const response = await fetch('/api/auth/admin/id', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  await readJson<{ ok?: boolean }>(response, '관리자 아이디 저장에 실패했습니다.')
}

export async function savePin(role: 'staff' | 'admin', pin: string): Promise<void> {
  const response = await fetch(`/api/auth/${role}/pin`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  })

  await readJson<{ ok?: boolean }>(response, 'PIN 저장에 실패했습니다.')
}

export async function loadAdminClaimStatus(): Promise<AdminClaimStatus> {
  const response = await fetch('/api/auth/admin/claim', { method: 'GET', cache: 'no-store' })
  return readJson<AdminClaimStatus>(response, '공통 인증 연결 상태를 불러오지 못했습니다.')
}

export async function claimAdminSharedAuth(payload: AdminClaimPayload): Promise<AdminClaimStatus> {
  const response = await fetch('/api/auth/admin/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  return readJson<AdminClaimStatus>(response, '공통 인증 계정을 연결하지 못했습니다.')
}

export async function loadAdminSessionStatus(): Promise<AdminSessionStatus> {
  const response = await fetch('/api/auth/admin/session', { method: 'GET', cache: 'no-store' })
  return readJson<AdminSessionStatus>(response, '현재 관리자 세션 상태를 불러오지 못했습니다.')
}

export async function loadStaffAccounts(): Promise<StaffAccountSummary[]> {
  const response = await fetch('/api/auth/staff/accounts', { method: 'GET', cache: 'no-store' })
  const payload = await readJson<{ accounts?: StaffAccountSummary[] }>(
    response,
    '직원 계정 목록을 불러오지 못했습니다.',
  )
  return payload.accounts ?? []
}

export async function createStaffAccount(payload: StaffAccountCreatePayload): Promise<StaffAccountSummary> {
  const response = await fetch('/api/auth/staff/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readJson<{ account: StaffAccountSummary }>(
    response,
    '직원 계정을 만들지 못했습니다.',
  )
  return data.account
}

export async function updateStaffAccount(
  accountId: string,
  payload: StaffAccountUpdatePayload,
): Promise<StaffAccountSummary> {
  const response = await fetch(`/api/auth/staff/accounts/${accountId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readJson<{ account: StaffAccountSummary }>(
    response,
    '직원 계정을 수정하지 못했습니다.',
  )
  return data.account
}

export async function claimStaffAccountSharedAuth(
  accountId: string,
  payload: StaffAccountClaimPayload,
): Promise<StaffAccountSummary> {
  const response = await fetch(`/api/auth/staff/accounts/${accountId}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await readJson<{ account: StaffAccountSummary }>(
    response,
    '직원 공통 인증 계정을 연결하지 못했습니다.',
  )
  return data.account
}

export async function loadStaffSessionStatus(): Promise<StaffSessionStatus> {
  const response = await fetch('/api/auth/staff/session', { method: 'GET', cache: 'no-store' })
  return readJson<StaffSessionStatus>(response, '현재 직원 세션 상태를 불러오지 못했습니다.')
}

export async function invalidateConfigCache(): Promise<{ message?: string }> {
  const response = await fetch('/api/config/cache/invalidate', { method: 'POST' })
  return readJson<{ message?: string }>(response, '캐시 초기화에 실패했습니다.')
}
