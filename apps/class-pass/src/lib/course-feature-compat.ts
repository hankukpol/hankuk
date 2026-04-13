const EXAM_DELIVERY_FEATURE_KEYS = [
  'feature_exam_delivery_mode',
  'feature_weekday_color',
  'feature_anti_forgery_motion',
] as const

const DESIGNATED_SEAT_FEATURE_KEYS = [
  'feature_designated_seat',
  'designated_seat_open',
] as const

export const EXAM_DELIVERY_FEATURE_WARNING =
  '시험 배부 모드 관련 DB 컬럼이 아직 없어 기본 강좌 정보만 저장했습니다. supabase/migrations/202604100001_exam_delivery_mode.sql 을 적용한 뒤 다시 저장해 주세요.'

export const DESIGNATED_SEAT_FEATURE_WARNING =
  '지정좌석 관련 DB 컬럼이 아직 없어 기본 강좌 정보만 저장했습니다. supabase/migrations/202604110002_designated_seats.sql 을 적용한 뒤 다시 저장해 주세요.'

function stripKeys<T extends Record<string, unknown>, K extends readonly string[]>(payload: T, keys: K) {
  const next = { ...payload }

  for (const key of keys) {
    delete next[key]
  }

  return next
}

function hasColumns(record: Record<string, unknown>, keys: readonly string[]) {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
}

function containsColumns(record: Record<string, unknown>, keys: readonly string[]) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(record, key))
}

export function stripExamDeliveryFeatureFields<T extends Record<string, unknown>>(payload: T) {
  return stripKeys(payload, EXAM_DELIVERY_FEATURE_KEYS)
}

export function hasExamDeliveryFeatureColumns(record: Record<string, unknown>) {
  return hasColumns(record, EXAM_DELIVERY_FEATURE_KEYS)
}

export function containsExamDeliveryFeatureFields(record: Record<string, unknown>) {
  return containsColumns(record, EXAM_DELIVERY_FEATURE_KEYS)
}

export function stripDesignatedSeatFeatureFields<T extends Record<string, unknown>>(payload: T) {
  return stripKeys(payload, DESIGNATED_SEAT_FEATURE_KEYS)
}

export function hasDesignatedSeatFeatureColumns(record: Record<string, unknown>) {
  return hasColumns(record, DESIGNATED_SEAT_FEATURE_KEYS)
}

export function containsDesignatedSeatFeatureFields(record: Record<string, unknown>) {
  return containsColumns(record, DESIGNATED_SEAT_FEATURE_KEYS)
}

export function isExamDeliveryFeatureColumnError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as {
    code?: string
    message?: string
    details?: string | null
    hint?: string | null
  }

  const text = [candidate.code, candidate.message, candidate.details, candidate.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    text.includes('feature_exam_delivery_mode')
    || text.includes('feature_weekday_color')
    || text.includes('feature_anti_forgery_motion')
    || candidate.code === '42703'
    || candidate.code === 'PGRST204'
  )
}

export function isDesignatedSeatFeatureColumnError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as {
    code?: string
    message?: string
    details?: string | null
    hint?: string | null
  }

  const text = [candidate.code, candidate.message, candidate.details, candidate.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    text.includes('feature_designated_seat')
    || text.includes('designated_seat_open')
    || candidate.code === '42703'
    || candidate.code === 'PGRST204'
  )
}

export function mergeFeatureWarnings(warnings: string[]) {
  return [...new Set(warnings.filter(Boolean))].join(' ')
}
