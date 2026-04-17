'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'

type Device = {
  name: string
  width: number
  height: number
  hasNotch: boolean
  cornerRadius: number
}

const DEVICES: Device[] = [
  { name: 'iPhone SE', width: 375, height: 667, hasNotch: false, cornerRadius: 20 },
  { name: 'iPhone 13 mini', width: 375, height: 812, hasNotch: true, cornerRadius: 36 },
  { name: 'iPhone 14 Pro', width: 393, height: 852, hasNotch: true, cornerRadius: 40 },
  { name: 'iPhone 15 Pro Max', width: 430, height: 932, hasNotch: true, cornerRadius: 44 },
  { name: 'Galaxy S21', width: 360, height: 800, hasNotch: false, cornerRadius: 28 },
  { name: 'iPad mini', width: 744, height: 1133, hasNotch: false, cornerRadius: 18 },
]

type QuickLink = {
  label: string
  path: string
  group: 'student' | 'staff' | 'admin'
}

const QUICK_LINKS: QuickLink[] = [
  { label: '경찰 · 홈', path: '/police', group: 'student' },
  { label: '경찰 · 수강 목록', path: '/police/courses', group: 'student' },
  { label: '소방 · 홈', path: '/fire', group: 'student' },
  { label: '소방 · 수강 목록', path: '/fire/courses', group: 'student' },
  { label: '경찰 · 스태프 로그인', path: '/police/staff/login', group: 'staff' },
  { label: '경찰 · 스캔', path: '/police/scan', group: 'staff' },
  { label: '관리자 로그인', path: '/admin/login', group: 'admin' },
]

const GROUP_COLORS: Record<QuickLink['group'], string> = {
  student: '#22c55e',
  staff: '#f59e0b',
  admin: '#3b82f6',
}

export function PreviewClient() {
  const [deviceName, setDeviceName] = useState(DEVICES[2].name)
  const [rotated, setRotated] = useState(false)
  const [path, setPath] = useState('/police')
  const [pendingPath, setPendingPath] = useState('/police')
  const [reloadKey, setReloadKey] = useState(0)
  const [dualView, setDualView] = useState(false)
  const [secondPath, setSecondPath] = useState('/police/courses')

  const device = useMemo(
    () => DEVICES.find((item) => item.name === deviceName) ?? DEVICES[2],
    [deviceName],
  )

  const width = rotated ? device.height : device.width
  const height = rotated ? device.width : device.height

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = pendingPath.trim() || '/'
    setPath(normalized.startsWith('/') ? normalized : `/${normalized}`)
  }

  function openInNewTab() {
    window.open(path, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#0f172a',
        padding: 24,
        color: '#e2e8f0',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <style>{'@keyframes preview-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        <header style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, letterSpacing: 3, color: '#fbbf24', fontWeight: 700, margin: 0 }}>
            DEV ONLY
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '4px 0 0' }}>모바일 프리뷰</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '6px 0 0' }}>
            학생/스태프 페이지를 가상 iPhone 프레임으로 확인합니다. 개발 환경에서만 접근 가능합니다.
          </p>
        </header>

        <section
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <select
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
            style={controlStyle}
          >
            {DEVICES.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} ({item.width} × {item.height})
              </option>
            ))}
          </select>

          <button type="button" onClick={() => setRotated((value) => !value)} style={buttonStyle}>
            {rotated ? '세로로' : '가로로'} 회전
          </button>

          <button type="button" onClick={() => setReloadKey((value) => value + 1)} style={buttonStyle}>
            새로고침
          </button>

          <button type="button" onClick={openInNewTab} style={buttonStyle}>
            새 탭에서 열기
          </button>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 12px',
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 8,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={dualView}
              onChange={(event) => setDualView(event.target.checked)}
            />
            듀얼 뷰
          </label>
        </section>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}
        >
          <input
            type="text"
            value={pendingPath}
            onChange={(event) => setPendingPath(event.target.value)}
            placeholder="/police/courses"
            style={{ ...controlStyle, flex: 1, minWidth: 260 }}
          />
          <button
            type="submit"
            style={{ ...buttonStyle, background: '#3b82f6', borderColor: '#3b82f6', fontWeight: 600 }}
          >
            이동
          </button>
        </form>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
          {QUICK_LINKS.map((link) => (
            <button
              key={link.path}
              type="button"
              onClick={() => {
                setPath(link.path)
                setPendingPath(link.path)
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                background: path === link.path ? GROUP_COLORS[link.group] : '#1e293b',
                color: '#fff',
                border: `1px solid ${GROUP_COLORS[link.group]}66`,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {link.label}
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 32,
            justifyContent: 'center',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <DeviceFrame
            device={device}
            width={width}
            height={height}
            rotated={rotated}
            src={path}
            reloadKey={reloadKey}
            label={`주 화면 · ${path}`}
          />

          {dualView ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <input
                type="text"
                value={secondPath}
                onChange={(event) => setSecondPath(event.target.value)}
                style={{ ...controlStyle, width: Math.min(width + 24, 320) }}
              />
              <DeviceFrame
                device={device}
                width={width}
                height={height}
                rotated={rotated}
                src={secondPath}
                reloadKey={reloadKey}
                label={`보조 화면 · ${secondPath}`}
              />
            </div>
          ) : null}
        </div>

        <footer style={{ marginTop: 28, textAlign: 'center', fontSize: 12, color: '#64748b' }}>
          <p style={{ margin: 0 }}>
            현재 URL:{' '}
            <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 4 }}>{path}</code>
          </p>
          <p style={{ margin: '8px 0 0' }}>
            iframe은 쿠키·세션을 공유하므로 먼저 학생/스태프 로그인을 해두면 상태가 유지됩니다.
            카메라 QR 스캐너는 iframe에서 제한될 수 있으니 실제 테스트는 새 탭에서 여세요.
          </p>
        </footer>
      </div>
    </div>
  )
}

