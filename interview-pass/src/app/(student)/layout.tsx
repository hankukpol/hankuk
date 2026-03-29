import { unstable_cache } from 'next/cache'
import { createServerClient, hasServerSupabaseEnv } from '@/lib/supabase/server'
import { getTenantConfigByType } from '@/lib/tenant'
import { getServerTenantConfig, getServerTenantType } from '@/lib/tenant.server'

export const dynamic = 'force-dynamic'

const getThemeConfig = unstable_cache(
  async (division: 'police' | 'fire') => {
    const tenant = getTenantConfigByType(division)
    const defaultThemeConfig = {
      app_name: tenant.defaultAppName,
      theme_color: '#1a237e',
    }

    if (!hasServerSupabaseEnv()) {
      return defaultThemeConfig
    }

    const db = createServerClient()
    const { data } = await db
      .from('app_config')
      .select('config_key, config_value')
      .in('config_key', ['app_name', 'theme_color', `${division}::app_name`, `${division}::theme_color`])

    const map: Record<string, string> = {}
    for (const row of data ?? []) {
      map[row.config_key] = (row.config_value as string).replace(/^"|"$/g, '')
    }

    return {
      app_name: map[`${division}::app_name`] ?? map.app_name ?? defaultThemeConfig.app_name,
      theme_color: map[`${division}::theme_color`] ?? map.theme_color ?? defaultThemeConfig.theme_color,
    }
  },
  ['app-config'],
  { tags: ['app-config'], revalidate: 600 },
)

export async function generateMetadata() {
  const division = await getServerTenantType()
  const cfg = await getThemeConfig(division)
  return { title: cfg.app_name }
}

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getServerTenantConfig()
  const cfg = await getThemeConfig(tenant.type)

  return (
    <main
      className="min-h-dvh bg-white"
      style={{ '--theme': cfg.theme_color } as React.CSSProperties}
    >
      <div className="mx-auto w-full max-w-none md:max-w-[768px]">
        {children}
      </div>
    </main>
  )
}
