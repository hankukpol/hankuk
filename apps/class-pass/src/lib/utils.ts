import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { CourseType } from '@/types/database'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function normalizeExamNumber(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '')
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export function slugifyCourseName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatKoreanDate(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}.${get('month')}.${get('day')}`
}

export function formatKoreanMonthDay(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('month')}.${get('day')}`
}

// "26.05.11" 형식 (YY.MM.DD, 서울 시간 기준)
export function formatShortDate(value: string | null | undefined) {
  if (!value) return '-'
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year').slice(2)}.${get('month')}.${get('day')}`
}

// "010-9001-0012" 형식으로 변환 (숫자만 추출 후 구간 분리)
export function formatPhoneNumber(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  if (digits.length === 10 && digits.startsWith('02')) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  return value ?? ''
}

export function getTodayKey(tz = 'Asia/Seoul'): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: tz })
}

export function parsePositiveInt(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export function maskPhone(phone: string) {
  if (phone.length >= 10) {
    return `${phone.slice(0, 3)}-****-${phone.slice(-4)}`
  }

  return phone
}

export function formatCourseTypeLabel(value: CourseType) {
  switch (value) {
    case 'interview':
      return '면접'
    case 'mock_exam':
      return '모의고사'
    case 'lecture':
      return '강의'
    default:
      return '일반'
  }
}
