import type { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { maskKoreanName } from "@/lib/prediction";
import { prisma } from "@/lib/prisma";
import { consumeFixedWindowRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { getSiteSettings } from "@/lib/site-settings";

export const runtime = "nodejs";

const MAX_COMMENT_LENGTH = 500;
const COMMENT_POST_WINDOW_MS = 60 * 1000;
const COMMENT_POST_LIMIT_PER_USER = 5;
const COMMENT_POST_LIMIT_PER_IP = 20;

interface CommentPayload {
  content?: unknown;
  id?: unknown;
}

function parsePositiveInteger(value: string | null): number | null {
  if (!value) return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function parsePositiveIntegerUnknown(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === "string") {
    return parsePositiveInteger(value);
  }

  return null;
}

function parsePage(value: string | null): number {
  const parsed = parsePositiveInteger(value);
  return parsed ?? 1;
}

function parseLimit(value: string | null): number {
  const parsed = parsePositiveInteger(value);
  if (!parsed) return 20;
  return Math.min(parsed, 50);
}

async function getTargetExamId(): Promise<number> {
  const activeExam = await prisma.exam.findFirst({
    where: { isActive: true },
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  if (activeExam) {
    return activeExam.id;
  }

  const latestExam = await prisma.exam.findFirst({
    orderBy: [{ examDate: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  if (!latestExam) {
    throw new Error("시험 정보가 없습니다.");
  }

  return latestExam.id;
}

function getSessionUserId(sessionUserId: string | undefined): number {
  const userId = Number(sessionUserId);
  if (!Number.isInteger(userId) || userId < 1) {
    throw new Error("사용자 정보를 확인할 수 없습니다.");
  }
  return userId;
}

function formatComment(
  comment: {
    id: number;
    userId: number;
    content: string;
    createdAt: Date;
    user: { name: string };
  },
  currentUserId: number
) {
  return {
    id: comment.id,
    userId: comment.userId,
    maskedName: maskKoreanName(comment.user.name),
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    isMine: comment.userId === currentUserId,
  };
}

export async function GET(request: NextRequest) {
  const siteSettings = await getSiteSettings();
  if (!siteSettings["site.commentsEnabled"]) {
    return NextResponse.json({ error: "댓글 기능이 비활성화되어 있습니다." }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let userId: number;
  try {
    userId = getSessionUserId(session.user.id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "사용자 정보를 확인할 수 없습니다." },
      { status: 401 }
    );
  }

  try {
    const examId = await getTargetExamId();
    const { searchParams } = new URL(request.url);
    const after = parsePositiveInteger(searchParams.get("after"));

    if (after) {
      const comments = await prisma.comment.findMany({
        where: {
          examId,
          id: {
            gt: after,
          },
        },
        orderBy: [{ id: "desc" }],
        include: {
          user: {
            select: {
              name: true,
            },
          },
        },
      });

      return NextResponse.json({
        examId,
        comments: comments.map((comment) => formatComment(comment, userId)),
      });
    }

    const page = parsePage(searchParams.get("page"));
    const limit = parseLimit(searchParams.get("limit"));
    const skip = (page - 1) * limit;

    const [totalCount, comments] = await prisma.$transaction([
      prisma.comment.count({
        where: { examId },
      }),
      prisma.comment.findMany({
        where: { examId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
        include: {
          user: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const safePage = Math.min(page, totalPages);

    const normalizedComments =
      safePage === page
        ? comments
        : await prisma.comment.findMany({
            where: { examId },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: (safePage - 1) * limit,
            take: limit,
            include: {
              user: {
                select: {
                  name: true,
                },
              },
            },
          });

    return NextResponse.json({
      examId,
      pagination: {
        page: safePage,
        limit,
        totalCount,
        totalPages,
      },
      comments: normalizedComments.map((comment) => formatComment(comment, userId)),
    });
  } catch (error) {
    console.error("GET /api/comments error", error);
    return NextResponse.json({ error: "댓글을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const siteSettings = await getSiteSettings();
  if (!siteSettings["site.commentsEnabled"]) {
    return NextResponse.json({ error: "댓글 기능이 비활성화되어 있습니다." }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let userId: number;
  try {
    userId = getSessionUserId(session.user.id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "사용자 정보를 확인할 수 없습니다." },
      { status: 401 }
    );
  }

  try {
    const clientIp = getClientIp(request);
    const userRateLimit = consumeFixedWindowRateLimit({
      namespace: "comments-post-user",
      key: String(userId),
      limit: COMMENT_POST_LIMIT_PER_USER,
      windowMs: COMMENT_POST_WINDOW_MS,
    });
    if (!userRateLimit.allowed) {
      return NextResponse.json(
        { error: "댓글 등록 요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        {
          status: 429,
          headers: {
            "Retry-After": String(userRateLimit.retryAfterSec),
          },
        }
      );
    }

    const ipRateLimit = consumeFixedWindowRateLimit({
      namespace: "comments-post-ip",
      key: clientIp,
      limit: COMMENT_POST_LIMIT_PER_IP,
      windowMs: COMMENT_POST_WINDOW_MS,
    });
    if (!ipRateLimit.allowed) {
      return NextResponse.json(
        { error: "댓글 등록 요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        {
          status: 429,
          headers: {
            "Retry-After": String(ipRateLimit.retryAfterSec),
          },
        }
      );
    }

    const body = (await request.json()) as CommentPayload;
    const rawContent = typeof body.content === "string" ? body.content : "";
    // HTML 태그 제거 (XSS 방어 — React 자동 이스케이프와 이중 방어)
    const content = rawContent.replace(/<[^>]*>/g, "").trim();

    if (!content) {
      return NextResponse.json({ error: "댓글 내용을 입력해주세요." }, { status: 400 });
    }

    if (content.length > MAX_COMMENT_LENGTH) {
      return NextResponse.json(
        { error: `댓글은 ${MAX_COMMENT_LENGTH}자 이하로 입력해주세요.` },
        { status: 400 }
      );
    }

    const examId = await getTargetExamId();
    const created = await prisma.comment.create({
      data: {
        examId,
        userId,
        content,
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      comment: formatComment(created, userId),
    });
  } catch (error) {
    console.error("POST /api/comments error", error);
    return NextResponse.json({ error: "댓글 등록에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const siteSettings = await getSiteSettings();
  if (!siteSettings["site.commentsEnabled"]) {
    return NextResponse.json({ error: "댓글 기능이 비활성화되어 있습니다." }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let userId: number;
  try {
    userId = getSessionUserId(session.user.id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "사용자 정보를 확인할 수 없습니다." },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    let commentId = parsePositiveInteger(searchParams.get("id"));

    if (!commentId) {
      const body = (await request.json().catch(() => ({}))) as CommentPayload;
      commentId = parsePositiveIntegerUnknown(body.id);
    }

    if (!commentId) {
      return NextResponse.json({ error: "삭제할 댓글 ID가 필요합니다." }, { status: 400 });
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!comment) {
      return NextResponse.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });
    }

    const role = (session.user.role as Role | undefined) ?? "USER";
    const canDelete = comment.userId === userId || role === "ADMIN";
    if (!canDelete) {
      return NextResponse.json({ error: "본인 댓글만 삭제할 수 있습니다." }, { status: 403 });
    }

    await prisma.comment.delete({
      where: { id: commentId },
    });

    return NextResponse.json({
      success: true,
      deletedId: commentId,
    });
  } catch (error) {
    console.error("DELETE /api/comments error", error);
    return NextResponse.json({ error: "댓글 삭제에 실패했습니다." }, { status: 500 });
  }
}
