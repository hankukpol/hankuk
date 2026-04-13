'use client'

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
    return `rgba(26,35,126,${alpha})`
  }

  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`
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

  return buildTone(courseTheme, getContrastText(courseTheme))
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

export function ExamDeliveryPassView({
  data,
  currentTime,
  courseTheme,
  tenantAppName: _tenantAppName,
  status,
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
  extraContent?: React.ReactNode
  onBack: () => void
  onOpenNotice: () => void
  onOpenRefund: () => void
}) {
  const motionEnabled = status === 'eligible' && data.course.feature_anti_forgery_motion
  void _tenantAppName
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
  const dday = data.course.feature_dday ? calculateDday(data.course.target_date) : null
  const ddayLabel = data.course.target_date_label || '시험일'

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
      className={`flex min-h-dvh flex-col ${motionEnabled ? 'exam-delivery-breathe' : 'bg-white'}`}
      style={{
        '--breathe-bg': theme.bg,
        '--breathe-text': theme.text,
        ...(!motionEnabled ? {} : { backgroundColor: theme.bg, color: theme.text }),
      } as React.CSSProperties}
    >
      <style>{`
        @keyframes exam-delivery-breathe {
          0%, 100% { background-color: var(--breathe-bg); color: var(--breathe-text); }
          50% { background-color: #ffffff; color: #111111; }
        }
        .exam-delivery-breathe {
          animation: exam-delivery-breathe 1.5s ease-in-out infinite;
        }
        .exam-delivery-breathe *:not(.breathe-keep) {
          color: inherit !important;
        }
        .exam-delivery-breathe [class*="border-gray"] {
          border-color: rgba(128,128,128,0.25) !important;
        }
      `}</style>

      <div
        style={motionEnabled ? { color: 'inherit' } : { backgroundColor: theme.bg, color: theme.text }}
      >
        <div className="px-4 py-5">
          <div className="flex items-center justify-between">
            <button type="button" onClick={onBack} className="text-sm font-medium" style={{ color: motionEnabled ? 'inherit' : theme.text }}>
              ← 목록
            </button>
            <span className="text-xs font-semibold" style={{ color: motionEnabled ? 'inherit' : theme.muted, opacity: motionEnabled ? 0.82 : 1 }}>
              {formatCourseTypeLabel(data.course.course_type)}
            </span>
          </div>

          <div className="mt-5 text-center">
            <h1 className="break-keep text-[28px] font-black leading-tight">{data.course.name}</h1>
            <p className="mt-2 text-base font-semibold" style={{ color: motionEnabled ? 'inherit' : theme.muted, opacity: motionEnabled ? 0.82 : 1 }}>
              {formatLiveDateTime(currentTime)}
            </p>
            {dday ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
                <span className="text-2xl font-black">{dday}</span>
                <span className="text-sm font-semibold" style={{ opacity: 0.85 }}>{ddayLabel}까지 파이팅!</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <section className="border-t border-gray-100 p-4">
        <div
          className="mb-3 rounded-xl px-4 py-3 text-sm font-semibold"
          style={{ backgroundColor: theme.soft, color: '#111827', border: `1px solid ${theme.line}` }}
        >
          <div className="flex items-center justify-between gap-3">
            <span>{statusConfig.message}</span>
            <span className="breathe-keep shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: theme.bg, color: theme.text }}>
              {statusConfig.badge}
            </span>
          </div>
        </div>

        <h2 className="mb-3 text-sm font-bold" style={{ color: courseTheme }}>학생 정보</h2>
        <table className="w-full text-sm">
          <tbody>
            {studentFields.map(({ label, value }) => (
              <tr key={`${label}-${value}`} className="border-b border-gray-100 last:border-0">
                <td className="w-20 py-3 pr-3 text-gray-500">{label}</td>
                <td className="py-3 font-semibold text-gray-900">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {showSeatAssignments ? (
        <section className="border-t border-gray-100 p-4">
          <h2 className="mb-3 text-sm font-bold" style={{ color: courseTheme }}>
            좌석 배정 <span className="ml-1 text-xs font-normal text-gray-400">{data.subjects.length}과목</span>
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {data.subjects.map((subject) => (
              <div key={subject.id} className="border border-gray-100 px-4 py-4 text-center">
                <p className="text-xs font-medium text-gray-500">{subject.name}</p>
                <p className="mt-3 text-[28px] font-black text-gray-900">{seatMap.get(subject.id) ?? '-'}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {extraContent}

      {hasChatLink ? (
        <div className="mt-auto px-4 pb-2">
          <a
            href={data.course.kakao_chat_url!}
            target="_blank"
            rel="noopener noreferrer"
            className="breathe-keep flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold"
            style={{ backgroundColor: '#FEE500', color: '#191919' }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="#191919">
              <path d="M12 3C6.477 3 2 6.463 2 10.691c0 2.734 1.811 5.126 4.535 6.482-.145.53-.93 3.408-.965 3.627 0 0-.02.164.087.227.106.063.231.03.231.03.305-.043 3.535-2.313 4.094-2.71.655.098 1.33.15 2.018.15 5.523 0 10-3.463 10-7.806C22 6.463 17.523 3 12 3" />
            </svg>
            카카오톡 단톡방 참여
          </a>
        </div>
      ) : null}

      {hasNotice || hasRefund ? (
        <div className={`flex gap-3 px-4 pb-2 ${hasChatLink ? '' : 'mt-auto'}`}>
          {hasNotice ? (
            <button
              type="button"
              onClick={onOpenNotice}
              className="breathe-keep flex-1 py-3 text-sm font-medium"
              style={{ backgroundColor: theme.soft, color: '#111827', border: `1px solid ${theme.line}` }}
            >
              공지사항
            </button>
          ) : null}
          {hasRefund ? (
            <button
              type="button"
              onClick={onOpenRefund}
              className="breathe-keep flex-1 py-3 text-sm font-medium"
              style={{ backgroundColor: theme.soft, color: '#111827', border: `1px solid ${theme.line}` }}
            >
              환불 규정
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="px-4 pb-6 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="breathe-keep w-full border border-gray-200 py-3 text-sm text-gray-500"
        >
          강좌 목록으로 돌아가기
        </button>
      </div>
    </div>
  )
}
