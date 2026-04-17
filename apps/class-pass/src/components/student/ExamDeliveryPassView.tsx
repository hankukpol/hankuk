'use client'

import type * as React from 'react'
import type { PassPayload } from '@/types/database'
import { formatCourseTypeLabel } from '@/lib/utils'

type DeliveryStatus = 'eligible' | 'inactive' | 'closed'

type ThemeTone = {
  bg: string
  text: string
  muted: string
  soft: string
  line: string
}

const DEFAULT_ACCENT = '#0071e3'

const WEEKDAY_PALETTE = [
  { bg: '#f97316', text: '#111827' }, // 일
  { bg: '#ef4444', text: '#ffffff' }, // 월
  { bg: '#facc15', text: '#111827' }, // 화
  { bg: '#22c55e', text: '#052e16' }, // 수
  { bg: '#3b82f6', text: '#ffffff' }, // 목
  { bg: '#1d4ed8', text: '#ffffff' }, // 금
  { bg: '#7c3aed', text: '#ffffff' }, // 토
] as const

function hexToRgb(value: string) {
  const normalized = value.replace('#', '').trim()
  const hex = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized

  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return null
  }

  const parsed = Number.parseInt(hex, 16)
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  }
}

function toRgba(hex: string, alpha: number) {
  const rgb = hexToRgb(hex)
  if (!rgb) {
    return `rgba(0,113,227,${alpha})`
  }

  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`
}

function normalizeThemeColor(value: string) {
  const trimmed = value.trim()
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? trimmed : DEFAULT_ACCENT
}

function getContrastText(background: string) {
  const rgb = hexToRgb(background)
  if (!rgb) {
    return '#ffffff'
  }

  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255
  return luminance > 0.64 ? '#111827' : '#ffffff'
}

function buildTone(background: string, text: string): ThemeTone {
  return {
    bg: background,
    text,
    muted: text === '#ffffff' ? 'rgba(255,255,255,0.82)' : 'rgba(17,24,39,0.72)',
    soft: toRgba(background, text === '#ffffff' ? 0.12 : 0.16),
    line: toRgba(background, text === '#ffffff' ? 0.2 : 0.22),
  }
}

function resolveTheme({
  currentTime,
  courseTheme,
  useWeekdayTheme,
  status,
}: {
  currentTime: Date
  courseTheme: string
  useWeekdayTheme: boolean
  status: DeliveryStatus
}) {
  if (status === 'inactive') {
    return buildTone('#b91c1c', '#ffffff')
  }

  if (status === 'closed') {
    return buildTone('#9a3412', '#ffffff')
  }

  if (useWeekdayTheme) {
    const palette = WEEKDAY_PALETTE[currentTime.getDay()] ?? WEEKDAY_PALETTE[0]
    return buildTone(palette.bg, palette.text)
  }

  const accent = normalizeThemeColor(courseTheme)
  return buildTone(accent, getContrastText(accent))
}

function formatLiveDateTime(currentTime: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(currentTime)
}

function calculateDday(targetDate: string | null) {
  if (!targetDate) return null
  const target = new Date(targetDate)
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  const diff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'D-Day'
  return diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`
}

function StatusCard({
  accent,
  badge,
  message,
}: {
  accent: ThemeTone
  badge: string
  message: string
}) {
  return (
    <section className="student-card exam-delivery-signal overflow-hidden rounded-[12px] px-4 py-4">
      <div
        className="h-1 w-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${accent.bg} 0%, ${toRgba(accent.bg, 0.2)} 100%)` }}
      />
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <p className="student-eyebrow student-eyebrow-light">인증 상태</p>
          <h2 className="student-display-compact mt-2">현장 확인 상태</h2>
          <p className="student-body mt-2">{message}</p>
        </div>
        <span
          className="student-chip shrink-0 border-0 px-4 py-2 text-[13px]"
          style={{ backgroundColor: accent.bg, color: accent.text }}
        >
          {badge}
        </span>
      </div>
    </section>
  )
}

