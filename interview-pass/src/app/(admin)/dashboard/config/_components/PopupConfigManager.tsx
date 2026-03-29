'use client'

import { useEffect, useState } from 'react'
import {
  loadPopupConfigs,
  savePopupConfig,
  type PopupContent,
} from '../_lib/config-client'
import ConfigPanel from './ConfigPanel'
import ConfigStatusMessage from './ConfigStatusMessage'

function popupLabel(key: string) {
  if (key === 'notice') return '공지사항'
  if (key === 'refund_policy') return '환불 규정'
  return key
}

export default function PopupConfigManager() {
  const [popups, setPopups] = useState<PopupContent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setStatus(null)

      try {
        const nextPopups = await loadPopupConfigs()
        if (!cancelled) {
          setPopups(nextPopups)
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            tone: 'error',
            text: error instanceof Error ? error.message : '팝업 설정을 불러오지 못했습니다.',
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

  function updatePopup(key: string, field: keyof PopupContent, value: string | boolean) {
    setPopups((prev) =>
      prev.map((popup) => (popup.popup_key === key ? { ...popup, [field]: value } : popup))
    )
  }

  async function handleSave(popup: PopupContent) {
    setSavingMap((prev) => ({ ...prev, [popup.popup_key]: true }))
    setStatus(null)

    try {
      const savedPopup = await savePopupConfig(popup)
      setPopups((prev) =>
        prev.map((item) => (item.popup_key === savedPopup.popup_key ? savedPopup : item))
      )
      setStatus({ tone: 'success', text: `${popupLabel(popup.popup_key)} 팝업이 저장되었습니다.` })
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : '팝업 저장에 실패했습니다.',
      })
    } finally {
      setSavingMap((prev) => ({ ...prev, [popup.popup_key]: false }))
    }
  }

  return (
    <ConfigPanel
      eyebrow="설정 / 팝업"
      title="팝업 편집"
      description="학생 수령증 화면에 노출되는 공지사항과 환불 규정 팝업을 개별적으로 관리합니다."
    >
      {status ? <ConfigStatusMessage text={status.text} tone={status.tone} /> : null}

      {isLoading ? (
        <p className="text-sm text-gray-500">팝업 설정을 불러오는 중입니다...</p>
      ) : popups.length === 0 ? (
        <ConfigStatusMessage tone="info" text="등록된 팝업이 없습니다." />
      ) : (
        <div className="space-y-5">
          {popups.map((popup) => (
            <div
              key={popup.popup_key}
              className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">
                    {popupLabel(popup.popup_key)}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">키: {popup.popup_key}</p>
                </div>

                <button
                  type="button"
                  onClick={() => updatePopup(popup.popup_key, 'is_active', !popup.is_active)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                    popup.is_active
                      ? 'border-green-300 bg-green-50 text-green-700'
                      : 'border-gray-300 bg-white text-gray-500'
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      popup.is_active ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  />
                  {popup.is_active ? '활성' : '비활성'}
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">팝업 제목</label>
                <input
                  type="text"
                  value={popup.title}
                  onChange={(event) => updatePopup(popup.popup_key, 'title', event.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">팝업 본문</label>
                <textarea
                  value={popup.body}
                  onChange={(event) => updatePopup(popup.popup_key, 'body', event.target.value)}
                  rows={7}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-[#1a237e] focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => handleSave(popup)}
                disabled={Boolean(savingMap[popup.popup_key])}
                className="rounded-xl bg-[#1a237e] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingMap[popup.popup_key] ? '저장 중...' : `${popupLabel(popup.popup_key)} 저장`}
              </button>
            </div>
          ))}
        </div>
      )}
    </ConfigPanel>
  )
}
