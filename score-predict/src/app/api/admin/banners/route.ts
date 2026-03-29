import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { isBannerZone, revalidateBannerCache } from "@/lib/banners";
import { prisma } from "@/lib/prisma";
import { sanitizeBannerHtml } from "@/lib/sanitize-banner-html";
import type { TenantType } from "@/lib/tenant";
import { getServerTenantType } from "@/lib/tenant.server";
import { deleteUploadedFileByPublicUrl, saveImageUpload, validateImageFile } from "@/lib/upload";

export const runtime = "nodejs";

function parseBannerId(request: NextRequest): number | null {
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("id");
  if (!rawId) return null;
  const parsed = Number(rawId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseSortOrder(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const parsed = Number(String(value));
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function parseBooleanOrNull(value: FormDataEntryValue | null): boolean | null {
  if (value === null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function normalizeOptionalText(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function isValidLinkUrl(value: string | null): boolean {
  if (!value) return true;
  if (value.startsWith("/")) return !value.startsWith("//");

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isRecordNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

function isJsonContentType(request: NextRequest): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("application/json");
}

async function safeDeleteUploadedFile(publicUrl: string | null | undefined, context: string): Promise<void> {
  if (!publicUrl) return;

  try {
    await deleteUploadedFileByPublicUrl(publicUrl);
  } catch (cleanupError) {
    console.error(`${context} 정리 중 오류가 발생했습니다.`, cleanupError);
  }
}

function safeRevalidateBannerCache(tenantType: TenantType): void {
  try {
    revalidateBannerCache(tenantType);
  } catch (error) {
    console.error("배너 캐시 무효화 중 오류가 발생했습니다.", error);
  }
}

export async function GET() {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("banners");
  if (featureError) return featureError;

  const tenantType = await getServerTenantType();

  try {
    const banners = await prisma.banner.findMany({
      where: { tenantType },
      orderBy: [{ zone: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ banners });
  } catch (error) {
    console.error("배너 목록 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "배너 목록 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("banners");
  if (featureError) return featureError;

  const tenantType = await getServerTenantType();

  if (isJsonContentType(request)) {
    return handlePostJson(request, tenantType);
  }

  return handlePostFormData(request, tenantType);
}

async function handlePostJson(request: NextRequest, tenantType: TenantType) {
  try {
    const body = await request.json();
    const zoneRaw = String(body.zone ?? "").trim();
    if (!isBannerZone(zoneRaw)) {
      return NextResponse.json({ error: "배너 구역(zone) 값이 올바르지 않습니다." }, { status: 400 });
    }

    const htmlContent = typeof body.htmlContent === "string" ? sanitizeBannerHtml(body.htmlContent) : "";
    if (!htmlContent.trim()) {
      return NextResponse.json({ error: "배너 HTML 콘텐츠가 비어 있습니다." }, { status: 400 });
    }

    const altText = typeof body.altText === "string" ? body.altText.trim() : "";
    const mobileImageUrl =
      typeof body.mobileImageUrl === "string" && body.mobileImageUrl.trim()
        ? body.mobileImageUrl.trim()
        : null;
    const sortOrder =
      typeof body.sortOrder === "number" && Number.isInteger(body.sortOrder) && body.sortOrder >= 0
        ? body.sortOrder
        : 0;
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;

    const created = await prisma.banner.create({
      data: {
        tenantType,
        zone: zoneRaw,
        imageUrl: null,
        mobileImageUrl,
        htmlContent,
        altText,
        isActive,
        sortOrder,
      },
    });

    safeRevalidateBannerCache(tenantType);

    return NextResponse.json({ success: true, banner: created }, { status: 201 });
  } catch (error) {
    console.error("배너 생성(HTML 모드) 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "배너 생성에 실패했습니다." }, { status: 500 });
  }
}

async function handlePostFormData(request: NextRequest, tenantType: TenantType) {
  let uploadedImageUrl: string | null = null;
  let isCreated = false;

  try {
    const formData = await request.formData();

    const zoneRaw = String(formData.get("zone") ?? "").trim();
    if (!isBannerZone(zoneRaw)) {
      return NextResponse.json({ error: "배너 구역(zone) 값이 올바르지 않습니다." }, { status: 400 });
    }

    const image = formData.get("image");
    if (!(image instanceof File)) {
      return NextResponse.json({ error: "업로드할 배너 이미지가 필요합니다." }, { status: 400 });
    }

    const imageValidation = await validateImageFile(image);
    if (!imageValidation.ok) {
      return NextResponse.json({ error: imageValidation.error }, { status: 400 });
    }

    const linkUrl = normalizeOptionalText(formData.get("linkUrl"));
    const altText = normalizeOptionalText(formData.get("altText")) ?? "";
    const sortOrder = parseSortOrder(formData.get("sortOrder"));
    const isActive = parseBooleanOrNull(formData.get("isActive"));

    if (!isValidLinkUrl(linkUrl)) {
      return NextResponse.json({ error: "배너 링크 URL 형식이 올바르지 않습니다." }, { status: 400 });
    }

    if (sortOrder === null && formData.get("sortOrder") !== null) {
      return NextResponse.json({ error: "sortOrder는 0 이상의 정수여야 합니다." }, { status: 400 });
    }

    if (isActive === null && formData.get("isActive") !== null) {
      return NextResponse.json({ error: "isActive 값이 올바르지 않습니다." }, { status: 400 });
    }

    const savedImage = await saveImageUpload({
      file: image,
      prefix: `${tenantType}-${zoneRaw}`,
      uploadSubdir: "banners",
    });
    uploadedImageUrl = savedImage.publicUrl;

    const created = await prisma.banner.create({
      data: {
        tenantType,
        zone: zoneRaw,
        imageUrl: savedImage.publicUrl,
        linkUrl,
        altText,
        isActive: isActive ?? true,
        sortOrder: sortOrder ?? 0,
      },
    });
    isCreated = true;

    safeRevalidateBannerCache(tenantType);

    return NextResponse.json(
      {
        success: true,
        banner: created,
      },
      { status: 201 }
    );
  } catch (error) {
    if (uploadedImageUrl && !isCreated) {
      await safeDeleteUploadedFile(uploadedImageUrl, "배너 생성 실패 후 업로드 파일");
    }
    console.error("배너 생성 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "배너 생성에 실패했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("banners");
  if (featureError) return featureError;

  const bannerId = parseBannerId(request);
  if (!bannerId) {
    return NextResponse.json({ error: "수정할 배너 ID가 필요합니다." }, { status: 400 });
  }

  const tenantType = await getServerTenantType();

  if (isJsonContentType(request)) {
    return handlePutJson(request, bannerId, tenantType);
  }

  return handlePutFormData(request, bannerId, tenantType);
}

async function handlePutJson(request: NextRequest, bannerId: number, tenantType: TenantType) {
  try {
    const existing = await prisma.banner.findFirst({
      where: {
        id: bannerId,
        tenantType,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "수정할 배너를 찾을 수 없습니다." }, { status: 404 });
    }

    const body = await request.json();

    const zoneRaw = typeof body.zone === "string" ? body.zone.trim() : null;
    if (zoneRaw !== null && !isBannerZone(zoneRaw)) {
      return NextResponse.json({ error: "배너 구역(zone) 값이 올바르지 않습니다." }, { status: 400 });
    }

    const htmlContent = typeof body.htmlContent === "string" ? sanitizeBannerHtml(body.htmlContent) : null;
    if (htmlContent !== null && !htmlContent.trim()) {
      return NextResponse.json({ error: "배너 HTML 콘텐츠가 비어 있습니다." }, { status: 400 });
    }

    const altText = typeof body.altText === "string" ? body.altText.trim() : undefined;
    const mobileImageUrl =
      typeof body.mobileImageUrl === "string" ? body.mobileImageUrl.trim() || null : undefined;
    const sortOrder =
      typeof body.sortOrder === "number" && Number.isInteger(body.sortOrder) && body.sortOrder >= 0
        ? body.sortOrder
        : undefined;
    const isActive = typeof body.isActive === "boolean" ? body.isActive : undefined;

    const shouldDeleteOldMobileImage =
      mobileImageUrl !== undefined &&
      existing.mobileImageUrl &&
      existing.mobileImageUrl !== mobileImageUrl;

    const updated = await prisma.banner.update({
      where: { id: bannerId },
      data: {
        zone: zoneRaw ?? existing.zone,
        htmlContent: htmlContent ?? existing.htmlContent,
        imageUrl: null,
        linkUrl: null,
        ...(altText !== undefined && { altText }),
        ...(mobileImageUrl !== undefined && { mobileImageUrl }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    if (shouldDeleteOldMobileImage) {
      await safeDeleteUploadedFile(existing.mobileImageUrl, "배너 수정 후 이전 모바일 이미지");
    }

    safeRevalidateBannerCache(tenantType);

    return NextResponse.json({ success: true, banner: updated });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      return NextResponse.json({ error: "수정할 배너를 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("배너 수정(HTML 모드) 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "배너 수정에 실패했습니다." }, { status: 500 });
  }
}

async function handlePutFormData(request: NextRequest, bannerId: number, tenantType: TenantType) {
  let uploadedImageUrl: string | null = null;
  let isUpdated = false;

  try {
    const existing = await prisma.banner.findFirst({
      where: {
        id: bannerId,
        tenantType,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "수정할 배너를 찾을 수 없습니다." }, { status: 404 });
    }

    const formData = await request.formData();

    const hasLinkUrl = formData.has("linkUrl");
    const zoneRaw = normalizeOptionalText(formData.get("zone"));
    if (zoneRaw !== null && !isBannerZone(zoneRaw)) {
      return NextResponse.json({ error: "배너 구역(zone) 값이 올바르지 않습니다." }, { status: 400 });
    }

    const linkUrl = normalizeOptionalText(formData.get("linkUrl"));
    const altText = normalizeOptionalText(formData.get("altText"));
    const sortOrder = parseSortOrder(formData.get("sortOrder"));
    const isActive = parseBooleanOrNull(formData.get("isActive"));

    if (hasLinkUrl && !isValidLinkUrl(linkUrl)) {
      return NextResponse.json({ error: "배너 링크 URL 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (sortOrder === null && formData.get("sortOrder") !== null) {
      return NextResponse.json({ error: "sortOrder는 0 이상의 정수여야 합니다." }, { status: 400 });
    }
    if (isActive === null && formData.get("isActive") !== null) {
      return NextResponse.json({ error: "isActive 값이 올바르지 않습니다." }, { status: 400 });
    }

    const image = formData.get("image");
    let nextImageUrl = existing.imageUrl;
    let shouldDeletePreviousImage = false;

    if (image instanceof File && image.size > 0) {
      const imageValidation = await validateImageFile(image);
      if (!imageValidation.ok) {
        return NextResponse.json({ error: imageValidation.error }, { status: 400 });
      }

      const savedImage = await saveImageUpload({
        file: image,
        prefix: `${tenantType}-${zoneRaw ?? existing.zone}`,
        uploadSubdir: "banners",
      });

      nextImageUrl = savedImage.publicUrl;
      uploadedImageUrl = savedImage.publicUrl;
      shouldDeletePreviousImage = true;
    }

    const updated = await prisma.banner.update({
      where: { id: bannerId },
      data: {
        zone: zoneRaw ?? existing.zone,
        imageUrl: nextImageUrl,
        linkUrl: hasLinkUrl ? linkUrl : existing.linkUrl,
        altText: altText ?? existing.altText,
        isActive: isActive ?? existing.isActive,
        sortOrder: sortOrder ?? existing.sortOrder,
      },
    });
    isUpdated = true;

    if (shouldDeletePreviousImage && existing.imageUrl !== nextImageUrl) {
      await safeDeleteUploadedFile(existing.imageUrl, "배너 수정 후 이전 이미지");
    }

    safeRevalidateBannerCache(tenantType);

    return NextResponse.json({
      success: true,
      banner: updated,
    });
  } catch (error) {
    if (uploadedImageUrl && !isUpdated) {
      await safeDeleteUploadedFile(uploadedImageUrl, "배너 수정 실패 후 신규 업로드 파일");
    }

    if (isRecordNotFoundError(error)) {
      return NextResponse.json({ error: "수정할 배너를 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("배너 수정 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "배너 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("banners");
  if (featureError) return featureError;

  const bannerId = parseBannerId(request);
  if (!bannerId) {
    return NextResponse.json({ error: "삭제할 배너 ID가 필요합니다." }, { status: 400 });
  }

  const tenantType = await getServerTenantType();

  try {
    const existing = await prisma.banner.findFirst({
      where: {
        id: bannerId,
        tenantType,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "삭제할 배너를 찾을 수 없습니다." }, { status: 404 });
    }

    const deleted = await prisma.banner.delete({
      where: { id: bannerId },
    });

    await safeDeleteUploadedFile(deleted.imageUrl, "배너 삭제 후 이미지");
    await safeDeleteUploadedFile(deleted.mobileImageUrl, "배너 삭제 후 모바일 이미지");
    safeRevalidateBannerCache(tenantType);

    return NextResponse.json({
      success: true,
      deletedId: bannerId,
    });
  } catch (error) {
    if (isRecordNotFoundError(error)) {
      return NextResponse.json({ error: "삭제할 배너를 찾을 수 없습니다." }, { status: 404 });
    }
    console.error("배너 삭제 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "배너 삭제에 실패했습니다." }, { status: 500 });
  }
}