function StudentInfoTable({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <section className="student-card px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="student-eyebrow student-eyebrow-light">수강생 정보</p>
          <h2 className="student-display-compact mt-2">응시 정보</h2>
        </div>
        <span className="student-chip">본인 확인</span>
      </div>

      <div className="mt-3 overflow-hidden rounded-[12px] bg-[var(--student-surface-soft)]">
        <table className="w-full text-[14px]">
          <tbody>
            {rows.map(({ label, value }) => (
              <tr key={`${label}-${value}`} className="border-b border-[var(--student-line)] last:border-b-0">
                <td className="w-[80px] px-3 py-2.5 text-[var(--student-text-muted)]">{label}</td>
                <td className="px-3 py-2.5 text-right font-semibold tracking-[-0.02em] text-[var(--student-text)]">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SeatAssignments({
  subjects,
  seatMap,
}: {
  subjects: PassPayload['subjects']
  seatMap: Map<number, string | null>
}) {
  return (
    <section className="student-card px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="student-eyebrow student-eyebrow-light">좌석 배정</p>
          <h2 className="student-display-compact mt-2">좌석 배정</h2>
        </div>
        <span className="student-chip">{subjects.length}과목</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {subjects.map((subject) => (
          <div key={subject.id} className="student-card-muted px-3 py-3 text-center">
            <p className="text-[11px] text-[var(--student-text-muted)]">{subject.name}</p>
            <p className="mt-1.5 text-[24px] font-semibold leading-[1] tracking-[-0.05em] text-[var(--student-text)]">
              {seatMap.get(subject.id) ?? '-'}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

function BottomActions({
  hasChatLink,
  chatUrl,
  hasExtraSiteLink,
  extraSiteUrl,
  extraSiteLabel,
  hasNotice,
  hasRefund,
  onBack,
  onOpenNotice,
  onOpenRefund,
}: {
  hasChatLink: boolean
  chatUrl?: string | null
  hasExtraSiteLink: boolean
  extraSiteUrl?: string | null
  extraSiteLabel?: string | null
  hasNotice: boolean
  hasRefund: boolean
  onBack: () => void
  onOpenNotice: () => void
  onOpenRefund: () => void
}) {
  const resolvedExtraSiteLabel = extraSiteLabel?.trim() || '추가 사이트 이동'

  return (
    <div className="mt-auto px-4 pt-4 sm:px-5">
      {hasChatLink && chatUrl ? (
        <a
          href={chatUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="student-pill-button mb-2 flex w-full gap-2 text-[#191919]"
          style={{ backgroundColor: '#FEE500' }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="#191919" aria-hidden="true">
            <path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.734 1.811 5.126 4.535 6.482-.145.53-.93 3.408-.965 3.627 0 0-.02.164.087.227.106.063.231.03.231.03.305-.043 3.535-2.313 4.094-2.71.655.098 1.33.15 2.018.15 5.523 0 10-3.463 10-7.806C22 6.463 17.523 3 12 3" />
          </svg>
          카카오톡 단톡방 참여
        </a>
      ) : null}

      {hasExtraSiteLink && extraSiteUrl ? (
        <a
          href={extraSiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="student-pill-button student-pill-primary mb-2 flex w-full items-center justify-center gap-2"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M14 5h5v5" />
            <path d="M10 14 19 5" />
            <path d="M19 14v5h-14v-14h5" />
          </svg>
          {resolvedExtraSiteLabel}
        </a>
      ) : null}

      {hasNotice || hasRefund ? (
        <div className="mb-2 flex gap-2">
          {hasNotice ? (
            <button type="button" onClick={onOpenNotice} className="student-pill-button student-pill-secondary flex-1">
              공지사항
            </button>
          ) : null}
          {hasRefund ? (
            <button type="button" onClick={onOpenRefund} className="student-pill-button student-pill-secondary flex-1">
              환불 규정
            </button>
          ) : null}
        </div>
      ) : null}

      <button type="button" onClick={onBack} className="student-pill-button student-pill-outline w-full">
        강좌 목록으로 돌아가기
      </button>
    </div>
  )
}

export function ExamDeliveryPassView({
  data,
  currentTime,
  courseTheme,
  tenantAppName,
  status,
  motionPaused = false,
  extraContent,
  onBack,
  onOpenNotice,
  onOpenRefund,
}: {
  data: PassPayload
  currentTime: Date
  courseTheme: string
  tenantAppName: string
  status: DeliveryStatus
  motionPaused?: boolean
  extraContent?: React.ReactNode
  onBack: () => void
  onOpenNotice: () => void
  onOpenRefund: () => void
}) {
  const motionEnabled = status === 'eligible' && data.course.feature_anti_forgery_motion
  const overlayEnabled = motionEnabled && !motionPaused
  const theme = resolveTheme({
    currentTime,
    courseTheme,
    useWeekdayTheme: data.course.feature_weekday_color,
    status,
  })
  const showSeatAssignments = data.course.feature_seat_assignment || data.seatAssignments.length > 0
  const seatMap = new Map(data.seatAssignments.map((seat) => [seat.subject_id, seat.seat_number]))
  const hasNotice = Boolean(data.course.feature_notices && data.course.notice_visible && data.course.notice_content)
  const hasRefund = Boolean(data.course.feature_refund_policy && data.course.refund_policy)
  const hasChatLink = Boolean(data.course.kakao_chat_url)
  const hasExtraSiteLink = Boolean(data.course.extra_site_url)
  const dday = data.course.feature_dday ? calculateDday(data.course.target_date) : null
  const ddayLabel = data.course.target_date_label || '시험일'
  const flashAccent = theme.text === '#ffffff' ? 'rgba(255,255,255,0.82)' : toRgba(theme.bg, 0.88)
  const flashWash = theme.text === '#ffffff' ? 'rgba(255,255,255,0.16)' : toRgba(theme.bg, 0.2)
  const flashOverlay = theme.text === '#ffffff' ? 'rgba(255,255,255,0.18)' : toRgba(theme.bg, 0.2)
  const flashOverlayPeak = theme.text === '#ffffff' ? 'rgba(255,255,255,0.34)' : toRgba(theme.bg, 0.38)

  const statusConfig = {
    eligible: {
      badge: '응시 가능',
      message: '현재 사용 가능한 수강증입니다. 조교에게 이 화면을 바로 보여주세요.',
    },
    inactive: {
      badge: '응시 불가',
      message: '현재 응시가 제한된 상태입니다. 관리자에게 문의해 주세요.',
    },
    closed: {
      badge: '확인 시간 아님',
      message: data.course.feature_time_window
        ? `입장 가능 시간은 ${data.course.time_window_start || '--:--'} ~ ${data.course.time_window_end || '--:--'} 입니다.`
        : '현재는 수강증 확인 가능 시간이 아닙니다.',
    },
  }[status]

  const studentFields = [
    { label: '수험번호', value: data.enrollment.exam_number || '-' },
    { label: '이름', value: data.enrollment.name || '-' },
    { label: '연락처', value: data.enrollment.phone || '-' },
    ...(data.enrollment.region ? [{ label: '응시청', value: data.enrollment.region }] : []),
    ...(data.enrollment.series ? [{ label: '구분', value: data.enrollment.series }] : []),
    ...(data.enrollment.gender ? [{ label: '성별', value: data.enrollment.gender }] : []),
    ...(data.course.enrollment_fields ?? []).map((field) => ({
      label: field.label,
      value: (data.enrollment.custom_data ?? {})[field.key] || '-',
    })),
    { label: '상태', value: statusConfig.badge },
  ]

  return (
    <div
      className={`student-page student-safe-bottom relative isolate min-h-dvh overflow-hidden ${motionEnabled ? 'exam-delivery-breathe' : ''}`}
      style={{
        '--exam-accent': theme.bg,
        '--exam-accent-soft': theme.soft,
        '--exam-accent-line': theme.line,
        '--exam-accent-glow': toRgba(theme.bg, 0.42),
        '--exam-accent-glow-strong': toRgba(theme.bg, 0.72),
        '--exam-accent-flash': flashAccent,
        '--exam-accent-flash-wash': flashWash,
        '--exam-accent-overlay': flashOverlay,
        '--exam-accent-overlay-peak': flashOverlayPeak,
        '--exam-accent-tint': toRgba(theme.bg, 0.1),
        '--exam-accent-tint-mid': toRgba(theme.bg, 0.16),
        '--exam-accent-tint-peak': toRgba(theme.bg, 0.26),
      } as React.CSSProperties}
    >
      <style>{`
        @keyframes exam-screen-breathe {
          0%, 100% {
            opacity: 0.28;
            box-shadow:
              inset 0 0 0 0 transparent,
              inset 0 0 140px 24px transparent;
          }
          50% {
            opacity: 0.72;
            box-shadow:
              inset 0 0 0 1px rgba(255, 255, 255, 0.12),
              inset 0 0 320px 96px var(--exam-accent-overlay-peak);
          }
        }
        .exam-delivery-breathe {
          background:
            radial-gradient(circle at top, var(--exam-accent-flash-wash) 0%, transparent 30%),
            linear-gradient(180deg, #050505 0%, #131316 52%, #09090b 100%) !important;
        }
        .exam-delivery-page-glow {
          position: absolute;
          inset: 0;
          z-index: 6;
          pointer-events: none;
          background:
            radial-gradient(circle at 50% 16%, var(--exam-accent-overlay-peak) 0%, transparent 42%),
            radial-gradient(circle at 20% 70%, var(--exam-accent-tint-mid) 0%, transparent 30%),
            radial-gradient(circle at 80% 78%, var(--exam-accent-tint-peak) 0%, transparent 32%),
            linear-gradient(180deg, var(--exam-accent-overlay) 0%, var(--exam-accent-flash-wash) 32%, var(--exam-accent-flash-wash) 68%, var(--exam-accent-overlay) 100%);
          background-color: var(--exam-accent-overlay);
          animation: exam-screen-breathe 1.6s ease-in-out infinite;
          will-change: opacity;
        }
        .exam-delivery-page-glow::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.04) 24%, rgba(255, 255, 255, 0.04) 76%, rgba(255, 255, 255, 0.12) 100%);
          opacity: 1;
        }
        .exam-delivery-signal {
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .exam-delivery-breathe .student-hero,
        .exam-delivery-breathe .student-card,
        .exam-delivery-breathe .student-card-muted {
          position: relative;
          z-index: 1;
        }
      `}</style>

      {overlayEnabled ? <div className="exam-delivery-page-glow" aria-hidden="true" /> : null}

      <div className="relative z-[1] flex min-h-dvh flex-col">
        <section
          className="student-hero px-4 pb-6 pt-4 sm:px-5"
          style={{
            background: '#000000',
          }}
        >
          <div className="relative z-[1] flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="text-[13px] font-semibold tracking-[-0.02em] text-white/56 transition-opacity hover:text-white"
            >
              목록으로
            </button>
            <span className="student-chip student-chip-dark">{formatCourseTypeLabel(data.course.course_type)}</span>
          </div>

          <div className="relative z-[1] mt-5">
            <p className="student-eyebrow student-eyebrow-dark">{tenantAppName}</p>
            <h1 className="student-display mt-2">모바일 수강증</h1>
            <p className="student-body student-body-dark mt-2 break-keep">{data.course.name}</p>
            <p className="student-body student-body-dark mt-1">{formatLiveDateTime(currentTime)}</p>
          </div>

          <div className="relative z-[1] mt-4 flex flex-wrap gap-1.5">
            <span
              className="student-chip student-chip-dark"
              style={{ backgroundColor: theme.bg, color: theme.text }}
            >
              {statusConfig.badge}
            </span>
            {dday ? (
              <span className="student-chip student-chip-dark">
                {dday} · {ddayLabel}
              </span>
            ) : null}
            <span className="student-chip student-chip-dark">현장 확인</span>
          </div>
        </section>

        <div className="flex flex-col gap-3 px-4 pt-4 sm:px-5">
          <StatusCard accent={theme} badge={statusConfig.badge} message={statusConfig.message} />
          <StudentInfoTable rows={studentFields} />

          {showSeatAssignments ? <SeatAssignments subjects={data.subjects} seatMap={seatMap} /> : null}
        </div>

        {extraContent}

        <BottomActions
          hasChatLink={hasChatLink}
          chatUrl={data.course.kakao_chat_url}
          hasExtraSiteLink={hasExtraSiteLink}
          extraSiteUrl={data.course.extra_site_url}
          extraSiteLabel={data.course.extra_site_label}
          hasNotice={hasNotice}
          hasRefund={hasRefund}
          onBack={onBack}
          onOpenNotice={onOpenNotice}
          onOpenRefund={onOpenRefund}
        />
      </div>
    </div>
  )
}
