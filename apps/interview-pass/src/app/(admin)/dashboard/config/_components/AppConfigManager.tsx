'use client'

import { useEffect, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import { loadAppConfig, saveAppConfig } from '../_lib/config-client'
import ConfigPanel from './ConfigPanel'
import ConfigStatusMessage from './ConfigStatusMessage'

export default function AppConfigManager() {
  const tenant = useTenantConfig()
  const [appName, setAppName] = useState('')
  const [themeColor, setThemeColor] = useState('#1a237e')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setStatus(null)

      try {
        const config = await loadAppConfig()
        if (cancelled) return

        setAppName(config.app_name ?? '')
        setThemeColor(config.theme_color ?? '#1a237e')
      } catch (error) {
        if (!cancelled) {
          setStatus({
            tone: 'error',
            text: error instanceof Error ? error.message : '앱 설정을 불러오지 못했습니다.',
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

  async function handleSave() {
    setIsSaving(true)
    setStatus(null)

    try {
      await saveAppConfig({
        app_name: appName,
        theme_color: themeColor,
      })
      setStatus({ tone: 'success', text: '앱 설정이 저장되었습니다.' })
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : '앱 설정 저장에 실패했습니다.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ConfigPanel
      eyebrow="설정 / 앱"
      title="앱 브랜딩"
      description="학생 화면에서 사용하는 앱 이름과 대표 색상을 직접 조정합니다. 학생 첫 화면과 수령증 화면에서 이 값을 사용합니다."
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={isLoading || isSaving}
          className="rounded-xl bg-[#1a237e] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSaving ? '저장 중...' : '앱 설정 저장'}
        </button>
      }
    >
      {status ? <ConfigStatusMessage text={status.text} tone={status.tone} /> : null}

      {isLoading ? (
        <p className="text-sm text-gray-500">앱 설정을 불러오는 중입니다...</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">앱 이름</label>
            <input
              type="text"
              value={appName}
              onChange={(event) => setAppName(event.target.value)}
              placeholder={tenant.defaultAppName}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">테마 색상</label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={themeColor}
                onChange={(event) => setThemeColor(event.target.value)}
                className="h-11 w-14 cursor-pointer rounded-xl border border-gray-200 bg-white p-1"
              />
              <input
                type="text"
                value={themeColor}
                onChange={(event) => setThemeColor(event.target.value)}
                placeholder="#1a237e"
                className="w-36 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
              />
              <div className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600">
                <span
                  className="h-5 w-5 rounded-full border border-gray-200"
                  style={{ backgroundColor: themeColor }}
                />
                미리보기
              </div>
            </div>
          </div>
        </div>
      )}
    </ConfigPanel>
  )
}
