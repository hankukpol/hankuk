'use client'

import { useEffect, useState } from 'react'
import {
  createStaffAccount,
  loadStaffAccounts,
  updateStaffAccount,
  type StaffAccountSummary,
} from '../_lib/config-client'
import ConfigStatusMessage from './ConfigStatusMessage'

function formatDateTime(value: string | null) {
  if (!value) {
    return '아직 로그인 기록 없음'
  }

  return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
}

function StaffAccountRow(props: {
  account: StaffAccountSummary
  onUpdated: (account: StaffAccountSummary) => void
}) {
  const { account, onUpdated } = props
  const [loginId, setLoginId] = useState(account.loginId)
  const [displayName, setDisplayName] = useState(account.displayName)
  const [note, setNote] = useState(account.note)
  const [status, setStatus] = useState(account.status)
  const [nextPin, setNextPin] = useState('')
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSave() {
    setIsSaving(true)
    setMessage(null)

    try {
      const updated = await updateStaffAccount(account.id, {
        loginId,
        displayName,
        note,
        status,
        pin: nextPin || undefined,
      })
      onUpdated(updated)
      setNextPin('')
      setMessage({ tone: 'success', text: '직원 계정이 저장되었습니다.' })
    } catch (error) {
      setMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : '직원 계정을 저장하지 못했습니다.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
      {message ? <ConfigStatusMessage text={message.text} tone={message.tone} /> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">로그인 ID</p>
          <input
            type="text"
            value={loginId}
            onChange={(event) => setLoginId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
          />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">표시 이름</p>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
          />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">상태</p>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as 'active' | 'inactive')}
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
          >
            <option value="active">활성</option>
            <option value="inactive">비활성</option>
          </select>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">새 PIN</p>
          <input
            type="password"
            value={nextPin}
            onChange={(event) => setNextPin(event.target.value)}
            placeholder="변경 시에만 입력"
            className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">메모</p>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
        />
      </div>

      <div className="grid gap-3 text-sm text-gray-500 md:grid-cols-3">
        <p>최근 로그인: {formatDateTime(account.lastLoginAt)}</p>
        <p>Shared Auth: {account.sharedUserId ? '연결됨' : '미연결'}</p>
        <p>생성 시각: {formatDateTime(account.createdAt)}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-xl bg-[#1a237e] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSaving ? '저장 중...' : '계정 저장'}
        </button>
        <button
          type="button"
          onClick={() => setStatus(status === 'active' ? 'inactive' : 'active')}
          className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700"
        >
          {status === 'active' ? '비활성으로 변경' : '활성으로 변경'}
        </button>
      </div>
    </div>
  )
}

export default function StaffAccountManager() {
  const [accounts, setAccounts] = useState<StaffAccountSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [loginId, setLoginId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [pin, setPin] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setStatus(null)

      try {
        const nextAccounts = await loadStaffAccounts()
        if (!cancelled) {
          setAccounts(nextAccounts)
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            tone: 'error',
            text: error instanceof Error ? error.message : '직원 계정 목록을 불러오지 못했습니다.',
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

  async function handleCreate() {
    if (!loginId.trim() || !displayName.trim() || pin.length < 4) {
      setStatus({ tone: 'error', text: '로그인 ID, 표시 이름, 4자리 이상 PIN을 입력해 주세요.' })
      return
    }

    setIsCreating(true)
    setStatus(null)

    try {
      const created = await createStaffAccount({
        loginId,
        displayName,
        pin,
        note,
      })
      setAccounts((current) => [...current, created].sort((a, b) => a.displayName.localeCompare(b.displayName)))
      setLoginId('')
      setDisplayName('')
      setPin('')
      setNote('')
      setStatus({ tone: 'success', text: '직원 계정을 추가했습니다.' })
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : '직원 계정을 만들지 못했습니다.',
      })
    } finally {
      setIsCreating(false)
    }
  }

  function handleUpdated(updated: StaffAccountSummary) {
    setAccounts((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-gray-900">직원 Operator 계정</h3>
        <p className="text-sm leading-6 text-gray-500">
          공용 직원 PIN 외에 사람 단위 계정을 발급할 수 있습니다. 스캔/빠른 배부 로그에는 이 이름이 그대로 남습니다.
        </p>
      </div>

      {status ? <ConfigStatusMessage text={status.text} tone={status.tone} /> : null}

      <div className="grid gap-3 rounded-2xl border border-white/80 bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
        <input
          type="text"
          value={loginId}
          onChange={(event) => setLoginId(event.target.value)}
          placeholder="로그인 ID"
          className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
        />
        <input
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="표시 이름"
          className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
        />
        <input
          type="password"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          placeholder="초기 PIN"
          className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
        />
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="메모 (선택)"
          className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={handleCreate}
        disabled={isCreating}
        className="rounded-xl bg-[#1a237e] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {isCreating ? '계정 생성 중...' : '직원 계정 추가'}
      </button>

      {isLoading ? (
        <p className="text-sm text-gray-500">직원 계정 목록을 불러오는 중입니다...</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-gray-500">아직 등록된 직원 계정이 없습니다.</p>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <StaffAccountRow
              key={account.id}
              account={account}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}
    </div>
  )
}
