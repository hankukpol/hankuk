'use client'

import { useEffect, useState } from 'react'
import {
  claimAdminSharedAuth,
  loadAdminClaimStatus,
  loadAdminId,
  loadAdminSessionStatus,
  saveAdminId,
  savePin,
  type AdminClaimStatus,
  type AdminSessionStatus,
} from '../_lib/config-client'
import ConfigPanel from './ConfigPanel'
import ConfigStatusMessage from './ConfigStatusMessage'

function getDivisionLabel(division: AdminClaimStatus['division']) {
  return division === 'fire' ? '소방' : '경찰'
}

function getClaimSummary(claimInfo: AdminClaimStatus | null) {
  if (!claimInfo) {
    return '현재 division의 공통 인증 연결 상태를 아직 불러오지 못했습니다.'
  }

  switch (claimInfo.reservationStatus) {
    case 'missing_admin_id':
      return '먼저 현재 division의 관리자 아이디를 저장해야 공통 인증 계정을 연결할 수 있습니다.'
    case 'missing_reservation':
      return '현재 관리자 아이디에 대한 공통 인증 예약이 없습니다. 관리자 아이디를 다시 저장한 뒤 다시 확인해 주세요.'
    case 'claimed':
      return claimInfo.claimedEmailMasked
        ? `이미 ${claimInfo.claimedEmailMasked} 계정에 연결되어 있습니다.`
        : '이미 공통 인증 계정에 연결되어 있습니다.'
    default:
      return '이 관리자 아이디는 아직 공통 인증 계정에 연결되지 않았습니다.'
  }
}

