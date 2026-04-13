import 'server-only'

import { unstable_cache } from 'next/cache'
import type { PopupRow } from '@/lib/popups.shared'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'

export type { PopupRow } from '@/lib/popups.shared'

async function listPopupsByDivisionUncached(division: string): Promise<PopupRow[]> {
  const db = createServerClient()
  const data = unwrapSupabaseResult(
    'popups.list',
    await db
      .from('popup_content')
      .select('*')
      .eq('division', division)
      .order('type'),
  )

  return (data ?? []) as PopupRow[]
}

const getCachedPopupsByDivision = unstable_cache(
  async (division: string) => listPopupsByDivisionUncached(division),
  ['popups-by-division'],
  {
    revalidate: 15,
    tags: ['popups'],
  },
)

export async function listPopupsByDivision(division: string): Promise<PopupRow[]> {
  return getCachedPopupsByDivision(division)
}
