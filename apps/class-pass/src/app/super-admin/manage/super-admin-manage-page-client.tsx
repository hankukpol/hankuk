'use client'

import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'

type Branch = {
  id: number
  slug: string
  name: string
  track_type: 'police' | 'fire'
  description: string
  admin_title: string
  series_label: string
  region_label: string
  app_name: string
  theme_color: string
  is_active: boolean
  display_order: number
}

type OperatorMembership = {
  id: number
  role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'STAFF'
  branch?: { slug: string; name: string } | null
  is_active: boolean
}

type OperatorAccount = {
  id: number
  login_id: string
  display_name: string
  shared_user_id: string | null
  is_active: boolean
  memberships: OperatorMembership[]
}

function membershipsToText(account: OperatorAccount) {
  return account.memberships
    .map((membership) => {
      if (membership.role === 'SUPER_ADMIN') {
        return 'SUPER_ADMIN'
      }
      return `${membership.role}:${membership.branch?.slug ?? ''}`
    })
    .join('\n')
}

function parseMemberships(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line === 'SUPER_ADMIN') {
        return { role: 'SUPER_ADMIN' as const }
      }

      const [role, branchSlug] = line.split(':')
      return {
        role: role as 'BRANCH_ADMIN' | 'STAFF',
        branch_slug: branchSlug?.trim() || null,
      }
    })
}

