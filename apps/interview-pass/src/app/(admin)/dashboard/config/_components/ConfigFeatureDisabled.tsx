'use client'

import Link from 'next/link'
import { useTenantConfig } from '@/components/TenantProvider'
import FeatureDisabledPanel from '@/components/FeatureDisabledPanel'
import { withTenantPrefix } from '@/lib/tenant'

type ConfigFeatureDisabledProps = {
  title: string
  description: string
}

export default function ConfigFeatureDisabled({
  title,
  description,
}: ConfigFeatureDisabledProps) {
  const tenant = useTenantConfig()

  return (
    <FeatureDisabledPanel
      title={title}
      description={description}
      action={
        <Link
          href={withTenantPrefix('/dashboard/config/features', tenant.type)}
          className="inline-flex rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
        >
          기능 설정으로 이동
        </Link>
      }
    />
  )
}
