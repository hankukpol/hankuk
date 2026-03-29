"use client";

import Link from "next/link";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import { withTenantPrefix } from "@/lib/tenant";
import {
  getVisibleSiteSettingsSections,
  getSiteSettingsOverviewItems,
  isSiteSettingsOverviewEnabled,
} from "../_lib/site-settings-sections";
import { useSiteSettingsState } from "../_lib/use-site-settings-manager";
import SiteSettingsNotice from "./SiteSettingsNotice";
import SiteSettingsSectionDisabledState from "./SiteSettingsSectionDisabledState";

export default function SiteSettingsHub() {
  const tenant = useTenantConfig();
  const { settings, isLoading, notice } = useSiteSettingsState(
    "사이트 설정을 불러오지 못했습니다."
  );

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm font-semibold tracking-[0.24em] text-slate-500">
          사이트 설정 허브
        </p>
        <h2 className="mt-3 text-2xl font-bold text-slate-950">사이트 설정 허브</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          현재 저장된 사이트 설정 상태를 불러오는 중입니다.
        </p>
      </section>
    );
  }

  if (!isSiteSettingsOverviewEnabled(settings)) {
    return (
      <SiteSettingsSectionDisabledState
        title="사이트 설정 개요가 비활성화되었습니다."
        description="이 지점에서는 사이트 설정 허브를 사용하지 않습니다. 기능 설정에서 다시 켜면 개요 카드와 섹션 허브가 복구됩니다."
      />
    );
  }

  const overviewItems = getSiteSettingsOverviewItems(settings);
  const visibleSections = getVisibleSiteSettingsSections(settings);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold tracking-[0.24em] text-slate-500">
          사이트 설정 허브
        </p>
        <h2 className="mt-3 text-2xl font-bold text-slate-950">사이트 설정 허브</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          사이트 기본 문구, 운영 정책, 공개 메뉴, 자동 합격컷 규칙을 관리자 화면에서 직접 조정할 수 있도록 섹션 단위로 정리했습니다.
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          배너와 공지사항 같은 콘텐츠는 기존 관리자 메뉴에서 관리하고, 여기서는 사이트 동작과 노출 정책 위주로 운영합니다.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {overviewItems.map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold tracking-[0.2em] text-slate-500">
                {item.label}
              </p>
              <p className="mt-3 text-2xl font-bold text-slate-950">{item.value}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <SiteSettingsNotice notice={notice} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {visibleSections.map((section) => (
          <Link
            key={section.key}
            href={withTenantPrefix(section.href, tenant.type)}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-xs font-semibold tracking-[0.2em] text-slate-500">
              {section.navLabel}
            </p>
            <h3 className="mt-4 text-xl font-bold text-slate-950">{section.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{section.description}</p>

            <ul className="mt-5 space-y-2 text-sm text-slate-700">
              {section.getSummary(settings).map((summary) => (
                <li key={summary} className="rounded-md bg-slate-50 px-3 py-2">
                  {summary}
                </li>
              ))}
            </ul>

            <span className="mt-5 inline-flex items-center text-sm font-medium text-slate-900">
              설정 열기
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
