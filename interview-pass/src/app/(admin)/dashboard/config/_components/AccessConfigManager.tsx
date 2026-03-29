'use client'

import { useEffect, useState } from 'react'
import { loadAdminId, saveAdminId, savePin } from '../_lib/config-client'
import ConfigPanel from './ConfigPanel'
import ConfigStatusMessage from './ConfigStatusMessage'

export default function AccessConfigManager() {
  const [adminId, setAdminId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingAdminId, setIsSavingAdminId] = useState(false)
  const [isSavingPin, setIsSavingPin] = useState(false)
  const [adminIdStatus, setAdminIdStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [pinStatus, setPinStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [staffPin, setStaffPin] = useState('')
  const [staffPinConfirm, setStaffPinConfirm] = useState('')
  const [adminPin, setAdminPin] = useState('')
  const [adminPinConfirm, setAdminPinConfirm] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setAdminIdStatus(null)

      try {
        const nextAdminId = await loadAdminId()
        if (!cancelled) {
          setAdminId(nextAdminId.id ?? '')
        }
      } catch (error) {
        if (!cancelled) {
          setAdminIdStatus({
            tone: 'error',
            text: error instanceof Error ? error.message : '관리자 아이디를 불러오지 못했습니다.',
          })
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

  async function handleSaveAdminId() {
    setIsSavingAdminId(true)
    setAdminIdStatus(null)

    try {
      await saveAdminId({ id: adminId })
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

  return (
    <ConfigPanel
      eyebrow="설정 / 접근"
      title="관리자 접근 정보"
      description="관리자 아이디, 직원 PIN, 관리자 PIN을 분리해서 설정합니다. 이 값들은 관리자와 직원 인증에서 직접 사용됩니다."
    >
      {adminIdStatus ? <ConfigStatusMessage text={adminIdStatus.text} tone={adminIdStatus.tone} /> : null}
      {pinStatus ? <ConfigStatusMessage text={pinStatus.text} tone={pinStatus.tone} /> : null}

      {isLoading ? (
        <p className="text-sm text-gray-500">관리자 접근 설정을 불러오는 중입니다...</p>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-gray-900">관리자 아이디</h3>
              <p className="text-sm leading-6 text-gray-500">
                아이디를 비워 두면 PIN만으로 로그인하고, 값을 채우면 아이디와 PIN을 함께 요구합니다.
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

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-gray-900">직원 PIN</h3>
                <p className="text-sm text-gray-500">스캔과 배부 직원 로그인에 사용하는 기본 PIN입니다.</p>
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
