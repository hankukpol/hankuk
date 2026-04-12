'use client'

import { useEffect, useState, type FormEvent } from 'react'

declare global {
  interface Window {
    PasswordCredential?: new (data: { id: string; password: string }) => Credential
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (window.PasswordCredential && navigator.credentials) {
      navigator.credentials
        .get({ password: true, mediation: 'optional' } as unknown as CredentialRequestOptions)
        .then((cred) => {
          if (cred && 'password' in cred) {
            setEmail(cred.id)
            setPassword((cred as unknown as { password: string }).password)
          }
        })
        .catch(() => {})
    }
  }, [])

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

      if (window.PasswordCredential) {
        const cred = new window.PasswordCredential({ id: email, password })
        navigator.credentials.store(cred).catch(() => {})
      }
      window.location.href = '/'
    } catch {
      setError('로그인 요청 중 문제가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="portal-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', padding: '20px' }}>
      <div className="portal-card" style={{ width: '100%', maxWidth: 400, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 10,
              background: 'var(--brand)',
              color: '#fff',
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 16,
            }}
          >
            H
          </div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>관리자 포털</h1>
          <p className="portal-muted" style={{ marginTop: 6, fontSize: 14, lineHeight: 1.6 }}>
            통합 계정으로 로그인하세요
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <label className="portal-label">
            이메일
            <input
              className="portal-input"
              name="email"
              type="email"
              autoComplete="username"
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
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호"
              required
            />
          </label>

          {error ? (
            <div
              style={{
                fontSize: 13,
                color: 'var(--danger)',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                borderRadius: 10,
                padding: '10px 14px',
              }}
            >
              {error}
            </div>
          ) : null}

          <button className="portal-button" type="submit" disabled={isSubmitting} style={{ width: '100%', marginTop: 4 }}>
            {isSubmitting ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </main>
  )
}
