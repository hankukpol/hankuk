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
    <div className="portal-transition">
      <div className="portal-transition-card">
        <div className="portal-transition-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0071e3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
        <h2 style={{
          margin: 0,
          fontFamily: '"SF Pro Display", "SF Pro Icons", "Helvetica Neue", Helvetica, Arial, sans-serif',
          fontSize: 21,
          fontWeight: 700,
          lineHeight: 1.19,
          letterSpacing: '0.231px',
          color: '#1d1d1f',
        }}>
          {props.title}
        </h2>
        <p style={{
          marginTop: 8,
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 1.43,
          letterSpacing: '-0.224px',
          color: 'rgba(0, 0, 0, 0.8)',
        }}>
          {props.description} 화면으로 연결 중...
        </p>

        <form ref={formRef} method="POST" action={props.action} style={{ marginTop: 24 }}>
          <input type="hidden" name="launchToken" value={props.launchToken} />
          <button type="submit" className="portal-button" style={{ width: '100%' }}>
            수동으로 이동
          </button>
        </form>
      </div>
    </div>
  )
}
