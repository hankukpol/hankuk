'use server'

import { revalidateTag } from 'next/cache'

export type CacheTag =
  | 'courses'
  | 'enrollments'
  | 'seats'
  | 'designated-seats'
  | 'materials'
  | 'distribution-logs'
  | 'app-config'

export async function invalidateCache(tag: CacheTag | 'all') {
  if (tag === 'all') {
    revalidateTag('courses')
    revalidateTag('enrollments')
    revalidateTag('seats')
    revalidateTag('designated-seats')
    revalidateTag('materials')
    revalidateTag('distribution-logs')
    revalidateTag('app-config')
    return
  }

  revalidateTag(tag)
}
