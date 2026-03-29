'use server'

import { revalidateTag } from 'next/cache'

export type CacheTag = 'students' | 'materials' | 'popups' | 'app-config'

export async function invalidateCache(tag: CacheTag | 'all') {
  if (tag === 'all') {
    revalidateTag('students')
    revalidateTag('materials')
    revalidateTag('popups')
    revalidateTag('app-config')
    return
  }

  revalidateTag(tag)
}
