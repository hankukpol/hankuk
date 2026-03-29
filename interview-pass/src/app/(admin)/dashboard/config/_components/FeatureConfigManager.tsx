'use client'

import { useEffect, useMemo, useState } from 'react'
import { loadAppConfig, saveAppConfig, type AppConfigResponse } from '../_lib/config-client'
import ConfigPanel from './ConfigPanel'
import ConfigStatusMessage from './ConfigStatusMessage'
import {
  APP_CONFIG_DEFAULTS,
  APP_FEATURE_GROUPS,
  APP_FEATURE_KEYS,
  APP_FEATURE_META,
  APP_RECOVERY_SURFACES,
  type AppFeatureKey,
} from '@/lib/app-config.shared'

type FeatureState = Record<AppFeatureKey, boolean>

function buildFeatureState(
  source: Pick<AppConfigResponse, AppFeatureKey> | FeatureState,
): FeatureState {
  return APP_FEATURE_KEYS.reduce((accumulator, key) => {
    accumulator[key] = source[key]
    return accumulator
  }, {} as FeatureState)
}

const DEFAULT_FEATURES = buildFeatureState(APP_CONFIG_DEFAULTS)

export default function FeatureConfigManager() {
  const [features, setFeatures] = useState<FeatureState>(DEFAULT_FEATURES)
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

        setFeatures(buildFeatureState(config))
      } catch (error) {
        if (!cancelled) {
          setStatus({
            tone: 'error',
            text: error instanceof Error ? error.message : '기능 설정을 불러오지 못했습니다.',
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
      await saveAppConfig(features)
      setStatus({ tone: 'success', text: '기능 설정이 저장되었습니다.' })
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : '기능 설정 저장에 실패했습니다.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const enabledCount = APP_FEATURE_KEYS.filter((key) => features[key]).length
  const featuresByGroup = useMemo(
    () =>
      APP_FEATURE_GROUPS.map((group) => ({
        ...group,
        fields: APP_FEATURE_KEYS.filter((key) => APP_FEATURE_META[key].scope === group.key),
      })),
    [],
  )

  return (
    <ConfigPanel
      eyebrow="설정 / 기능"
      title="기능 토글"
      description="지점 운영 방식에 맞춰 학생, 직원, 관리자, 공개 화면 기능을 분리해 켜고 끄면 저장 직후 화면과 API에 즉시 반영됩니다."
      footer={
        <button
          type="button"
          onClick={handleSave}
          disabled={isLoading || isSaving}
          className="rounded-xl bg-[#1a237e] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isSaving ? '저장 중...' : '기능 설정 저장'}
        </button>
      }
    >
      {status ? <ConfigStatusMessage text={status.text} tone={status.tone} /> : null}

      {isLoading ? (
        <p className="text-sm text-gray-500">기능 설정을 불러오는 중입니다...</p>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              활성 기능
            </p>
            <p className="mt-3 text-2xl font-bold text-gray-900">
              {enabledCount}/{APP_FEATURE_KEYS.length}
            </p>
            <p className="mt-2 text-sm text-gray-600">
              학생, 직원, 관리자, 공개 기능을 지점 운영 정책에 맞게 분리해 제어할 수 있습니다.
            </p>
          </div>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
              복구 경로
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-900">
              아래 경로는 기능 토글과 관계없이 항상 열어 둡니다. 지점 관리자가 설정을 잘못 꺼도 스스로
              다시 복구할 수 있어야 하기 때문입니다.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {APP_RECOVERY_SURFACES.map((surface) => (
                <div key={surface.path} className="rounded-2xl border border-amber-200 bg-white p-4">
                  <p className="text-sm font-semibold text-gray-900">{surface.label}</p>
                  <p className="mt-1 text-xs font-medium text-amber-700">{surface.path}</p>
                  <p className="mt-2 text-xs leading-5 text-gray-600">{surface.description}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="space-y-4">
            {featuresByGroup.map((group) => (
              <section key={group.key} className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    {group.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{group.description}</p>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {group.fields.map((key) => {
                    const feature = APP_FEATURE_META[key]

                    return (
                      <label
                        key={key}
                        className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={features[key]}
                          onChange={(event) =>
                            setFeatures((prev) => ({ ...prev, [key]: event.target.checked }))
                          }
                        />
                        <span className="space-y-1">
                          <span className="block text-sm font-semibold text-gray-900">
                            {feature.label}
                          </span>
                          <span className="block text-xs leading-5 text-gray-500">
                            {feature.description}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </ConfigPanel>
  )
}
