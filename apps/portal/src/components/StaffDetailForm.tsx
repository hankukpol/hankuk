'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StaffAppOption, StaffDetailResponse } from '@/lib/staff-management'

type StaffDetailFormProps = {
  staff: StaffDetailResponse
  appOptions: StaffAppOption[]
  canDeactivate: boolean
}

type AppSelectionState = {
  enabled: boolean
  roleKey: string
  status: 'active' | 'suspended'
  divisions: string[]
}

function buildInitialSelections(staff: StaffDetailResponse, appOptions: StaffAppOption[]) {
  return Object.fromEntries(
    appOptions.map((option) => {
      const existing = staff.memberships.find((membership) => membership.appKey === option.appKey)

      return [
        option.appKey,
        {
          enabled: Boolean(existing),
          roleKey: existing?.roleKey ?? option.roles[0]?.key ?? 'admin',
          status: existing?.status === 'suspended' ? 'suspended' : 'active',
          divisions: existing?.divisions.map((division) => division.slug) ?? [],
        } satisfies AppSelectionState,
      ]
    }),
  ) as Record<string, AppSelectionState>
}

export function StaffDetailForm({ staff, appOptions, canDeactivate }: StaffDetailFormProps) {
  const router = useRouter()
  const [appSelections, setAppSelections] = useState<Record<string, AppSelectionState>>(() =>
    buildInitialSelections(staff, appOptions),
  )
  const [password, setPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const selectedCount = useMemo(
    () => Object.values(appSelections).filter((selection) => selection.enabled).length,
    [appSelections],
  )

  function toggleApp(appKey: string, enabled: boolean) {
    setAppSelections((current) => ({
      ...current,
      [appKey]: {
        ...current[appKey],
        enabled,
      },
    }))
  }

  function updateRole(appKey: string, roleKey: string) {
    setAppSelections((current) => ({
      ...current,
      [appKey]: {
        ...current[appKey],
        roleKey,
        divisions: roleKey === 'super_admin' ? [] : current[appKey].divisions,
      },
    }))
  }

  function updateStatus(appKey: string, status: 'active' | 'suspended') {
    setAppSelections((current) => ({
      ...current,
      [appKey]: {
        ...current[appKey],
        status,
      },
    }))
  }

  function toggleDivision(appKey: string, divisionSlug: string, allowMultiple: boolean) {
    setAppSelections((current) => {
      const selected = current[appKey]
      const divisions = selected.divisions.includes(divisionSlug)
        ? selected.divisions.filter((value) => value !== divisionSlug)
        : allowMultiple
          ? [...selected.divisions, divisionSlug]
          : [divisionSlug]

      return {
        ...current,
        [appKey]: {
          ...selected,
          divisions,
        },
      }
    })
  }

  async function handleSaveMemberships() {
    setIsSaving(true)
    setMessage(null)

    try {
      const memberships = appOptions
        .filter((option) => appSelections[option.appKey]?.enabled)
        .map((option) => ({
          appKey: option.appKey,
          roleKey: appSelections[option.appKey].roleKey,
          status: appSelections[option.appKey].status,
          divisions: appSelections[option.appKey].divisions,
        }))

      const response = await fetch(`/api/staff/${staff.id}/memberships`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberships }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        setMessage({
          type: 'error',
          text: typeof data?.error === 'string' ? data.error : '권한 저장에 실패했습니다.',
        })
        return
      }

      setMessage({ type: 'success', text: '권한이 저장되었습니다.' })
      router.refresh()
    } catch {
      setMessage({ type: 'error', text: '권한 저장 요청 중 문제가 발생했습니다.' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleResetPassword() {
    if (!password.trim()) {
      setMessage({ type: 'error', text: '새 비밀번호를 입력해주세요.' })
      return
    }

    setIsResettingPassword(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/staff/${staff.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: password }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        setMessage({
          type: 'error',
          text: typeof data?.error === 'string' ? data.error : '비밀번호 변경에 실패했습니다.',
        })
        return
      }

      setPassword('')
      setMessage({ type: 'success', text: '비밀번호를 변경했습니다.' })
    } catch {
      setMessage({ type: 'error', text: '비밀번호 변경 요청 중 문제가 발생했습니다.' })
    } finally {
      setIsResettingPassword(false)
    }
  }

  async function handleDeactivate() {
    if (!canDeactivate) {
      setMessage({ type: 'error', text: '본인 계정은 비활성화할 수 없습니다.' })
      return
    }

    if (!window.confirm('이 직원을 비활성화할까요?')) {
      return
    }

    setIsDeactivating(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/staff/${staff.id}/deactivate`, {
        method: 'POST',
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        setMessage({
          type: 'error',
          text: typeof data?.error === 'string' ? data.error : '직원 비활성화에 실패했습니다.',
        })
        return
      }

      router.push('/staff')
      router.refresh()
    } catch {
      setMessage({ type: 'error', text: '직원 비활성화 요청 중 문제가 발생했습니다.' })
    } finally {
      setIsDeactivating(false)
    }
  }

  return (
    <div className="portal-form-stack">
      <div className="portal-card portal-panel">
        <div className="portal-meta-grid">
          <div>
            <span className="portal-meta-label">이메일</span>
            <strong>{staff.email}</strong>
          </div>
          <div>
            <span className="portal-meta-label">연락처</span>
            <strong>{staff.phone || '-'}</strong>
          </div>
          <div>
            <span className="portal-meta-label">가입일</span>
            <strong>{staff.createdAt ? new Date(staff.createdAt).toLocaleString('ko-KR') : '-'}</strong>
          </div>
          <div>
            <span className="portal-meta-label">마지막 로그인</span>
            <strong>{staff.lastSignInAt ? new Date(staff.lastSignInAt).toLocaleString('ko-KR') : '-'}</strong>
          </div>
        </div>
      </div>

      <div className="portal-card portal-panel">
        <div className="portal-section-row">
          <div>
            <h2 className="portal-section-heading">비밀번호 재설정</h2>
            <p className="portal-section-sub">새 비밀번호를 입력한 뒤 바로 변경할 수 있습니다.</p>
          </div>
        </div>

        <div className="portal-inline-form">
          <input
            className="portal-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="새 비밀번호"
          />
          <button className="portal-button" type="button" onClick={handleResetPassword} disabled={isResettingPassword}>
            {isResettingPassword ? '처리 중...' : '비밀번호 변경'}
          </button>
        </div>
      </div>

      <div className="portal-card portal-panel">
        <div className="portal-section-row">
          <div>
            <h2 className="portal-section-heading">앱 접근 권한</h2>
            <p className="portal-section-sub">총괄관리자 승격은 여기서만 변경할 수 있습니다.</p>
          </div>
          <span className="portal-badge">{selectedCount}개 연결</span>
        </div>

        <div className="portal-app-option-list">
          {appOptions.map((option) => {
            const selection = appSelections[option.appKey]
            const requiresDivision = option.requiresDivision && selection.roleKey !== 'super_admin'

            return (
              <div key={option.appKey} className="portal-app-option">
                <label className="portal-check-row">
                  <input
                    type="checkbox"
                    checked={selection.enabled}
                    onChange={(event) => toggleApp(option.appKey, event.target.checked)}
                  />
                  <span>{option.displayName}</span>
                </label>

                {selection.enabled ? (
                  <div className="portal-app-option-body">
                    <label className="portal-label">
                      역할
                      <select
                        className="portal-input"
                        value={selection.roleKey}
                        onChange={(event) => updateRole(option.appKey, event.target.value)}
                      >
                        {option.roles.map((role) => (
                          <option key={role.key} value={role.key}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="portal-label">
                      상태
                      <select
                        className="portal-input"
                        value={selection.status}
                        onChange={(event) => updateStatus(option.appKey, event.target.value as 'active' | 'suspended')}
                      >
                        <option value="active">활성</option>
                        <option value="suspended">정지</option>
                      </select>
                    </label>

                    {requiresDivision ? (
                      <div className="portal-label">
                        지점
                        <div className="portal-checkbox-grid">
                          {option.divisions.map((division) => (
                            <label key={division.slug} className="portal-check-pill">
                              <input
                                type={option.allowMultipleDivisions ? 'checkbox' : 'radio'}
                                name={`division-${option.appKey}`}
                                checked={selection.divisions.includes(division.slug)}
                                onChange={() =>
                                  toggleDivision(option.appKey, division.slug, option.allowMultipleDivisions)
                                }
                              />
                              <span>{division.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      {message ? <div className={`portal-inline-message ${message.type}`}>{message.text}</div> : null}

      <div className="portal-actions">
        <button className="portal-button danger" type="button" onClick={handleDeactivate} disabled={isDeactivating}>
          {isDeactivating ? '처리 중...' : '직원 비활성화'}
        </button>
        <button className="portal-button" type="button" onClick={handleSaveMemberships} disabled={isSaving}>
          {isSaving ? '저장 중...' : '권한 저장'}
        </button>
      </div>
    </div>
  )
}
