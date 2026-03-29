import { NextRequest, NextResponse } from "next/server";
import {
  getSiteSettingsSection,
  isSiteSettingsSectionEnabled,
  isSiteSettingsSectionKey,
} from "@/app/admin/site/_lib/site-settings-sections";
import { requireAdminRoute } from "@/lib/admin-auth";
import { getSiteSettingsUncached, normalizeSiteSettingUpdateEntries, upsertSiteSettings } from "@/lib/site-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SiteSettingUpdatePayload {
  settings?: Record<string, unknown>;
}

export async function GET() {
  return handleGet();
}

async function handleGet() {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;

  try {
    const settings = await getSiteSettingsUncached();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("사이트 설정 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "사이트 설정 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;

  try {
    const sectionKey = request.nextUrl.searchParams.get("section");
    if (!sectionKey || !isSiteSettingsSectionKey(sectionKey)) {
      return NextResponse.json(
        { error: "저장할 섹션 정보가 올바르지 않습니다." },
        { status: 400 }
      );
    }

    const body = (await request.json()) as SiteSettingUpdatePayload;
    if (!body.settings || typeof body.settings !== "object") {
      return NextResponse.json({ error: "settings 객체가 필요합니다." }, { status: 400 });
    }

    const currentSettings = await getSiteSettingsUncached();
    if (!isSiteSettingsSectionEnabled(currentSettings, sectionKey)) {
      return NextResponse.json(
        { error: "현재 지점에서는 이 사이트 설정 섹션을 사용할 수 없습니다." },
        { status: 403 }
      );
    }

    const normalized = normalizeSiteSettingUpdateEntries(body.settings);
    if (!normalized.data) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const section = getSiteSettingsSection(sectionKey);
    const invalidEntry = normalized.data.find(
      (entry) => !section.settingKeys.includes(entry.key)
    );
    if (invalidEntry) {
      return NextResponse.json(
        { error: `${invalidEntry.key} 설정은 ${section.title}에서 저장할 수 없습니다.` },
        { status: 400 }
      );
    }

    await upsertSiteSettings(normalized.data);

    return NextResponse.json({
      success: true,
      updatedCount: normalized.data.length,
      message: "사이트 설정이 저장되었습니다.",
    });
  } catch (error) {
    console.error("사이트 설정 저장 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "사이트 설정 저장에 실패했습니다." }, { status: 500 });
  }
}
