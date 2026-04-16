'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StaffAppOption } from '@/lib/staff-management'

type StaffInviteFormProps = {
  appOptions: StaffAppOption[]
}

type AppSelectionState = {
  enabled: boolean
  roleKey: string
  divisions: string[]
}

function buildInitialSelection(options: StaffAppOption[]) {
  return Object.fromEntries(
    options.map((option) => [
      option.appKey,
      {
        enabled: false,
        roleKey: option.roles[0]?.key ?? 'admin',
        divisions: [],
      } satisfies AppSelectionState,
    ]),
  ) as Record<string, AppSelectionState>
}

export function StaffInviteForm({ appOptions }: StaffInviteFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [appSelections, setAppSelections] = useState<Record<string, AppSelectionState>>(() =>
    buildInitialSelection(appOptions),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      const payload = {
        email,
        fullName,
        phone: phone.trim() || undefined,
        password,
        apps: appOptions
          .filter((option) => appSelections[option.appKey]?.enabled)
          .map((option) => ({
            appKey: option.appKey,
            roleKey: appSelections[option.appKey].roleKey,
            divisions: appSelections[option.appKey].divisions,
          })),
      }

      const response = await fetch('/api/staff/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        setMessage({
          type: 'error',
          text: typeof data?.error === 'string' ? data.error : '직원 초대에 실패했습니다.',
        })
        return
      }

      router.push(`/staff/${data.id}`)
      router.refresh()
    } catch {
      setMessage({ type: 'error', text: '직원 초대 요청 중 문제가 발생했습니다.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="portal-form-stack" onSubmit={handleSubmit}>
      <div className="portal-card portal-panel">
        <div className="portal-form-grid">
          <label className="portal-label">
            이메일
            <input
              className="portal-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="staff@example.com"
              required
            />
          </label>

          <label className="portal-label">
            이름
            <input
              className="portal-input"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="직원 이름"
              required
            />
          </label>

          <label className="portal-label">
            연락처
            <input
              className="portal-input"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="010-0000-0000"
            />
          </label>

          <label className="portal-label">
            초기 비밀번호
            <input
              className="portal-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8자 이상"
              required
            />
          </label>
        </div>
      </div>

      <div className="portal-card portal-panel">
        <div className="portal-section-row">
          <div>
            <h2 className="portal-section-heading">앱 접근 권한</h2>
            <p className="portal-section-sub">총괄관리자 승격은 상세 페이지에서만 가능합니다.</p>
          </div>
          <span className="portal-badge">{selectedCount}개 선택</span>
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
        <button className="portal-button secondary" type="button" onClick={() => router.push('/staff')}>
          취소
        </button>
        <button className="portal-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '처리 중...' : '직원 초대'}
        </button>
      </div>
    </form>
  )
}
