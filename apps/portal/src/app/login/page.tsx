'use client'

import { useState, type FormEvent } from 'react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(data.error ?? '로그인에 실패했습니다.')
        return
      }

      window.location.href = '/'
    } catch {
      setError('로그인 요청 중 문제가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="portal-page">
      <div
        className="portal-card"
        style={{
          maxWidth: 960,
          margin: '32px auto',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(320px, 1.1fr)',
        }}
      >
        <section
          style={{
            background: 'linear-gradient(160deg, #10214d 0%, #1f4be3 100%)',
            color: '#fff',
            padding: 40,
          }}
        >
          <span style={{ opacity: 0.72, fontSize: 13, letterSpacing: '0.22em' }}>UNIFIED ADMIN PORTAL</span>
          <h1 style={{ marginTop: 20, fontSize: 36, lineHeight: 1.25 }}>
            여러 운영 앱을
            <br />
            한 번 로그인으로
            <br />
            이어서 관리합니다.
          </h1>
          <p style={{ marginTop: 20, opacity: 0.82, lineHeight: 1.8 }}>
            포털은 통합 진입만 맡고, 각 앱의 기존 관리자 로그인 방식은 그대로 유지합니다. 필요하면 언제든 각 앱의
            로컬 로그인으로 바로 들어갈 수도 있습니다.
          </p>
        </section>

        <section style={{ padding: 40 }}>
          <div>
            <span className="portal-badge">공통 관리자 계정</span>
            <h2 style={{ marginTop: 18, fontSize: 28 }}>포털 로그인</h2>
            <p className="portal-muted" style={{ lineHeight: 1.7 }}>
              Supabase 공통 관리자 계정으로 로그인한 뒤, 권한이 있는 앱과 지점으로 바로 이동할 수 있습니다.
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ marginTop: 28, display: 'grid', gap: 16 }}>
            <label className="portal-label">
              이메일
              <input
                className="portal-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                required
              />
            </label>

            <label className="portal-label">
              비밀번호
              <input
                className="portal-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="비밀번호를 입력해 주세요"
                required
              />
            </label>

            {error ? (
              <div
                className="portal-danger"
                style={{
                  border: '1px solid rgba(198,40,40,0.2)',
                  background: '#fff4f4',
                  borderRadius: 16,
                  padding: '14px 16px',
                }}
              >
                {error}
              </div>
            ) : null}

            <button className="portal-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </section>
      </div>
    </main>
  )
}
