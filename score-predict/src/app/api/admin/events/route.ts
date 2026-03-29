import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { revalidateEventsCache } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import type { TenantType } from "@/lib/tenant";
import { getServerTenantType } from "@/lib/tenant.server";
import { deleteUploadedFileByPublicUrl, saveImageUpload, validateImageFile } from "@/lib/upload";

export const runtime = "nodejs";

function parseEventId(request: NextRequest): number | null {
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("id");
  if (!rawId) return null;
  const parsed = Number(rawId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseSortOrder(value: FormDataEntryValue | null): number | null {
  if (value === null) return null;
  const parsed = Number(String(value));
  if (!Number.isInteger(parsed) || parsed < 0) return null;
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

function parseDateOrNull(value: FormDataEntryValue | null): Date | null | "invalid" {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "invalid";
  return parsed;
}

function normalizeBgColor(value: FormDataEntryValue | null): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(normalized)) {
    return null;
  }
  return normalized;
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

async function safeDeleteUploadedFile(publicUrl: string | null | undefined, context: string): Promise<void> {
  if (!publicUrl) return;

  try {
    await deleteUploadedFileByPublicUrl(publicUrl);
  } catch (cleanupError) {
    console.error(`${context} 정리 중 오류가 발생했습니다.`, cleanupError);
  }
}

function safeRevalidateEventsCache(tenantType: TenantType): void {
  try {
    revalidateEventsCache(tenantType);
  } catch (error) {
    console.error("이벤트 캐시 무효화 중 오류가 발생했습니다.", error);
  }
}

export async function GET() {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("events");
  if (featureError) return featureError;

  const tenantType = await getServerTenantType();

  try {
    const events = await prisma.eventSection.findMany({
      where: { tenantType },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    return NextResponse.json({ events });
  } catch (error) {
    console.error("이벤트 목록 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "이벤트 목록 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("events");
  if (featureError) return featureError;

  const tenantType = await getServerTenantType();

  let uploadedImageUrl: string | null = null;
  let isCreated = false;

  try {
    const formData = await request.formData();
    const title = normalizeOptionalText(formData.get("title"));
    const description = normalizeOptionalText(formData.get("description"));
    const linkUrl = normalizeOptionalText(formData.get("linkUrl"));
    const linkText = normalizeOptionalText(formData.get("linkText"));
    const bgColor = normalizeBgColor(formData.get("bgColor")) ?? "#ffffff";
    const isActive = parseBooleanOrNull(formData.get("isActive")) ?? true;
    const sortOrder = parseSortOrder(formData.get("sortOrder")) ?? 0;
    const startAt = parseDateOrNull(formData.get("startAt"));
    const endAt = parseDateOrNull(formData.get("endAt"));

    if (!title) {
      return NextResponse.json({ error: "이벤트 제목을 입력해 주세요." }, { status: 400 });
    }
    if (!isValidLinkUrl(linkUrl)) {
      return NextResponse.json({ error: "링크 URL 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (startAt === "invalid" || endAt === "invalid") {
      return NextResponse.json({ error: "이벤트 기간 날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (startAt && endAt && startAt.getTime() > endAt.getTime()) {
      return NextResponse.json({ error: "이벤트 시작일은 종료일보다 늦을 수 없습니다." }, { status: 400 });
    }

    let imageUrl: string | null = null;
    const image = formData.get("image");
    if (image instanceof File && image.size > 0) {
      const validation = await validateImageFile(image);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      const savedImage = await saveImageUpload({
        file: image,
        prefix: `${tenantType}-event`,
        uploadSubdir: "events",
      });
      imageUrl = savedImage.publicUrl;
      uploadedImageUrl = savedImage.publicUrl;
    }

    const created = await prisma.eventSection.create({
      data: {
        tenantType,
        title,
        description,
        imageUrl,
        linkUrl,
        linkText,
        bgColor,
        isActive,
        sortOrder,
        startAt,
        endAt,
      },
    });
    isCreated = true;

    safeRevalidateEventsCache(tenantType);
    return NextResponse.json({ success: true, event: created }, { status: 201 });
  } catch (error) {
    if (uploadedImageUrl && !isCreated) {
      await safeDeleteUploadedFile(uploadedImageUrl, "이벤트 생성 실패 후 신규 업로드 파일");
    }
    console.error("이벤트 생성 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "이벤트 생성에 실패했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("events");
  if (featureError) return featureError;

  const eventId = parseEventId(request);
  if (!eventId) {
    return NextResponse.json({ error: "수정할 이벤트 ID가 필요합니다." }, { status: 400 });
  }

  const tenantType = await getServerTenantType();

  let uploadedImageUrl: string | null = null;
  let isUpdated = false;

  try {
    const existing = await prisma.eventSection.findFirst({
      where: {
        id: eventId,
        tenantType,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "수정할 이벤트를 찾을 수 없습니다." }, { status: 404 });
    }

    const formData = await request.formData();
    const titleEntry = formData.get("title");
    const descriptionEntry = formData.get("description");
    const linkUrlEntry = formData.get("linkUrl");
    const linkTextEntry = formData.get("linkText");
    const bgColorEntry = formData.get("bgColor");
    const isActiveEntry = formData.get("isActive");
    const sortOrderEntry = formData.get("sortOrder");
    const startAtEntry = formData.get("startAt");
    const endAtEntry = formData.get("endAt");

    const title = normalizeOptionalText(titleEntry);
    const description = normalizeOptionalText(descriptionEntry);
    const linkUrl = normalizeOptionalText(linkUrlEntry);
    const linkText = normalizeOptionalText(linkTextEntry);
    const bgColor = normalizeBgColor(bgColorEntry);
    const isActive = parseBooleanOrNull(isActiveEntry);
    const sortOrder = parseSortOrder(sortOrderEntry);
    const startAt = parseDateOrNull(startAtEntry);
    const endAt = parseDateOrNull(endAtEntry);
    const removeImage = parseBooleanOrNull(formData.get("removeImage")) === true;

    if (titleEntry !== null && !title) {
      return NextResponse.json({ error: "이벤트 제목을 입력해 주세요." }, { status: 400 });
    }
    if (bgColorEntry !== null && bgColor === null) {
      return NextResponse.json({ error: "배경색 형식이 올바르지 않습니다. (#ffffff 형식)" }, { status: 400 });
    }
    if (isActiveEntry !== null && isActive === null) {
      return NextResponse.json({ error: "isActive 값이 올바르지 않습니다." }, { status: 400 });
    }
    if (sortOrderEntry !== null && sortOrder === null) {
      return NextResponse.json({ error: "sortOrder는 0 이상의 정수여야 합니다." }, { status: 400 });
    }
    if (!isValidLinkUrl(linkUrl)) {
      return NextResponse.json({ error: "링크 URL 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (startAt === "invalid" || endAt === "invalid") {
      return NextResponse.json({ error: "이벤트 기간 날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const nextStartAt = startAtEntry === null ? existing.startAt : startAt;
    const nextEndAt = endAtEntry === null ? existing.endAt : endAt;
    if (nextStartAt && nextEndAt && nextStartAt.getTime() > nextEndAt.getTime()) {
      return NextResponse.json({ error: "이벤트 시작일은 종료일보다 늦을 수 없습니다." }, { status: 400 });
    }

    let nextImageUrl = existing.imageUrl;
    let shouldDeleteExistingImage = false;

    const image = formData.get("image");
    if (image instanceof File && image.size > 0) {
      const validation = await validateImageFile(image);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      const savedImage = await saveImageUpload({
        file: image,
        prefix: `${tenantType}-event`,
        uploadSubdir: "events",
      });
      nextImageUrl = savedImage.publicUrl;
      uploadedImageUrl = savedImage.publicUrl;
      shouldDeleteExistingImage = true;
    } else if (removeImage) {
      nextImageUrl = null;
      shouldDeleteExistingImage = true;
    }

    const updated = await prisma.eventSection.update({
      where: { id: eventId },
      data: {
        title: title ?? existing.title,
        description: description ?? null,
        imageUrl: nextImageUrl,
        linkUrl,
        linkText,
        bgColor: bgColor ?? existing.bgColor,
        isActive: isActive ?? existing.isActive,
        sortOrder: sortOrder ?? existing.sortOrder,
        startAt: nextStartAt,
        endAt: nextEndAt,
      },
    });
    isUpdated = true;

    if (shouldDeleteExistingImage && existing.imageUrl && existing.imageUrl !== nextImageUrl) {
      await safeDeleteUploadedFile(existing.imageUrl, "이벤트 수정 후 기존 이미지");
    }

    safeRevalidateEventsCache(tenantType);
    return NextResponse.json({ success: true, event: updated });
  } catch (error) {
    if (uploadedImageUrl && !isUpdated) {
      await safeDeleteUploadedFile(uploadedImageUrl, "이벤트 수정 실패 후 신규 업로드 파일");
    }
    console.error("이벤트 수정 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "이벤트 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("events");
  if (featureError) return featureError;

  const eventId = parseEventId(request);
  if (!eventId) {
    return NextResponse.json({ error: "삭제할 이벤트 ID가 필요합니다." }, { status: 400 });
  }

  const tenantType = await getServerTenantType();

  try {
    const existing = await prisma.eventSection.findFirst({
      where: {
        id: eventId,
        tenantType,
      },
      select: {
        id: true,
        imageUrl: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "삭제할 이벤트를 찾을 수 없습니다." }, { status: 404 });
    }

    const deleted = await prisma.eventSection.delete({
      where: { id: eventId },
    });

    if (deleted.imageUrl) {
      await safeDeleteUploadedFile(deleted.imageUrl, "이벤트 삭제 후 이미지");
    }

    safeRevalidateEventsCache(tenantType);
    return NextResponse.json({ success: true, deletedId: eventId });
  } catch (error) {
    console.error("이벤트 삭제 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "이벤트 삭제에 실패했습니다." }, { status: 500 });
  }
}
