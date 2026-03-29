"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import BannerHtmlEditor from "@/components/admin/BannerHtmlEditor";
import ConfirmModal from "@/components/admin/ConfirmModal";
import { useTenantConfig } from "@/components/providers/TenantProvider";
import useConfirmModal from "@/hooks/useConfirmModal";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { escapeHtmlAttribute, sanitizeBannerHtml } from "@/lib/sanitize-banner-html";
import { withTenantPrefix } from "@/lib/tenant";

type BannerZone = "hero" | "middle" | "bottom";

interface BannerItem {
  id: number;
  zone: BannerZone;
  imageUrl: string | null;
  mobileImageUrl: string | null;
  linkUrl: string | null;
  altText: string;
  htmlContent: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface BannersResponse {
  banners: BannerItem[];
}

interface ZoneFormState {
  id: number | null;
  htmlContent: string;
  mobileImageUrl: string | null;
  altText: string;
  isActive: boolean;
  sortOrder: number;
}

type NoticeState =
  | {
      type: "success" | "error";
      message: string;
    }
  | null;

const ZONE_ORDER: BannerZone[] = ["hero", "middle", "bottom"];

const ZONE_LABELS: Record<BannerZone, string> = {
  hero: "배너존 A: 상단 히어로",
  middle: "배너존 B: 중간 프로모션",
  bottom: "배너존 C: 하단 CTA",
};

const ZONE_HINTS: Record<BannerZone, string> = {
  hero: "권장 해상도 1920x600~800",
  middle: "권장 해상도 1920x300~500",
  bottom: "권장 해상도 1920x300~500",
};

function createEmptyZoneState(sortOrder = 0): ZoneFormState {
  return {
    id: null,
    htmlContent: "",
    mobileImageUrl: null,
    altText: "",
    isActive: true,
    sortOrder,
  };
}

function toZoneState(banner: BannerItem | undefined): ZoneFormState {
  if (!banner) return createEmptyZoneState();

  let htmlContent = banner.htmlContent ? sanitizeBannerHtml(banner.htmlContent) : "";

  // Legacy image-only banners are converted into editor HTML to keep admin UX consistent.
  if (!htmlContent && banner.imageUrl) {
    const safeImageUrl = escapeHtmlAttribute(banner.imageUrl);
    const safeAltText = escapeHtmlAttribute(banner.altText || "배너 이미지");
    const imgTag = `<img src="${safeImageUrl}" alt="${safeAltText}" style="width: 100%; height: auto;" />`;
    const wrappedHtml = banner.linkUrl
      ? `<a href="${escapeHtmlAttribute(banner.linkUrl)}">${imgTag}</a>`
      : imgTag;
    htmlContent = sanitizeBannerHtml(wrappedHtml);
  }

  return {
    id: banner.id,
    htmlContent,
    mobileImageUrl: banner.mobileImageUrl ?? null,
    altText: banner.altText,
    isActive: banner.isActive,
    sortOrder: banner.sortOrder,
  };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function AdminBannersPage() {
  const tenant = useTenantConfig();
  const { enabled: bannersEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("banners");
  const [allBanners, setAllBanners] = useState<BannerItem[]>([]);
  const [zoneStates, setZoneStates] = useState<Record<BannerZone, ZoneFormState>>({
    hero: createEmptyZoneState(),
    middle: createEmptyZoneState(),
    bottom: createEmptyZoneState(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [savingZone, setSavingZone] = useState<BannerZone | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [showPreview, setShowPreview] = useState<Record<BannerZone, boolean>>({
    hero: false,
    middle: false,
    bottom: false,
  });
  const [uploadingMobileZone, setUploadingMobileZone] = useState<BannerZone | null>(null);
  const { confirm, modalProps } = useConfirmModal();

  const hasAnyBanner = useMemo(() => allBanners.length > 0, [allBanners.length]);

  async function loadBanners() {
    setIsLoading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/banners", { method: "GET", cache: "no-store" });
      const data = (await response.json()) as BannersResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "배너 목록을 불러오지 못했습니다.");
      }

      const sorted = [...(data.banners ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
      setAllBanners(sorted);

      const primaryByZone: Partial<Record<BannerZone, BannerItem>> = {};
      for (const zone of ZONE_ORDER) {
        primaryByZone[zone] = sorted.find((item) => item.zone === zone);
      }

      setZoneStates({
        hero: toZoneState(primaryByZone.hero),
        middle: toZoneState(primaryByZone.middle),
        bottom: toZoneState(primaryByZone.bottom),
      });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "배너 목록을 불러오지 못했습니다.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!bannersEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    void loadBanners();
  }, [bannersEnabled, isFeatureLoading]);

  function bannersByZone(zone: BannerZone): BannerItem[] {
    return allBanners.filter((item) => item.zone === zone);
  }

  function setCreateMode(zone: BannerZone) {
    const nextSort = bannersByZone(zone).length;
    setZoneStates((prev) => ({
      ...prev,
      [zone]: createEmptyZoneState(nextSort),
    }));
  }

  function setEditMode(zone: BannerZone, banner: BannerItem) {
    setZoneStates((prev) => ({
      ...prev,
      [zone]: toZoneState(banner),
    }));
  }

  function updateZoneState(zone: BannerZone, next: Partial<ZoneFormState>) {
    setZoneStates((prev) => ({
      ...prev,
      [zone]: {
        ...prev[zone],
        ...next,
      },
    }));
  }

  async function handleMobileImageUpload(zone: BannerZone, file: File) {
    setUploadingMobileZone(zone);
    setNotice(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/admin/banners/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { success?: boolean; url?: string; error?: string };
      if (!response.ok || !data.success || !data.url) {
        throw new Error(data.error ?? "모바일 이미지 업로드에 실패했습니다.");
      }
      updateZoneState(zone, { mobileImageUrl: data.url });
      setNotice({ type: "success", message: "모바일 이미지가 업로드되었습니다. 저장 버튼을 눌러 반영하세요." });
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "모바일 이미지 업로드에 실패했습니다.",
      });
    } finally {
      setUploadingMobileZone(null);
    }
  }

  async function handleSaveZone(zone: BannerZone) {
    const current = zoneStates[zone];
    if (!current.id && !current.htmlContent.trim()) {
      setNotice({
        type: "error",
        message: `${ZONE_LABELS[zone]}은 배너 콘텐츠가 필요합니다.`,
      });
      return;
    }

    const ok = await confirm({
      title: current.id ? "배너 저장" : "배너 등록",
      description: current.id ? `${ZONE_LABELS[zone]} 배너를 저장하시겠습니까?` : `${ZONE_LABELS[zone]} 배너를 등록하시겠습니까?`,
    });
    if (!ok) return;

    setSavingZone(zone);
    setNotice(null);

    try {
      const body = {
        zone,
        htmlContent: current.htmlContent,
        mobileImageUrl: current.mobileImageUrl,
        altText: current.altText.trim(),
        isActive: current.isActive,
        sortOrder: current.sortOrder,
      };

      const endpoint = current.id ? `/api/admin/banners?id=${current.id}` : "/api/admin/banners";
      const method = current.id ? "PUT" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "배너 저장에 실패했습니다.");
      }

      setNotice({
        type: "success",
        message: `${ZONE_LABELS[zone]} 저장이 완료되었습니다.`,
      });
      await loadBanners();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "배너 저장에 실패했습니다.",
      });
    } finally {
      setSavingZone(null);
    }
  }

  async function handleDeleteBanner(id: number) {
    const ok = await confirm({ title: "배너 삭제", description: "선택한 배너를 삭제하시겠습니까?", variant: "danger" });
    if (!ok) return;

    setDeletingId(id);
    setNotice(null);

    try {
      const response = await fetch(`/api/admin/banners?id=${id}`, { method: "DELETE" });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "배너 삭제에 실패했습니다.");
      }

      setNotice({
        type: "success",
        message: "배너가 삭제되었습니다.",
      });
      await loadBanners();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "배너 삭제에 실패했습니다.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  if (isFeatureLoading || (bannersEnabled && isLoading)) {
    return <p className="text-sm text-slate-600">배너 관리 데이터를 불러오는 중입니다...</p>;
  }

  if (!bannersEnabled) {
    return <AdminFeatureDisabledState feature="banners" />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">배너 관리</h1>
        <p className="mt-1 text-sm text-slate-600">
          존별로 배너를 다중 등록하고 정렬 순서/활성 상태를 운영할 수 있습니다.
          에디터에서 이미지를 삽입하고, 소스 보기(&lt;/&gt;)로 HTML을 직접 편집할 수 있습니다.
        </p>
        <p className="mt-1 text-sm text-slate-600">
          관련 메뉴:{" "}
          <Link
            className="font-semibold underline"
            href={withTenantPrefix("/admin/events", tenant.type)}
          >
            이벤트 관리
          </Link>{" "}
          /{" "}
          <Link
            className="font-semibold underline"
            href={withTenantPrefix("/admin/site", tenant.type)}
          >
            사이트 설정
          </Link>
        </p>
      </header>

      {notice ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            notice.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      {!hasAnyBanner ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          등록된 배너가 없습니다.
        </p>
      ) : null}

      {ZONE_ORDER.map((zone) => {
        const current = zoneStates[zone];
        const zoneBannerList = bannersByZone(zone);
        const isSaving = savingZone === zone;

        return (
          <section key={zone} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{ZONE_LABELS[zone]}</h2>
                <p className="text-xs text-slate-500">{ZONE_HINTS[zone]}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setCreateMode(zone)}>
                + 새 배너
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-slate-700">
                편집 대상: {current.id ? `(ID ${current.id})` : "(신규)"} / 에디터 코드 보기로 HTML 소스 편집
              </p>
              <BannerHtmlEditor
                value={current.htmlContent}
                onChange={(content) => updateZoneState(zone, { htmlContent: content })}
                height="350"
              />
            </div>

            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">모바일 배너 이미지</p>
                <p className="text-xs text-slate-500">모바일(768px 이하)에서 PC용 HTML 배너 대신 표시됩니다. 권장 해상도 750×800~1000px</p>
              </div>
              {current.mobileImageUrl ? (
                <div className="flex items-start gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={current.mobileImageUrl}
                    alt="모바일 배너 미리보기"
                    className="h-24 w-auto rounded-md border border-slate-200 object-contain"
                  />
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-slate-600 break-all">{current.mobileImageUrl}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-rose-600 hover:text-rose-700"
                      onClick={() => updateZoneState(zone, { mobileImageUrl: null })}
                    >
                      모바일 이미지 제거
                    </Button>
                  </div>
                </div>
              ) : null}
              <div>
                <input
                  type="file"
                  accept="image/*"
                  id={`${zone}-mobile-image`}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleMobileImageUpload(zone, file);
                    event.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingMobileZone === zone}
                  onClick={() => document.getElementById(`${zone}-mobile-image`)?.click()}
                >
                  {uploadingMobileZone === zone ? "업로드 중..." : current.mobileImageUrl ? "모바일 이미지 변경" : "모바일 이미지 업로드"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPreview((prev) => ({ ...prev, [zone]: !prev[zone] }))}
              >
                {showPreview[zone] ? "미리보기 숨기기" : "미리보기 보기"}
              </Button>
              {showPreview[zone] && current.htmlContent.trim() ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-2 text-xs font-semibold text-slate-500">미리보기</p>
                  <div
                    className="overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: sanitizeBannerHtml(current.htmlContent) }}
                  />
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor={`${zone}-alt-text`}>대체 텍스트 (SEO)</Label>
                <Input
                  id={`${zone}-alt-text`}
                  value={current.altText}
                  onChange={(event) => updateZoneState(zone, { altText: event.target.value })}
                  placeholder={`${ZONE_LABELS[zone]} 이미지`}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${zone}-sort-order`}>정렬 순서</Label>
                <Input
                  id={`${zone}-sort-order`}
                  type="number"
                  min={0}
                  step={1}
                  value={current.sortOrder}
                  onChange={(event) =>
                    updateZoneState(zone, {
                      sortOrder: Math.max(0, Number(event.target.value) || 0),
                    })
                  }
                />
              </div>

              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={current.isActive}
                    onChange={(event) => updateZoneState(zone, { isActive: event.target.checked })}
                  />
                  활성화
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void handleSaveZone(zone)} disabled={isSaving}>
                {isSaving ? "저장 중..." : "저장"}
              </Button>
              {current.id ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleDeleteBanner(current.id as number)}
                  disabled={deletingId === current.id}
                >
                  {deletingId === current.id ? "삭제 중..." : "현재 편집 배너 삭제"}
                </Button>
              ) : null}
            </div>

            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">등록된 배너 목록 ({zoneBannerList.length})</p>
              {zoneBannerList.length < 1 ? (
                <p className="text-sm text-slate-500">등록된 배너가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {zoneBannerList.map((banner) => (
                    <div
                      key={banner.id}
                      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        {banner.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={banner.imageUrl}
                            alt={banner.altText || "배너"}
                            className="h-14 w-24 rounded-md border border-slate-200 object-cover"
                          />
                        ) : (
                          <span className="flex h-14 w-24 items-center justify-center rounded-md border border-slate-200 bg-slate-100 text-xs text-slate-500">
                            HTML 배너
                          </span>
                        )}
                        <div className="text-xs text-slate-600">
                          <p>ID #{banner.id}</p>
                          <p>정렬 {banner.sortOrder}</p>
                          <p>
                            {banner.isActive ? "활성" : "비활성"} / {formatDateTime(banner.updatedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => setEditMode(zone, banner)}>
                          불러오기
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="text-rose-600 hover:text-rose-700"
                          onClick={() => void handleDeleteBanner(banner.id)}
                          disabled={deletingId === banner.id}
                        >
                          삭제
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        );
      })}

      <ConfirmModal {...modalProps} />
    </div>
  );
}
