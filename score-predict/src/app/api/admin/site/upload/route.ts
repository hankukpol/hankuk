import { NextRequest, NextResponse } from "next/server";
import { isSiteSettingsSectionEnabled } from "@/app/admin/site/_lib/site-settings-sections";
import { requireAdminRoute } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { getSiteSettingsUncached, upsertSiteSettings } from "@/lib/site-settings";
import { deleteUploadedFileByPublicUrl, saveImageUpload, validateImageFile } from "@/lib/upload";

export const runtime = "nodejs";

const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

async function safeDeleteUploadedFile(publicUrl: string | null | undefined, context: string): Promise<void> {
  if (!publicUrl) return;

  try {
    await deleteUploadedFileByPublicUrl(publicUrl);
  } catch (cleanupError) {
    console.error(`${context} 정리 중 오류가 발생했습니다.`, cleanupError);
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;

  let uploadedImageUrl: string | null = null;
  let settingsUpdated = false;

  try {
    const settings = await getSiteSettingsUncached();
    if (!isSiteSettingsSectionEnabled(settings, "basic")) {
      return NextResponse.json(
        { error: "현재 지점에서는 기본 사이트 설정을 사용할 수 없습니다." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "업로드할 파일이 필요합니다." }, { status: 400 });
    }

    const validation = await validateImageFile(file, { maxBytes: MAX_UPLOAD_SIZE });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const existing = await prisma.siteSetting.findUnique({
      where: { key: "site.bannerImageUrl" },
      select: { value: true },
    });

    const savedImage = await saveImageUpload({
      file,
      prefix: "site",
      uploadSubdir: "banners",
      maxBytes: MAX_UPLOAD_SIZE,
    });
    const publicUrl = savedImage.publicUrl;
    uploadedImageUrl = publicUrl;

    await upsertSiteSettings([{ key: "site.bannerImageUrl", value: publicUrl }]);
    settingsUpdated = true;

    if (existing?.value && existing.value !== publicUrl) {
      await safeDeleteUploadedFile(existing.value, "사이트 배너 교체 후 기존 이미지");
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      message: "배너 이미지가 업로드되었습니다.",
    });
  } catch (error) {
    if (uploadedImageUrl && !settingsUpdated) {
      await safeDeleteUploadedFile(uploadedImageUrl, "사이트 배너 업로드 실패 후 신규 파일");
    }
    console.error("배너 이미지 업로드 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "배너 이미지 업로드에 실패했습니다." }, { status: 500 });
  }
}
