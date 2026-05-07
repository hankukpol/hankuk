const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const BIRTH_DATE_PATTERN = /^\d{6}$/
const PHONE_ALLOWED_PATTERN = /^[0-9+\-\s()]{10,20}$/

function hasValidDateParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  )
}

export function isValidDateKey(value: string) {
  if (!DATE_KEY_PATTERN.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  return hasValidDateParts(year, month, day)
}

export function isValidBirthDateKey(value: string) {
  if (!BIRTH_DATE_PATTERN.test(value)) {
    return false
  }

  const year = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))

  return hasValidDateParts(1900 + year, month, day) || hasValidDateParts(2000 + year, month, day)
}

export function isLikelyPhoneNumber(value: string) {
  const normalized = value.trim()
  if (!PHONE_ALLOWED_PATTERN.test(normalized)) {
    return false
  }

  const digits = normalized.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15
}
