'use client'

import { useState } from 'react'
import { invalidateConfigCache } from '../_lib/config-client'
import ConfigPanel from './ConfigPanel'
import ConfigStatusMessage from './ConfigStatusMessage'

export default function CacheToolsManager() {
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  async function handleInvalidate() {
    setIsLoading(true)
    setStatus(null)

    try {
      const result = await invalidateConfigCache()
      setStatus({
        tone: 'success',
        text: result.message ?? '캐시가 초기화되었습니다.',
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : '캐시 초기화에 실패했습니다.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <ConfigPanel
      eyebrow="설정 / 캐시"
      title="캐시 도구"
      description="앱 설정, 팝업, 자료 목록 관련 캐시를 수동으로 비워서 운영 변경 사항을 즉시 반영합니다."
      footer={
        <button
          type="button"
          onClick={handleInvalidate}
          disabled={isLoading}
          className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {isLoading ? '초기화 중...' : '캐시 초기화'}
        </button>
      }
    >
      {status ? <ConfigStatusMessage text={status.text} tone={status.tone} /> : null}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm leading-6 text-gray-600">
        설정 저장 이후 학생 화면이나 수령증 화면이 즉시 반영되지 않을 때 사용합니다. 현재는 학생 목록,
        자료 목록, 팝업, 앱 설정 태그를 한 번에 무효화합니다.
      </div>
    </ConfigPanel>
  )
}