function DeviceFrame(props: {
  device: Device
  width: number
  height: number
  rotated: boolean
  src: string
  reloadKey: number
  label: string
}) {
  const { device, width, height, rotated, src, reloadKey, label } = props
  const framePadding = 12
  const outerRadius = device.cornerRadius + framePadding
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
  }, [reloadKey, src])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          padding: framePadding,
          background: 'linear-gradient(145deg, #334155, #1e293b)',
          borderRadius: outerRadius,
          boxShadow: '0 25px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
          border: '3px solid #475569',
        }}
      >
        <div
          style={{
            position: 'relative',
            width,
            height,
            borderRadius: device.cornerRadius,
            overflow: 'hidden',
            background: '#000',
          }}
        >
          {device.hasNotch && !rotated ? (
            <div
              style={{
                position: 'absolute',
                top: 10,
                left: '50%',
                transform: 'translateX(-50%)',
                width: Math.min(120, width * 0.32),
                height: 28,
                background: '#000',
                borderRadius: 20,
                zIndex: 10,
                pointerEvents: 'none',
              }}
            />
          ) : null}
          {loading ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 5,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                background: 'linear-gradient(180deg, rgba(2,6,23,0.88), rgba(15,23,42,0.94))',
                color: '#e2e8f0',
                fontSize: 13,
                letterSpacing: '-0.01em',
                textAlign: 'center',
                padding: 20,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '3px solid rgba(255,255,255,0.2)',
                  borderTopColor: '#38bdf8',
                  animation: 'preview-spin 0.8s linear infinite',
                }}
              />
              <div>
                <div style={{ fontWeight: 700 }}>프리뷰 불러오는 중</div>
                <div style={{ marginTop: 4, color: '#94a3b8', fontSize: 12 }}>
                  개발 서버 첫 진입 시 2~5초 정도 걸릴 수 있습니다.
                </div>
              </div>
            </div>
          ) : null}
          <iframe
            key={`${src}-${reloadKey}`}
            src={src}
            style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
            title={label}
            allow="camera; clipboard-write; clipboard-read"
            onLoad={() => setLoading(false)}
          />
        </div>
      </div>
      <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{label}</p>
    </div>
  )
}

const controlStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  background: '#1e293b',
  color: '#fff',
  border: '1px solid #334155',
  fontSize: 13,
  outline: 'none',
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  background: '#1e293b',
  color: '#fff',
  border: '1px solid #334155',
  fontSize: 13,
  cursor: 'pointer',
}