export default function SuperAdminManagePageClient({
  initialBranches,
  initialAccounts,
  initialError = '',
  initialLoaded = true,
}: {
  initialBranches: Branch[]
  initialAccounts: OperatorAccount[]
  initialError?: string
  initialLoaded?: boolean
}) {
  const [branches, setBranches] = useState<Branch[]>(initialBranches)
  const [accounts, setAccounts] = useState<OperatorAccount[]>(initialAccounts)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(initialError)
  const [loading, setLoading] = useState(false)
  const [branchForm, setBranchForm] = useState({
    slug: '',
    name: '',
    track_type: 'police' as 'police' | 'fire',
    description: '',
    admin_title: '',
    series_label: '',
    region_label: '',
    app_name: '',
    theme_color: '#1A237E',
  })
  const [accountForm, setAccountForm] = useState({
    login_id: '',
    display_name: '',
    shared_user_id: '',
    pin: '',
    memberships: initialBranches[0] ? `BRANCH_ADMIN:${initialBranches[0].slug}` : 'SUPER_ADMIN',
  })

  async function loadAll() {
    setLoading(true)
    setError('')

    const [branchesResponse, accountsResponse] = await Promise.all([
      fetch('/api/super-admin/branches', { cache: 'no-store' }),
      fetch('/api/super-admin/operator-accounts', { cache: 'no-store' }),
    ])

    const branchesPayload = await branchesResponse.json().catch(() => null)
    const accountsPayload = await accountsResponse.json().catch(() => null)

    if (!branchesResponse.ok) {
      setError(branchesPayload?.error ?? '지점 목록을 불러오지 못했습니다.')
      setLoading(false)
      return
    }

    if (!accountsResponse.ok) {
      setError(accountsPayload?.error ?? '운영자 계정 목록을 불러오지 못했습니다.')
      setLoading(false)
      return
    }

    setBranches(branchesPayload?.branches ?? [])
    setAccounts(accountsPayload?.accounts ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (initialLoaded) {
      return
    }

    void loadAll()
  }, [initialLoaded])

  const branchSlugOptions = useMemo(
    () => branches.map((branch) => branch.slug).join(', '),
    [branches],
  )

  async function handleBranchCreate(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')

    const response = await fetch('/api/super-admin/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(branchForm),
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      setError(payload?.error ?? '지점을 저장하지 못했습니다.')
      return
    }

    setBranchForm({
      slug: '',
      name: '',
      track_type: 'police',
      description: '',
      admin_title: '',
      series_label: '',
      region_label: '',
      app_name: '',
      theme_color: '#1A237E',
    })
    setMessage('지점을 저장했습니다.')
    await loadAll()
  }

  async function handleAccountCreate(event: FormEvent) {
    event.preventDefault()
    setError('')
    setMessage('')

    const response = await fetch('/api/super-admin/operator-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...accountForm,
        shared_user_id: accountForm.shared_user_id.trim() || null,
        pin: accountForm.pin.trim() || undefined,
        memberships: parseMemberships(accountForm.memberships),
      }),
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      setError(payload?.error ?? '운영자 계정을 저장하지 못했습니다.')
      return
    }

    setAccountForm({
      login_id: '',
      display_name: '',
      shared_user_id: '',
      pin: '',
      memberships: branches[0] ? `BRANCH_ADMIN:${branches[0].slug}` : 'SUPER_ADMIN',
    })
    setMessage('운영자 계정을 저장했습니다.')
    await loadAll()
  }

  async function handleLogout() {
    await fetch('/api/auth/super-admin/logout', { method: 'POST' })
    window.location.href = '/super-admin/login'
  }

  if (loading) {
    return <div className="p-8 text-sm text-[#86868b]">불러오는 중...</div>
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-[#1d1d1f]">지점 / 운영자 관리</h2>
          <p className="mt-2 text-sm text-[#86868b]">
            기존 지점 구조를 그대로 유지하면서 포털 연동과 운영자 계정 관리를 한 화면에서 정리합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="rounded-[8px] border border-[#d2d2d7] px-4 py-2 text-sm font-semibold text-[#1d1d1f] hover:bg-[#f5f5f7]"
        >
          로그아웃
        </button>
      </div>

      {(message || error) && (
        <div className="rounded-[8px] bg-white px-5 py-4">
          {message ? <p className="text-sm text-[#1b7a1b]">{message}</p> : null}
          {error ? <p className="text-sm text-[#ff3b30]">{error}</p> : null}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[12px] bg-white p-6">
          <h3 className="text-lg font-bold text-[#1d1d1f]">지점 생성</h3>
          <form onSubmit={handleBranchCreate} className="mt-4 grid gap-3">
            <input
              value={branchForm.slug}
              onChange={(event) =>
                setBranchForm((current) => ({ ...current, slug: event.target.value }))
              }
              placeholder="slug 예: gangnam-police"
              className="rounded-[8px] border border-[#d2d2d7] px-4 py-3 text-sm outline-none focus:border-[#86868b]"
            />
            <input
              value={branchForm.name}
              onChange={(event) =>
                setBranchForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="지점명"
              className="rounded-[8px] border border-[#d2d2d7] px-4 py-3 text-sm outline-none focus:border-[#86868b]"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={branchForm.track_type}
                onChange={(event) =>
                  setBranchForm((current) => ({
                    ...current,
                    track_type: event.target.value as 'police' | 'fire',
                  }))
                }
                className="rounded-[8px] border border-[#d2d2d7] px-4 py-3 text-sm outline-none focus:border-[#86868b]"
              >
                <option value="police">경찰</option>
                <option value="fire">소방</option>
              </select>
              <input
                value={branchForm.theme_color}
                onChange={(event) =>
                  setBranchForm((current) => ({ ...current, theme_color: event.target.value }))
                }
                placeholder="#1A237E"
                className="rounded-[8px] border border-[#d2d2d7] px-4 py-3 text-sm outline-none focus:border-[#86868b]"
              />
            </div>
            <input
              value={branchForm.app_name}
              onChange={(event) =>
                setBranchForm((current) => ({ ...current, app_name: event.target.value }))
              }
              placeholder="앱 이름"
              className="rounded-[8px] border border-[#d2d2d7] px-4 py-3 text-sm outline-none focus:border-[#86868b]"
            />
            <input
              value={branchForm.admin_title}
              onChange={(event) =>
                setBranchForm((current) => ({ ...current, admin_title: event.target.value }))
              }
              placeholder="관리자 타이틀"
              className="rounded-[8px] border border-[#d2d2d7] px-4 py-3 text-sm outline-none focus:border-[#86868b]"
            />
            <textarea
              value={branchForm.description}
              onChange={(event) =>
                setBranchForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="지점 설명"
              rows={3}
              className="rounded-[8px] border border-[#d2d2d7] px-4 py-3 text-sm outline-none focus:border-[#86868b]"
            />
            <button
              type="submit"
              className="rounded-[8px] bg-[#1d1d1f] px-5 py-3 text-sm font-bold text-white"
            >
              지점 저장
            </button>
          </form>
        </section>

        <section className="rounded-[12px] bg-white p-6">
          <h3 className="text-lg font-bold text-[#1d1d1f]">운영자 계정 생성</h3>
          <p className="mt-2 text-xs leading-5 text-[#86868b]">
            멤버십 입력 형식: <code>SUPER_ADMIN</code> 또는{' '}
            <code>BRANCH_ADMIN:지점-slug</code>, <code>STAFF:지점-slug</code>
          </p>
          <p className="mt-1 text-[11px] text-[#86868b]">
            현재 지점 slug: {branchSlugOptions || '아직 없음'}
          </p>
          <form onSubmit={handleAccountCreate} className="mt-4 grid gap-3">
            <input
              value={accountForm.login_id}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, login_id: event.target.value }))
              }
              placeholder="로그인 ID"
              className="rounded-[8px] border border-[#d2d2d7] px-4 py-3 text-sm outline-none focus:border-[#86868b]"
            />
            <input
              value={accountForm.display_name}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, display_name: event.target.value }))
              }
              placeholder="표시 이름"
              className="rounded-[8px] border border-[#d2d2d7] px-4 py-3 text-sm outline-none focus:border-[#86868b]"
            />
            <input
              value={accountForm.shared_user_id}
              onChange={(event) =>
                setAccountForm((current) => ({
                  ...current,
                  shared_user_id: event.target.value,
                }))
              }
              placeholder="Supabase shared user id (선택)"
              className="rounded-[8px] border border-[#d2d2d7] px-4 py-3 text-sm outline-none focus:border-[#86868b]"
            />
            <input
              value={accountForm.pin}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, pin: event.target.value }))
              }
              placeholder="로컬 비상 로그인 PIN (선택)"
              className="rounded-[8px] border border-[#d2d2d7] px-4 py-3 text-sm outline-none focus:border-[#86868b]"
            />
            <textarea
              value={accountForm.memberships}
              onChange={(event) =>
                setAccountForm((current) => ({ ...current, memberships: event.target.value }))
              }
              rows={4}
              className="rounded-[8px] border border-[#d2d2d7] px-4 py-3 text-sm outline-none focus:border-[#86868b]"
            />
            <button
              type="submit"
              className="rounded-[8px] bg-[#1d1d1f] px-5 py-3 text-sm font-bold text-white"
            >
              운영자 계정 저장
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-[12px] bg-white p-6">
        <h3 className="text-lg font-bold text-[#1d1d1f]">지점 목록</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {branches.map((branch) => (
            <div key={branch.id} className="rounded-[8px] border border-[#d2d2d7] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#1d1d1f]">{branch.name}</p>
                  <p className="mt-1 text-xs text-[#86868b]">
                    {branch.slug} / {branch.track_type === 'fire' ? '소방' : '경찰'}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    branch.is_active
                      ? 'bg-[#f5f5f7] text-[#1b7a1b]'
                      : 'bg-[#f5f5f7] text-[#86868b]'
                  }`}
                >
                  {branch.is_active ? '운영중' : '비활성'}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#1d1d1f]">{branch.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[12px] bg-white p-6">
        <h3 className="text-lg font-bold text-[#1d1d1f]">운영자 계정 목록</h3>
        <div className="mt-4 grid gap-3">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-[8px] border border-[#d2d2d7] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-[#1d1d1f]">{account.display_name}</span>
                <span className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[11px] font-semibold text-[#1d1d1f]">
                  {account.login_id}
                </span>
                {account.shared_user_id ? (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                    포털 연동
                  </span>
                ) : (
                  <span className="rounded-full bg-[#f5f5f7] px-2.5 py-1 text-[11px] font-semibold text-[#86868b]">
                    로컬 전용
                  </span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {account.memberships.map((membership) => (
                  <span
                    key={membership.id}
                    className="rounded-full bg-[#f5f5f7] px-3 py-1 text-xs font-semibold text-[#1d1d1f]"
                  >
                    {membership.role}
                    {membership.branch?.slug ? ` / ${membership.branch.slug}` : ''}
                  </span>
                ))}
              </div>
              <p className="mt-3 whitespace-pre-line text-xs text-[#86868b]">
                {membershipsToText(account)}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