export default function AccessConfigManager() {
  const [adminId, setAdminId] = useState('')
  const [claimInfo, setClaimInfo] = useState<AdminClaimStatus | null>(null)
  const [sessionInfo, setSessionInfo] = useState<AdminSessionStatus | null>(null)
  const [claimEmail, setClaimEmail] = useState('')
  const [claimPassword, setClaimPassword] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingAdminId, setIsSavingAdminId] = useState(false)
  const [isSavingPin, setIsSavingPin] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [adminIdStatus, setAdminIdStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [pinStatus, setPinStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [claimStatus, setClaimStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [staffPin, setStaffPin] = useState('')
  const [staffPinConfirm, setStaffPinConfirm] = useState('')
  const [adminPin, setAdminPin] = useState('')
  const [adminPinConfirm, setAdminPinConfirm] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setAdminIdStatus(null)
      setClaimStatus(null)

      try {
        const [nextAdminId, nextClaimInfo, nextSessionInfo] = await Promise.all([
          loadAdminId(),
          loadAdminClaimStatus(),
          loadAdminSessionStatus(),
        ])

        if (!cancelled) {
          setAdminId(nextAdminId.id ?? '')
          setClaimInfo(nextClaimInfo)
          setSessionInfo(nextSessionInfo)
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : '관리자 인증 설정을 불러오지 못했습니다.'
          setAdminIdStatus({ tone: 'error', text: message })
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

    async function refreshClaimStatus() {
    const [nextClaimInfo, nextSessionInfo] = await Promise.all([
      loadAdminClaimStatus(),
      loadAdminSessionStatus(),
    ])
    setClaimInfo(nextClaimInfo)
    setSessionInfo(nextSessionInfo)
  }

  async function handleSaveAdminId() {
    setIsSavingAdminId(true)
    setAdminIdStatus(null)
    setClaimStatus(null)

    try {
      await saveAdminId({ id: adminId })
      await refreshClaimStatus()
      setAdminIdStatus({ tone: 'success', text: '관리자 아이디가 저장되었습니다.' })
    } catch (error) {
      setAdminIdStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : '관리자 아이디 저장에 실패했습니다.',
      })
    } finally {
      setIsSavingAdminId(false)
    }
  }

  async function handleChangePin(role: 'staff' | 'admin') {
    const pin = role === 'staff' ? staffPin : adminPin
    const confirmPin = role === 'staff' ? staffPinConfirm : adminPinConfirm

    if (pin.length < 4) {
      setPinStatus({ tone: 'error', text: 'PIN은 4자리 이상이어야 합니다.' })
      return
    }

    if (pin !== confirmPin) {
      setPinStatus({ tone: 'error', text: 'PIN 확인값이 일치하지 않습니다.' })
      return
    }

    setIsSavingPin(true)
    setPinStatus(null)

    try {
      await savePin(role, pin)
      setPinStatus({
        tone: 'success',
        text: `${role === 'staff' ? '직원' : '관리자'} PIN이 변경되었습니다.`,
      })

      if (role === 'staff') {
        setStaffPin('')
        setStaffPinConfirm('')
      } else {
        setAdminPin('')
        setAdminPinConfirm('')
      }
    } catch (error) {
      setPinStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'PIN 저장에 실패했습니다.',
      })
    } finally {
      setIsSavingPin(false)
    }
  }

  async function handleClaimSharedAuth() {
    if (!claimEmail.trim()) {
      setClaimStatus({ tone: 'error', text: '공통 인증에 사용할 이메일을 입력해 주세요.' })
      return
    }

    if (claimPassword.length < 6) {
      setClaimStatus({ tone: 'error', text: '비밀번호는 6자 이상이어야 합니다.' })
      return
    }

    setIsClaiming(true)
    setClaimStatus(null)

    try {
      const nextClaimInfo = await claimAdminSharedAuth({
        email: claimEmail,
        password: claimPassword,
      })

      setClaimInfo(nextClaimInfo)
      setClaimEmail('')
      setClaimPassword('')
      setClaimStatus({
        tone: 'success',
        text: '현재 관리자 아이디를 공통 인증 계정에 연결했습니다.',
      })
    } catch (error) {
      setClaimStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : '공통 인증 계정 연결에 실패했습니다.',
      })
    } finally {
      setIsClaiming(false)
    }
  }

  return (
    <ConfigPanel
      eyebrow="설정 / 접근"
      title="관리자 인증 정보"
      description="관리자 아이디, 직원 PIN, 관리자 PIN을 관리하고 공통 인증 계정과 연결합니다."
    >
      {adminIdStatus ? <ConfigStatusMessage text={adminIdStatus.text} tone={adminIdStatus.tone} /> : null}
      {claimStatus ? <ConfigStatusMessage text={claimStatus.text} tone={claimStatus.tone} /> : null}
      {pinStatus ? <ConfigStatusMessage text={pinStatus.text} tone={pinStatus.tone} /> : null}

      {isLoading ? (
        <p className="text-sm text-gray-500">관리자 인증 설정을 불러오는 중입니다...</p>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-gray-900">관리자 아이디</h3>
              <p className="text-sm leading-6 text-gray-500">
                현재 division에서 사용하는 관리자 아이디입니다. 비워 두면 PIN만으로 로그인합니다.
              </p>
            </div>

            <input
              type="text"
              value={adminId}
              onChange={(event) => setAdminId(event.target.value)}
              placeholder="아이디를 비우면 PIN만 사용"
              autoComplete="off"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
            />

            <button
              type="button"
              onClick={handleSaveAdminId}
              disabled={isSavingAdminId}
              className="rounded-xl bg-[#1a237e] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {isSavingAdminId ? '저장 중...' : '관리자 아이디 저장'}
            </button>
          </div>

          <div className="space-y-4 rounded-2xl border border-[#d8defd] bg-[#f6f8ff] p-5">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-gray-900">공통 인증 연결</h3>
              <p className="text-sm leading-6 text-gray-500">
                기존 관리자 PIN 로그인은 유지한 채, 현재 관리자 아이디를 hankuk 공통 인증 계정에 연결합니다.
              </p>
            </div>

            <div className="grid gap-3 rounded-2xl border border-white/70 bg-white p-4 text-sm text-gray-700 md:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">Division</p>
                <p className="mt-1 font-semibold text-gray-900">
                  {claimInfo ? getDivisionLabel(claimInfo.division) : '-'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">Admin ID</p>
                <p className="mt-1 font-semibold text-gray-900">{claimInfo?.adminId || '(미설정)'}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">Status</p>
                <p className="mt-1 font-semibold text-gray-900">{getClaimSummary(claimInfo)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/70 bg-white p-4 text-sm text-gray-700">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-gray-400">Current Session</p>
              <p className="mt-2 font-semibold text-gray-900">
                {sessionInfo?.sharedLinked
                  ? '현재 관리자 세션이 공통 인증 사용자와 연결되어 있습니다.'
                  : '현재 관리자 세션은 아직 공통 인증 사용자 정보를 싣고 있지 않습니다.'}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {sessionInfo?.sharedLinked
                  ? `division=${sessionInfo.division ?? '-'} / adminId=${sessionInfo.adminId || '(미설정)'}`
                  : '공통 인증 연결 직후에는 로그아웃 후 다시 로그인해야 세션에 반영됩니다.'}
              </p>
            </div>

            {claimInfo?.claimable ? (
              <div className="space-y-3 rounded-2xl border border-white/70 bg-white p-4">
                <p className="text-sm text-gray-600">
                  이미 만든 공통 계정이 있으면 해당 이메일과 비밀번호를 입력하고, 없으면 새 계정이 생성됩니다.
                </p>

                <input
                  type="email"
                  value={claimEmail}
                  onChange={(event) => setClaimEmail(event.target.value)}
                  placeholder="common auth 이메일"
                  autoComplete="email"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
                />

                <input
                  type="password"
                  value={claimPassword}
                  onChange={(event) => setClaimPassword(event.target.value)}
                  placeholder="비밀번호 (6자 이상)"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
                />

                <button
                  type="button"
                  onClick={handleClaimSharedAuth}
                  disabled={isClaiming}
                  className="rounded-xl bg-[#1a237e] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {isClaiming ? '연결 중...' : '공통 인증 계정 연결'}
                </button>
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-gray-900">직원 PIN</h3>
                <p className="text-sm text-gray-500">스태프와 배부 직원 로그인에 사용하는 기본 PIN입니다.</p>
              </div>

              <input
                type="password"
                value={staffPin}
                onChange={(event) => setStaffPin(event.target.value)}
                placeholder="새 PIN (4자리 이상)"
                inputMode="numeric"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
              />
              <input
                type="password"
                value={staffPinConfirm}
                onChange={(event) => setStaffPinConfirm(event.target.value)}
                placeholder="PIN 확인"
                inputMode="numeric"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
              />

              <button
                type="button"
                onClick={() => handleChangePin('staff')}
                disabled={isSavingPin}
                className="rounded-xl bg-[#1a237e] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                직원 PIN 저장
              </button>
            </div>

            <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-gray-900">관리자 PIN</h3>
                <p className="text-sm text-gray-500">관리자 로그인에 사용하는 PIN입니다.</p>
              </div>

              <input
                type="password"
                value={adminPin}
                onChange={(event) => setAdminPin(event.target.value)}
                placeholder="새 PIN (4자리 이상)"
                inputMode="numeric"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
              />
              <input
                type="password"
                value={adminPinConfirm}
                onChange={(event) => setAdminPinConfirm(event.target.value)}
                placeholder="PIN 확인"
                inputMode="numeric"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
              />

              <button
                type="button"
                onClick={() => handleChangePin('admin')}
                disabled={isSavingPin}
                className="rounded-xl bg-[#1a237e] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                관리자 PIN 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfigPanel>
  )
}
