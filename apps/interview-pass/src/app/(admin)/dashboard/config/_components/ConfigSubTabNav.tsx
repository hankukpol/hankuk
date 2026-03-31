'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTenantConfig } from '@/components/TenantProvider'
import { useAppConfig } from '@/hooks/use-app-config'
import { stripTenantPrefix, withTenantPrefix } from '@/lib/tenant'
import { CONFIG_SECTIONS } from '../_lib/config-sections'

export default function ConfigSubTabNav() {
  const tenant = useTenantConfig()
  const pathname = stripTenantPrefix(usePathname())
  const { config, isLoading } = useAppConfig()
  const visibleSections = CONFIG_SECTIONS.filter(
    (section) => !section.feature || (!isLoading && config[section.feature]),
  )

  return (
    <nav className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
      <ul className="flex flex-wrap gap-2">
        {visibleSections.map((section) => {
          const active =
            section.href === '/dashboard/config'
              ? pathname === section.href
              : pathname.startsWith(section.href)

          return (
            <li key={section.href}>
              <Link
                href={withTenantPrefix(section.href, tenant.type)}
                className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#1a237e] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {section.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
