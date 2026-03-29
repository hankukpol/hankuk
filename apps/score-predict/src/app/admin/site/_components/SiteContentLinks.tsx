"use client";

import Link from "next/link";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import { useAdminSiteFeatures } from "@/hooks/use-admin-site-features";
import { withTenantPrefix } from "@/lib/tenant";

export default function SiteContentLinks() {
  const tenant = useTenantConfig();
  const { features } = useAdminSiteFeatures();

  if (features.banners && features.notices) {
    return (
      <p className="mt-1 text-sm text-slate-600">
        배너는{" "}
        <Link
          href={withTenantPrefix("/admin/banners", tenant.type)}
          className="font-semibold text-slate-800 underline"
        >
          배너 관리
        </Link>
        , 공지사항은{" "}
        <Link
          href={withTenantPrefix("/admin/notices", tenant.type)}
          className="font-semibold text-slate-800 underline"
        >
          공지사항 관리
        </Link>
        에서 설정합니다.
      </p>
    );
  }

  if (features.banners) {
    return (
      <p className="mt-1 text-sm text-slate-600">
        배너는{" "}
        <Link
          href={withTenantPrefix("/admin/banners", tenant.type)}
          className="font-semibold text-slate-800 underline"
        >
          배너 관리
        </Link>
        에서 설정합니다.
      </p>
    );
  }

  if (features.notices) {
    return (
      <p className="mt-1 text-sm text-slate-600">
        공지사항은{" "}
        <Link
          href={withTenantPrefix("/admin/notices", tenant.type)}
          className="font-semibold text-slate-800 underline"
        >
          공지사항 관리
        </Link>
        에서 설정합니다.
      </p>
    );
  }

  return (
    <p className="mt-1 text-sm text-slate-600">
      콘텐츠 편집 도구는 기능 설정에 맞춰 지점별로 직접 켜고 끌 수 있습니다.
    </p>
  );
}
