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
    <div className="portal-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80dvh' }}>
      <div className="portal-card" style={{ maxWidth: 400, width: '100%', padding: 28, textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'var(--brand-soft)',
            marginBottom: 16,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{props.title}</h2>
        <p className="portal-muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.5 }}>
          {props.description} 화면으로 연결 중...
        </p>

        <form ref={formRef} method="POST" action={props.action} style={{ marginTop: 20 }}>
          <input type="hidden" name="launchToken" value={props.launchToken} />
          <button type="submit" className="portal-button" style={{ width: '100%' }}>
            수동으로 이동
          </button>
        </form>
      </div>
    </div>
  )
}
