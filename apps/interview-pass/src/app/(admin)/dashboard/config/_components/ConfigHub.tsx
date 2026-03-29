'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTenantConfig } from '@/components/TenantProvider'
import {
  APP_CONFIG_DEFAULTS,
  APP_FEATURE_KEYS,
  APP_FEATURE_META,
  APP_RECOVERY_SURFACES,
} from '@/lib/app-config.shared'
import {
  loadAdminId,
  loadAppConfig,
  loadPopupConfigs,
  type AppConfigResponse,
  type PopupContent,
} from '../_lib/config-client'
import { CONFIG_SECTIONS } from '../_lib/config-sections'
import ConfigPanel from './ConfigPanel'
import ConfigStatusMessage from './ConfigStatusMessage'

function popupLabel(key: string) {
  if (key === 'notice') return '공지사항'
  if (key === 'refund_policy') return '환불규정'
  return key
}

export default function ConfigHub() {
  const tenant = useTenantConfig()
  const defaultAppName = tenant.defaultAppName
  const [appConfig, setAppConfig] = useState<AppConfigResponse>(() => ({
    ...APP_CONFIG_DEFAULTS,
    app_name: defaultAppName,
  }))
  const [popups, setPopups] = useState<PopupContent[]>([])
  const [adminId, setAdminId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError('')

      try {
        const [nextAppConfig, nextPopups, nextAdminId] = await Promise.all([
          loadAppConfig(),
          loadPopupConfigs(),
          loadAdminId(),
        ])

        if (cancelled) return

        setAppConfig({
          ...nextAppConfig,
          app_name: nextAppConfig.app_name ?? defaultAppName,
        })
        setPopups(nextPopups)
        setAdminId(nextAdminId.id ?? '')
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : '설정 상태를 불러오지 못했습니다.',
          )
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
  }, [defaultAppName])

  const activePopupCount = popups.filter((popup) => popup.is_active).length
  const activeFeatureCount = APP_FEATURE_KEYS.filter((key) => appConfig[key]).length
  const featureSummary = [
    'student_login_enabled',
    'staff_scan_enabled',
    'admin_dashboard_overview_enabled',
    'admin_popup_management_enabled',
    'admin_student_management_enabled',
    'monitor_enabled',
  ].map((key) => {
    const typedKey = key as (typeof APP_FEATURE_KEYS)[number]
    return `${APP_FEATURE_META[typedKey].label} ${appConfig[typedKey] ? 'ON' : 'OFF'}`
  })
  const detailSections = CONFIG_SECTIONS.filter(
    (section) => section.key !== 'overview' && (!section.feature || appConfig[section.feature]),
  )

  return (
    <div className="space-y-6">
      <ConfigPanel
        eyebrow="설정 허브"
        title="설정 개요"
        description="학생 화면 브랜딩, 운영 기능 토글, 팝업 노출, 관리자 접근 정보, 캐시 도구를 섹션 단위로 직접 관리할 수 있게 정리했습니다."
      >
        {error ? <ConfigStatusMessage tone="error" text={error} /> : null}

        {isLoading ? (
          <p className="text-sm text-gray-500">현재 설정 상태를 불러오는 중입니다...</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                앱 설정
              </p>
              <p className="mt-3 text-xl font-bold text-gray-900">{appConfig.app_name}</p>
              <div className="mt-3 flex items-center gap-3 text-sm text-gray-600">
                <span
                  className="h-5 w-5 rounded-full border border-gray-200"
                  style={{ backgroundColor: appConfig.theme_color }}
                />
                {appConfig.theme_color}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                팝업
              </p>
              <p className="mt-3 text-xl font-bold text-gray-900">
                {activePopupCount}/{popups.length || 0} 활성
              </p>
              <p className="mt-3 text-sm text-gray-600">
                {popups.length > 0
                  ? popups
                      .map(
                        (popup) => `${popupLabel(popup.popup_key)} ${popup.is_active ? 'ON' : 'OFF'}`,
                      )
                      .join(' / ')
                  : '등록된 팝업이 없습니다.'}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                기능
              </p>
              <p className="mt-3 text-xl font-bold text-gray-900">
                {activeFeatureCount}/{APP_FEATURE_KEYS.length} 활성
              </p>
              <p className="mt-3 text-sm text-gray-600">{featureSummary.join(' / ')}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                접근 정보
              </p>
              <p className="mt-3 text-xl font-bold text-gray-900">
                {adminId.trim() ? '아이디 + PIN' : 'PIN 전용'}
              </p>
              <p className="mt-3 text-sm text-gray-600">
                {adminId.trim()
                  ? `관리자 아이디 ${adminId}`
                  : '관리자 아이디가 비어 있어 PIN만으로 로그인합니다.'}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                캐시
              </p>
              <p className="mt-3 text-xl font-bold text-gray-900">수동 초기화</p>
              <p className="mt-3 text-sm text-gray-600">
                앱 설정, 팝업, 자료 목록 변경을 저장한 뒤 즉시 반영이 필요할 때 사용합니다.
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                복구 경로
              </p>
              <p className="mt-3 text-xl font-bold text-amber-950">
                {APP_RECOVERY_SURFACES.length}개 경로 항상 열림
              </p>
              <p className="mt-3 text-sm text-amber-900">
                {APP_RECOVERY_SURFACES.map((surface) => surface.path).join(' / ')}
              </p>
            </div>
          </div>
        )}
      </ConfigPanel>

      <section className="grid gap-4 lg:grid-cols-2">
        {detailSections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              {section.label}
            </p>
            <h2 className="mt-3 text-xl font-bold text-gray-900">{section.title}</h2>
            <p className="mt-3 text-sm leading-6 text-gray-600">{section.description}</p>
            <p className="mt-5 text-sm font-semibold text-[#1a237e]">섹션 열기</p>
          </Link>
        ))}
      </section>
    </div>
  )
}
