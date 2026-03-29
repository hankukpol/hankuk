import { NextRequest, NextResponse } from "next/server";

import { requireApiSuperAdminAuth } from "@/lib/api-auth";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState } from "@/lib/mock-store";

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function getNow() {
  return new Date();
}

function cuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── GET — 전체 공지 목록 ─────────────────────────────────────────────────────

export async function GET() {
  const auth = await requireApiSuperAdminAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    if (isMockMode()) {
      const state = await readMockState();
      const global = (state.announcementsByDivision["__global__"] ?? [])
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((r) => ({
          id: r.id,
          title: r.title,
          content: r.content,
          isPinned: r.isPinned,
          scope: "GLOBAL" as const,
          divisionId: null,
          divisionName: null,
          createdById: r.createdById,
          createdByName: "최고관리자",
          createdAt: r.createdAt,
          updatedAt: r.createdAt,
          publishedAt: r.publishedAt,
          isPublished: !r.publishedAt || new Date(r.publishedAt) <= getNow(),
        }));
      return NextResponse.json({ announcements: global }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=30" } });
    }

    const { prisma } = await import("@/lib/prisma");
    const records = await prisma.announcement.findMany({
      where: { divisionId: null },
      include: { createdBy: { select: { name: true } } },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    });

    const announcements = records.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      isPinned: r.isPinned,
      scope: "GLOBAL" as const,
      divisionId: null,
      divisionName: null,
      createdById: r.createdById,
      createdByName: r.createdBy.name,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      isPublished: !r.publishedAt || r.publishedAt <= getNow(),
    }));

    return NextResponse.json({ announcements }, { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=30" } });
  } catch (error) {
    return toApiErrorResponse(error, "전체 공지사항을 불러오지 못했습니다.");
  }
}

// ─── POST — 전체 공지 생성 ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireApiSuperAdminAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body?.title?.trim() || !body?.content?.trim()) {
    return NextResponse.json({ error: "제목과 내용을 입력해주세요." }, { status: 400 });
  }

  const title = String(body.title).trim();
  const content = String(body.content).trim();
  const isPinned = Boolean(body.isPinned ?? false);
  const publishedAt: string | null = body.publishedAt?.trim() || null;

  try {
    if (isMockMode()) {
      const now = getNow().toISOString();
      const id = cuid();
      await updateMockState((state) => {
        if (!state.announcementsByDivision) state.announcementsByDivision = {};
        if (!state.announcementsByDivision["__global__"]) state.announcementsByDivision["__global__"] = [];
        state.announcementsByDivision["__global__"].push({
          id,
          divisionId: null,
          title,
          content,
          isPinned,
          createdById: auth.session.id,
          createdAt: now,
          updatedAt: now,
          publishedAt: publishedAt ?? null,
        });
        return state;
      });
      return NextResponse.json({
        announcement: { id, title, content, isPinned, scope: "GLOBAL", createdAt: now },
      }, { status: 201 });
    }

    const { prisma } = await import("@/lib/prisma");
    const record = await prisma.announcement.create({
      data: {
        title,
        content,
        isPinned,
        divisionId: null,
        createdById: auth.session.id,
        publishedAt: publishedAt ? new Date(publishedAt) : null,
      },
      include: { createdBy: { select: { name: true } } },
    });

    return NextResponse.json({
      announcement: {
        id: record.id,
        title: record.title,
        content: record.content,
        isPinned: record.isPinned,
        scope: "GLOBAL",
        divisionId: null,
        divisionName: null,
        createdByName: record.createdBy.name,
        createdAt: record.createdAt.toISOString(),
        publishedAt: record.publishedAt ? record.publishedAt.toISOString() : null,
        isPublished: !record.publishedAt || record.publishedAt <= getNow(),
      },
    }, { status: 201 });
  } catch (error) {
    return toApiErrorResponse(error, "전체 공지사항 생성에 실패했습니다.");
  }
}
