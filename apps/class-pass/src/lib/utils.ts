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
