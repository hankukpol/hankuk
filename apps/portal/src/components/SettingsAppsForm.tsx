'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SettingsAppRecord } from '@/lib/staff-management'

type SettingsAppsFormProps = {
  apps: SettingsAppRecord[]
}

export function SettingsAppsForm({ apps }: SettingsAppsFormProps) {
  const router = useRouter()
  const [values, setValues] = useState(() =>
    Object.fromEntries(apps.map((app) => [app.appKey, app.displayName])) as Record<string, string>,
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    try {
      const response = await fetch('/api/settings/apps', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apps: apps.map((app) => ({
            appKey: app.appKey,
            displayName: values[app.appKey] ?? '',
          })),
        }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        setMessage({
          type: 'error',
          text: typeof data?.error === 'string' ? data.error : '앱 이름 저장에 실패했습니다.',
        })
        return
      }

      setMessage({ type: 'success', text: '앱 이름을 저장했습니다.' })
      router.refresh()
    } catch {
      setMessage({ type: 'error', text: '앱 이름 저장 요청 중 문제가 발생했습니다.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="portal-form-stack" onSubmit={handleSubmit}>
      <div className="portal-card portal-panel">
        <div className="portal-settings-list">
          {apps.map((app) => (
            <label key={app.appKey} className="portal-label">
              <span className="portal-settings-label">{app.appKey}</span>
              <input
                className="portal-input"
                value={values[app.appKey] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [app.appKey]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
      </div>

      {message ? <div className={`portal-inline-message ${message.type}`}>{message.text}</div> : null}

      <div className="portal-actions">
        <button className="portal-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '저장 중...' : '변경사항 저장'}
        </button>
      </div>
    </form>
  )
}
