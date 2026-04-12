'use client'

import { useEffect, useRef } from 'react'

export function LaunchAutoSubmit(props: {
  action: string
  launchToken: string
  title: string
  description: string
}) {
  const formRef = useRef<HTMLFormElement | null>(null)

  useEffect(() => {
    formRef.current?.submit()
  }, [])

  return (
    <div className="portal-page">
      <div className="portal-card" style={{ maxWidth: 520, margin: '80px auto', padding: 32 }}>
        <span className="portal-badge">자동 로그인 연결 중</span>
        <h1 style={{ marginTop: 20, fontSize: 30 }}>{props.title}</h1>
        <p className="portal-muted" style={{ lineHeight: 1.7 }}>
          {props.description}
        </p>
        <p className="portal-muted" style={{ marginTop: 16, fontSize: 14 }}>
          잠시만 기다리면 대상 앱으로 자동 이동합니다. 자동 제출이 막힌 경우 아래 버튼을 눌러 계속 진행해 주세요.
        </p>

        <form ref={formRef} method="POST" action={props.action} style={{ marginTop: 24 }}>
          <input type="hidden" name="launchToken" value={props.launchToken} />
          <button type="submit" className="portal-button" style={{ width: '100%' }}>
            계속 진행
          </button>
        </form>
      </div>
    </div>
  )
}
