import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export function formatKoreanDate(date: Date = new Date()): string {
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d} (${days[date.getDay()]})`
}

export function getTodayKey(tz = 'Asia/Seoul'): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: tz })
}
