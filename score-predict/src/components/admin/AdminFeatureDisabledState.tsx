import Link from "next/link";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import {
  ADMIN_SITE_FEATURES,
  type AdminSiteFeatureKey,
} from "@/lib/admin-site-features.shared";
import { withTenantPrefix } from "@/lib/tenant";

export default function AdminFeatureDisabledState({
  feature,
}: {
  feature: AdminSiteFeatureKey;
}) {
  const featureMeta = ADMIN_SITE_FEATURES[feature];
  const tenant = useTenantConfig();

  return (
    <section className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
          기능 비활성화
        </p>
        <h1 className="mt-3 text-xl font-semibold text-amber-950">
          {featureMeta.disabledTitle}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">
          {featureMeta.disabledDescription}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href={withTenantPrefix("/admin/site/features", tenant.type)}
          className="inline-flex items-center rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700"
        >
          기능 설정으로 이동
        </Link>
        <Link
          href={withTenantPrefix("/admin/site", tenant.type)}
          className="inline-flex items-center rounded-md border border-amber-300 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100"
        >
          사이트 설정 허브로 이동
        </Link>
      </div>
    </section>
  );
}
