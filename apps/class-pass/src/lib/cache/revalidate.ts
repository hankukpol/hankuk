'use server'

import { revalidateTag } from 'next/cache'

export type CacheTag =
  | 'courses'
  | 'enrollments'
  | 'seats'
  | 'designated-seats'
  | 'attendance'
  | 'materials'
  | 'distribution-logs'
  | 'app-config'
  | 'branches'
  | 'operator-accounts'
  | 'staff-accounts'
  | 'popups'

export async function invalidateCache(tag: CacheTag | 'all') {
  if (tag === 'all') {
    revalidateTag('courses')
    revalidateTag('enrollments')
    revalidateTag('seats')
    revalidateTag('designated-seats')
    revalidateTag('attendance')
    revalidateTag('materials')
    revalidateTag('distribution-logs')
    revalidateTag('app-config')
    revalidateTag('branches')
    revalidateTag('operator-accounts')
    revalidateTag('staff-accounts')
    revalidateTag('popups')
    return
  }

  revalidateTag(tag)
}
