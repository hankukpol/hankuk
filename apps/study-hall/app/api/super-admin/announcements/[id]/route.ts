import { NextRequest, NextResponse } from "next/server";

import { requireApiSuperAdminAuth } from "@/lib/api-auth";
import { toApiErrorResponse } from "@/lib/api-error-response";
import { isMockMode } from "@/lib/mock-data";
import { readMockState, updateMockState } from "@/lib/mock-store";

// ─── PATCH — 수정 ─────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiSuperAdminAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "요청 데이터가 없습니다." }, { status: 400 });

  try {
    if (isMockMode()) {
      await updateMockState((state) => {
        if (!state.announcementsByDivision?.["__global__"]) return state;
        const idx = state.announcementsByDivision["__global__"].findIndex((r) => r.id === params.id);
        if (idx !== -1) {
          const rec = state.announcementsByDivision["__global__"][idx];
          if (body.title != null) rec.title = String(body.title).trim();
          if (body.content != null) rec.content = String(body.content).trim();
          if (body.isPinned != null) rec.isPinned = Boolean(body.isPinned);
          if ("publishedAt" in body) rec.publishedAt = body.publishedAt ?? null;
        }
        return state;
      });
      return NextResponse.json({ ok: true });
    }

    const { prisma } = await import("@/lib/prisma");
    const data: Record<string, unknown> = {};
    if (body.title != null) data.title = String(body.title).trim();
    if (body.content != null) data.content = String(body.content).trim();
    if (body.isPinned != null) data.isPinned = Boolean(body.isPinned);
    if ("publishedAt" in body) data.publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;

    await prisma.announcement.update({ where: { id: params.id, divisionId: null }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, "공지사항 수정에 실패했습니다.");
  }
}

// ─── DELETE — 삭제 ────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiSuperAdminAuth();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    if (isMockMode()) {
      const state = await readMockState();
      if (state.announcementsByDivision?.["__global__"]) {
        await updateMockState((s) => {
          s.announcementsByDivision["__global__"] = (s.announcementsByDivision["__global__"] ?? []).filter(
            (r) => r.id !== params.id,
          );
          return s;
        });
      }
      return NextResponse.json({ ok: true });
    }

    const { prisma } = await import("@/lib/prisma");
    await prisma.announcement.delete({ where: { id: params.id, divisionId: null } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toApiErrorResponse(error, "공지사항 삭제에 실패했습니다.");
  }
}
