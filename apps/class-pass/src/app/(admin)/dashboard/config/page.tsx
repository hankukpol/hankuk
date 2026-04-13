'use client'

import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import {
  APP_CONFIG_DEFAULTS,
  APP_FEATURE_GROUPS,
  APP_FEATURE_KEYS,
  APP_FEATURE_META,
  type AppConfigSnapshot,
  type AppFeatureKey,
} from '@/lib/app-config.shared'
import { withTenantPrefix } from '@/lib/tenant'

const TRACK_OPTIONS = [
  { value: 'police', label: '경찰' },
  { value: 'fire', label: '소방' },
] as const

const FEATURE_GROUP_ITEMS = APP_FEATURE_GROUPS.map((group) => ({
  ...group,
  keys: APP_FEATURE_KEYS.filter((key) => APP_FEATURE_META[key].scope === group.scope),
}))

function buildInitialConfig(tenant: ReturnType<typeof useTenantConfig>): AppConfigSnapshot {
  return {
    ...APP_CONFIG_DEFAULTS,
    branch_name: tenant.branchName,
    branch_track_type: tenant.trackType,
    branch_description: tenant.defaultDescription,
    branch_admin_title: tenant.adminTitle,
    branch_series_label: tenant.labels.series,
    branch_region_label: tenant.labels.region,
    app_name: tenant.defaultAppName,
    theme_color: tenant.defaultThemeColor,
  }
}

