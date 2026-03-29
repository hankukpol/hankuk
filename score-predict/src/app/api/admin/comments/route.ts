import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface DeletePayload {
  ids?: unknown;
}

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePage(value: string | null): number {
  return parsePositiveInt(value) ?? 1;
}

function parseLimit(value: string | null): number {
  const parsed = parsePositiveInt(value) ?? 20;
  return Math.min(parsed, 50);
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("comments");
  if (featureError) return featureError;

  try {
    const { searchParams } = new URL(request.url);
    const page = parsePage(searchParams.get("page"));
    const limit = parseLimit(searchParams.get("limit"));
    const examId = parsePositiveInt(searchParams.get("examId"));
    const userId = parsePositiveInt(searchParams.get("userId"));
    const search = searchParams.get("search")?.trim() ?? "";

    const where = {
      ...(examId ? { examId } : {}),
      ...(userId ? { userId } : {}),
      ...(search
        ? {
            OR: [
              { content: { contains: search } },
              { user: { name: { contains: search } } },
              { user: { phone: { contains: search } } },
            ],
          }
        : {}),
    };

    const skip = (page - 1) * limit;
    const [totalCount, comments] = await prisma.$transaction([
      prisma.comment.count({ where }),
      prisma.comment.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          examId: true,
          userId: true,
          content: true,
          createdAt: true,
          user: {
            select: {
              name: true,
              phone: true,
            },
          },
          exam: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const safePage = Math.min(page, totalPages);

    return NextResponse.json({
      pagination: {
        page: safePage,
        limit,
        totalCount,
        totalPages,
      },
      comments: comments.map((comment) => ({
        id: comment.id,
        examId: comment.examId,
        userId: comment.userId,
        userName: comment.user.name,
        userPhone: comment.user.phone,
        content: comment.content,
        createdAt: comment.createdAt,
        examName: comment.exam.name,
      })),
    });
  } catch (error) {
    console.error("관리자 댓글 목록 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "댓글 목록 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("comments");
  if (featureError) return featureError;

  try {
    const { searchParams } = new URL(request.url);
    const queryId = parsePositiveInt(searchParams.get("id"));
    let targetIds: number[] = [];

    if (queryId) {
      targetIds = [queryId];
    } else {
      const body = (await request.json().catch(() => ({}))) as DeletePayload;
      const ids = Array.isArray(body.ids) ? body.ids : [];
      targetIds = ids
        .map((id) => (typeof id === "number" ? id : Number(id)))
        .filter((id) => Number.isInteger(id) && id > 0);
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ error: "삭제할 댓글 ID가 필요합니다." }, { status: 400 });
    }

    const uniqueIds = Array.from(new Set(targetIds));
    const result = await prisma.comment.deleteMany({
      where: {
        id: {
          in: uniqueIds,
        },
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error("관리자 댓글 삭제 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "댓글 삭제에 실패했습니다." }, { status: 500 });
  }
}
