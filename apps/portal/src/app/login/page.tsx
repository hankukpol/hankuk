'use client'

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'

const SAVED_EMAIL_KEY = 'portal.saved-email'

function getLoginErrorMessage(searchParams: URLSearchParams) {
  switch (searchParams.get('error')) {
    case 'invalid_credentials':
      return '이메일 또는 비밀번호를 확인해 주세요.'
    case 'invalid_input':
      return '입력값을 확인해 주세요.'
    case 'rate_limited':
      return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.'
    default:
      return ''
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberEmail, setRememberEmail] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const initialError = getLoginErrorMessage(searchParams)
    if (initialError) {
      setError(initialError)
    }

    const savedEmail = window.localStorage.getItem(SAVED_EMAIL_KEY)
    if (savedEmail) {
      setEmail(savedEmail)
      setRememberEmail(true)
    }
  }, [])

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value)
  }

  function handlePasswordChange(event: ChangeEvent<HTMLInputElement>) {
    setPassword(event.target.value)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    setIsSubmitting(true)
    setError('')

    const formData = new FormData(event.currentTarget)
    const rawEmail = formData.get('email')
    const submittedEmail = typeof rawEmail === 'string' ? rawEmail : ''

    if (rememberEmail) {
      window.localStorage.setItem(SAVED_EMAIL_KEY, submittedEmail.trim())
    } else {
      window.localStorage.removeItem(SAVED_EMAIL_KEY)
    }
  }

  function handleFormError() {
    setIsSubmitting(false)
  }

  function handleRememberEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setRememberEmail(event.target.checked)
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">H</div>
          <h1>관리자 포털</h1>
          <p>브라우저의 일반 로그인 저장 기능으로 다음 로그인도 편하게 진행할 수 있습니다.</p>
        </div>

        <form
          action="/api/auth/login"
          method="post"
          onSubmit={handleSubmit}
          onError={handleFormError}
          className="login-form"
        >
          <label className="portal-label">
            이메일
            <input
              className="portal-input"
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="email"
              value={email}
              onChange={handleEmailChange}
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
              onChange={handlePasswordChange}
              placeholder="비밀번호"
              required
            />
          </label>

          <label className="login-remember">
            <input
              name="rememberEmail"
              type="checkbox"
              checked={rememberEmail}
              onChange={handleRememberEmailChange}
            />
            <span>아이디 저장</span>
          </label>

          <p className="login-help">비밀번호 저장과 자동완성은 브라우저 기본 기능을 사용합니다.</p>

          {error ? <div className="login-error">{error}</div> : null}

          <button
            className="portal-button"
            type="submit"
            disabled={isSubmitting}
            style={{ width: '100%', marginTop: 8 }}
          >
            {isSubmitting ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </main>
  )
}