export default function ConfigPage() {
  const tenant = useTenantConfig()
  const [config, setConfig] = useState<AppConfigSnapshot>(() => buildInitialConfig(tenant))
  const [adminId, setAdminId] = useState('')
  const [adminPin, setAdminPin] = useState('')
  const [staffPin, setStaffPin] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    Promise.all([
      fetch(withTenantPrefix('/api/config/app', tenant.type)).then((response) => response.json()),
      fetch(withTenantPrefix('/api/auth/admin/id', tenant.type), { cache: 'no-store' }).then((response) => response.json()),
    ])
      .then(([appConfig, admin]) => {
        if (cancelled) {
          return
        }

        setConfig((current) => ({ ...current, ...appConfig }))
        setAdminId(admin.id ?? '')
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [tenant.type])

  function resetFeedback() {
    setMessage('')
    setError('')
  }

  function updateConfig<K extends keyof AppConfigSnapshot>(key: K, value: AppConfigSnapshot[K]) {
    setConfig((current) => ({ ...current, [key]: value }))
  }

  function updateFeature(key: AppFeatureKey, checked: boolean) {
    updateConfig(key, checked)
  }

  async function saveConfig(event: FormEvent) {
    event.preventDefault()
    resetFeedback()

    const response = await fetch(withTenantPrefix('/api/config/app', tenant.type), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    const payload = await response.json().catch(() => null)

    if (response.ok) {
      setMessage('지점 설정을 저장했습니다.')
      return
    }

    setError(payload?.error ?? '지점 설정을 저장하지 못했습니다.')
  }

  async function saveAdminIdentity(event: FormEvent) {
    event.preventDefault()
    resetFeedback()

    const response = await fetch(withTenantPrefix('/api/auth/admin/id', tenant.type), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: adminId }),
    })
    const payload = await response.json().catch(() => null)

    if (response.ok) {
      setMessage('관리자 아이디를 저장했습니다.')
      return
    }

    setError(payload?.error ?? '관리자 아이디를 저장하지 못했습니다.')
  }

  async function savePins(event: FormEvent) {
    event.preventDefault()
    resetFeedback()

    const requests: Promise<Response>[] = []

    if (adminPin) {
      requests.push(
        fetch(withTenantPrefix('/api/auth/admin/pin', tenant.type), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: adminPin }),
        }),
      )
    }

    if (staffPin) {
      requests.push(
        fetch(withTenantPrefix('/api/auth/staff/pin', tenant.type), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: staffPin }),
        }),
      )
    }

    if (requests.length === 0) {
      setError('변경할 PIN을 입력해 주세요.')
      return
    }

    const responses = await Promise.all(requests)
    if (responses.some((response) => !response.ok)) {
      setError('PIN 저장 중 오류가 발생했습니다.')
      return
    }

    setAdminPin('')
    setStaffPin('')
    setMessage('PIN을 저장했습니다.')
  }

  if (loading) {
    return <p className="py-12 text-center text-sm text-gray-400">지점 설정을 불러오는 중입니다...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-extrabold text-gray-900">지점 설정</h2>
        <p className="mt-1 text-sm text-gray-400">
          현재 운영 지점: {config.branch_name} ({tenant.slug})
        </p>
      </div>

      {(error || message) ? (
        <div className="rounded-2xl bg-white px-5 py-3 shadow-sm">
          {error ? <p className="text-xs text-red-500">{error}</p> : null}
          {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
        <form onSubmit={saveConfig} className="flex flex-col gap-6">
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700">지점 정보</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">지점명</label>
                <input
                  value={config.branch_name}
                  onChange={(event) => updateConfig('branch_name', event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">계열</label>
                <select
                  value={config.branch_track_type}
                  onChange={(event) =>
                    updateConfig('branch_track_type', event.target.value as AppConfigSnapshot['branch_track_type'])
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                >
                  {TRACK_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5 md:col-span-2">
                <label className="text-xs font-semibold text-gray-500">지점 설명</label>
                <textarea
                  value={config.branch_description}
                  onChange={(event) => updateConfig('branch_description', event.target.value)}
                  rows={3}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">관리자 타이틀</label>
                <input
                  value={config.branch_admin_title}
                  onChange={(event) => updateConfig('branch_admin_title', event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-500">계열 라벨</label>
                  <input
                    value={config.branch_series_label}
                    onChange={(event) => updateConfig('branch_series_label', event.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-500">지점 라벨</label>
                  <input
                    value={config.branch_region_label}
                    onChange={(event) => updateConfig('branch_region_label', event.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700">브랜드</h3>
            <div className="mt-4 grid gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">앱 이름</label>
                <input
                  value={config.app_name}
                  onChange={(event) => updateConfig('app_name', event.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">테마 색상</label>
                <div className="flex items-center gap-3">
                  <input
                    value={config.theme_color}
                    onChange={(event) => updateConfig('theme_color', event.target.value)}
                    className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  />
                  <span
                    className="h-10 w-10 shrink-0 rounded-xl border border-slate-200"
                    style={{ background: config.theme_color }}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700">기능 설정</h3>
            <div className="mt-4 flex flex-col gap-5">
              {FEATURE_GROUP_ITEMS.map((group) => (
                <div key={group.scope}>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{group.label}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {group.keys.map((key) => {
                      const meta = APP_FEATURE_META[key]
                      return (
                        <label
                          key={key}
                          className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm transition hover:bg-slate-50"
                        >
                          <span className="font-medium text-gray-700">{meta.label}</span>
                          <input
                            type="checkbox"
                            checked={Boolean(config[key])}
                            onChange={(event) => updateFeature(key, event.target.checked)}
                            className="rounded"
                          />
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <button
            type="submit"
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
          >
            지점 설정 저장
          </button>
        </form>

        <div className="flex flex-col gap-6">
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700">운영 경로</h3>
            <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">{tenant.branchName}</p>
              <p className="mt-1 break-all text-xs text-slate-500">/{tenant.slug}</p>
              <p className="mt-2 text-xs text-slate-500">
                이 지점이 활성 상태면 `/gangnam-police` 같은 경로로 접속했을 때 관리자 설정이 바로 반영됩니다.
              </p>
            </div>
          </section>

          <form onSubmit={saveAdminIdentity} className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700">관리자 아이디</h3>
            <input
              value={adminId}
              onChange={(event) => setAdminId(event.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
            />
            <button
              type="submit"
              className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              아이디 저장
            </button>
          </form>

          <form onSubmit={savePins} className="rounded-2xl bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700">PIN 관리</h3>
            <div className="mt-3 grid gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">관리자 PIN 변경</label>
                <input
                  type="password"
                  value={adminPin}
                  onChange={(event) => setAdminPin(event.target.value)}
                  placeholder="새 PIN 입력"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-500">직원 PIN 변경</label>
                <input
                  type="password"
                  value={staffPin}
                  onChange={(event) => setStaffPin(event.target.value)}
                  placeholder="새 PIN 입력"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
            </div>
            <button
              type="submit"
              className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              PIN 저장
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
