import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";
import { revalidateNoticeCache } from "@/lib/site-settings";
import { getServerTenantType } from "@/lib/tenant.server";

export const runtime = "nodejs";

interface NoticePayload {
  title?: unknown;
  content?: unknown;
  isActive?: unknown;
  priority?: unknown;
  startAt?: unknown;
  endAt?: unknown;
}

function parseNoticeId(request: NextRequest): number | null {
  const { searchParams } = new URL(request.url);
  const rawId = searchParams.get("id");
  if (!rawId) return null;

  const parsed = Number(rawId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function parsePriority(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

function parseDateTime(value: unknown): Date | null | "invalid" {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    return "invalid";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "invalid";
  }

  return parsed;
}

export async function GET() {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("notices");
  if (featureError) return featureError;

  const tenantType = await getServerTenantType();

  try {
    const notices = await prisma.notice.findMany({
      where: { tenantType },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });

    return NextResponse.json({ notices });
  } catch (error) {
    console.error("공지 목록 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "공지 목록 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("notices");
  if (featureError) return featureError;

  const tenantType = await getServerTenantType();

  try {
    const body = (await request.json()) as NoticePayload;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const isActive = parseBoolean(body.isActive);
    const priority = parsePriority(body.priority);
    const startAt = parseDateTime(body.startAt);
    const endAt = parseDateTime(body.endAt);

    if (!title) {
      return NextResponse.json({ error: "공지 제목을 입력해 주세요." }, { status: 400 });
    }
    if (!content) {
      return NextResponse.json({ error: "공지 내용을 입력해 주세요." }, { status: 400 });
    }
    if (isActive === null) {
      return NextResponse.json({ error: "isActive 값이 올바르지 않습니다." }, { status: 400 });
    }
    if (priority === null) {
      return NextResponse.json({ error: "priority 값은 정수여야 합니다." }, { status: 400 });
    }
    if (startAt === "invalid" || endAt === "invalid") {
      return NextResponse.json({ error: "공지 기간 날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }
    if (startAt && endAt && startAt.getTime() > endAt.getTime()) {
      return NextResponse.json({ error: "공지 시작일은 종료일보다 늦을 수 없습니다." }, { status: 400 });
    }

    const created = await prisma.notice.create({
      data: {
        tenantType,
        title,
        content,
        isActive,
        priority,
        startAt,
        endAt,
      },
    });

    revalidateNoticeCache(tenantType);

    return NextResponse.json(
      {
        success: true,
        notice: created,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("공지 생성 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "공지 생성에 실패했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("notices");
  if (featureError) return featureError;

  const noticeId = parseNoticeId(request);
  if (!noticeId) {
    return NextResponse.json({ error: "수정할 공지 ID가 필요합니다." }, { status: 400 });
  }

  const tenantType = await getServerTenantType();

  try {
    const body = (await request.json()) as NoticePayload;

    const updateData: {
      title?: string;
      content?: string;
      isActive?: boolean;
      priority?: number;
      startAt?: Date | null;
      endAt?: Date | null;
    } = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return NextResponse.json({ error: "공지 제목이 올바르지 않습니다." }, { status: 400 });
      }
      updateData.title = body.title.trim();
    }

    if (body.content !== undefined) {
      if (typeof body.content !== "string" || !body.content.trim()) {
        return NextResponse.json({ error: "공지 내용이 올바르지 않습니다." }, { status: 400 });
      }
      updateData.content = body.content.trim();
    }

    if (body.isActive !== undefined) {
      const parsedIsActive = parseBoolean(body.isActive);
      if (parsedIsActive === null) {
        return NextResponse.json({ error: "isActive 값이 올바르지 않습니다." }, { status: 400 });
      }
      updateData.isActive = parsedIsActive;
    }

    if (body.priority !== undefined) {
      const parsedPriority = parsePriority(body.priority);
      if (parsedPriority === null) {
        return NextResponse.json({ error: "priority 값은 정수여야 합니다." }, { status: 400 });
      }
      updateData.priority = parsedPriority;
    }

    if (body.startAt !== undefined) {
      const parsedStartAt = parseDateTime(body.startAt);
      if (parsedStartAt === "invalid") {
        return NextResponse.json({ error: "startAt 값이 올바르지 않습니다." }, { status: 400 });
      }
      updateData.startAt = parsedStartAt;
    }

    if (body.endAt !== undefined) {
      const parsedEndAt = parseDateTime(body.endAt);
      if (parsedEndAt === "invalid") {
        return NextResponse.json({ error: "endAt 값이 올바르지 않습니다." }, { status: 400 });
      }
      updateData.endAt = parsedEndAt;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "수정할 값이 없습니다." }, { status: 400 });
    }

    const current = await prisma.notice.findFirst({
      where: {
        id: noticeId,
        tenantType,
      },
      select: {
        id: true,
        startAt: true,
        endAt: true,
      },
    });

    if (!current) {
      return NextResponse.json({ error: "수정할 공지를 찾을 수 없습니다." }, { status: 404 });
    }

    const nextStartAt = updateData.startAt !== undefined ? updateData.startAt : current.startAt;
    const nextEndAt = updateData.endAt !== undefined ? updateData.endAt : current.endAt;
    if (nextStartAt && nextEndAt && nextStartAt.getTime() > nextEndAt.getTime()) {
      return NextResponse.json({ error: "공지 시작일은 종료일보다 늦을 수 없습니다." }, { status: 400 });
    }

    const updated = await prisma.notice.update({
      where: { id: noticeId },
      data: updateData,
    });

    revalidateNoticeCache(tenantType);

    return NextResponse.json({
      success: true,
      notice: updated,
    });
  } catch (error) {
    console.error("공지 수정 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "공지 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("notices");
  if (featureError) return featureError;

  const noticeId = parseNoticeId(request);
  if (!noticeId) {
    return NextResponse.json({ error: "삭제할 공지 ID가 필요합니다." }, { status: 400 });
  }

  const tenantType = await getServerTenantType();

  try {
    const existing = await prisma.notice.findFirst({
      where: {
        id: noticeId,
        tenantType,
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "삭제할 공지를 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.notice.delete({
      where: { id: noticeId },
    });

    revalidateNoticeCache(tenantType);

    return NextResponse.json({
      success: true,
      deletedId: noticeId,
    });
  } catch (error) {
    console.error("공지 삭제 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "공지 삭제에 실패했습니다." }, { status: 500 });
  }
}
