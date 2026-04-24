'use client'

import { useEffect, useMemo, useState } from 'react'
import { getBrowserEnvironment, type BrowserEnvironment } from '@/lib/client/browser-env'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type StudentAccessGuideProps = {
  storageKey?: string
  compact?: boolean
  onlyWhenKakao?: boolean
}

function getDismissedUntil(storageKey: string) {
  if (typeof window === 'undefined') {
    return 0
  }

  return Number(window.localStorage.getItem(storageKey) ?? 0)
}

function dismissFor(storageKey: string, days: number) {
  if (typeof window === 'undefined') {
    return
  }

  const until = Date.now() + days * 24 * 60 * 60 * 1000
  window.localStorage.setItem(storageKey, String(until))
}

export function StudentAccessGuide({
  storageKey = 'class_pass_student_access_guide_dismissed_until',
  compact = false,
  onlyWhenKakao = false,
}: StudentAccessGuideProps) {
  const [env, setEnv] = useState<BrowserEnvironment | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installMessage, setInstallMessage] = useState('')

  useEffect(() => {
    setEnv(getBrowserEnvironment())
    setDismissed(getDismissedUntil(storageKey) > Date.now())

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [storageKey])

  const shouldShow = useMemo(() => {
    if (!env || dismissed || env.isStandalonePwa) {
      return false
    }

    if (onlyWhenKakao) {
      return env.isKakaoInApp
    }

    return env.isKakaoInApp || env.isMobile
  }, [dismissed, env, onlyWhenKakao])

  if (!shouldShow || !env) {
    return null
  }

  async function handleInstall() {
    if (!installPrompt) {
      return
    }

    await installPrompt.prompt()
    const choice = await installPrompt.userChoice.catch(() => null)
    setInstallPrompt(null)
    setInstallMessage(choice?.outcome === 'accepted'
      ? '홈 화면에 추가되었습니다.'
      : '언제든 다시 홈 화면에 추가할 수 있습니다.')
  }

  function handleDismiss() {
    dismissFor(storageKey, 7)
    setDismissed(true)
  }

  return (
    <section className={`student-card px-4 ${compact ? 'py-3' : 'py-4'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="student-eyebrow student-eyebrow-light">접속 환경</p>
          <p className="mt-1 text-[15px] font-semibold tracking-[-0.03em] text-[var(--student-text)]">
            {env.isKakaoInApp ? '카카오톡에서도 이용할 수 있습니다.' : '홈 화면 바로가기를 권장합니다.'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 text-[13px] font-semibold text-[var(--student-link)]"
        >
          닫기
        </button>
      </div>

      <div className="student-body mt-2 break-keep">
        {env.isKakaoInApp ? (
          <p>
            카카오톡 내장 브라우저는 위치 권한이 반복되거나 실패할 수 있습니다. 실패하면 우측 상단 메뉴에서
            Safari/Chrome으로 열어 주세요.
          </p>
        ) : (
          <p>출석과 좌석지정은 홈 화면에서 바로 열면 위치 권한이 더 안정적으로 유지됩니다.</p>
        )}
      </div>

      <div className="mt-3 rounded-[12px] bg-[var(--student-surface-muted)] px-4 py-3">
        {env.isAndroid && installPrompt ? (
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="student-pill-button student-pill-primary w-full"
          >
            홈 화면에 추가
          </button>
        ) : env.isIOS && !env.isKakaoInApp ? (
          <p className="text-[13px] leading-5 text-[var(--student-text-muted)]">
            Safari 하단 공유 버튼을 누른 뒤 <strong className="font-semibold text-[var(--student-text)]">홈 화면에 추가</strong>를 선택해 주세요.
          </p>
        ) : env.isKakaoInApp ? (
          <p className="text-[13px] leading-5 text-[var(--student-text-muted)]">
            카카오톡 우측 상단 메뉴에서 Safari/Chrome으로 연 뒤, 브라우저 메뉴의 홈 화면 추가를 사용해 주세요.
          </p>
        ) : (
          <p className="text-[13px] leading-5 text-[var(--student-text-muted)]">
            브라우저 메뉴에서 홈 화면에 추가를 선택해 주세요.
          </p>
        )}
        {installMessage ? <p className="mt-2 text-[12px] text-[var(--student-link)]">{installMessage}</p> : null}
      </div>
    </section>
  )
}
