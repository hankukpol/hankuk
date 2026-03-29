import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";
import { ensureScorePredictSharedIdentity } from "@/lib/shared-auth";
import { getServerTenantType } from "@/lib/tenant.server";

export const runtime = "nodejs";

interface UserUpdatePayload {
  role?: unknown;
  resetPassword?: unknown;
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

function parseRole(value: string | null): Role | null {
  if (value === "USER") return "USER";
  if (value === "ADMIN") return "ADMIN";
  return null;
}

function parseUpdateRole(value: unknown): Role | null | "invalid" {
  if (value === undefined) return null;
  if (value === "USER") return "USER";
  if (value === "ADMIN") return "ADMIN";
  return "invalid";
}

function parseResetPasswordFlag(value: unknown): boolean | null {
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  return null;
}

function buildTempPassword(phone: string): string {
  // 소문자(fire) + 전화번호 뒷 4자리 + 특수문자(!) → 유효성 조건 충족
  const digits = phone.replace(/\D/g, "");
  const suffix = digits.length >= 4 ? digits.slice(-4) : "0000";
  return `fire${suffix}!`;
}

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("users");
  if (featureError) return featureError;

  try {
    const { searchParams } = new URL(request.url);
    const page = parsePage(searchParams.get("page"));
    const limit = parseLimit(searchParams.get("limit"));
    const search = searchParams.get("search")?.trim() ?? "";
    const role = parseRole(searchParams.get("role"));

    if (searchParams.get("role") && !role) {
      return NextResponse.json({ error: "role 값은 USER 또는 ADMIN 이어야 합니다." }, { status: 400 });
    }

    const skip = (page - 1) * limit;
    const where = {
      ...(role ? { role } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const [totalCount, users] = await prisma.$transaction(async (tx) =>
      Promise.all([
        tx.user.count({ where }),
        tx.user.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip,
          take: limit,
          select: {
            id: true,
            name: true,
            phone: true,
            role: true,
            createdAt: true,
            _count: {
              select: {
                submissions: true,
                comments: true,
              },
            },
          },
        }),
      ])
    );

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const safePage = Math.min(page, totalPages);

    return NextResponse.json({
      pagination: {
        page: safePage,
        limit,
        totalCount,
        totalPages,
      },
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt,
        submissionCount: user._count.submissions,
        commentCount: user._count.comments,
      })),
    });
  } catch (error) {
    console.error("사용자 목록 조회 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "사용자 목록 조회에 실패했습니다." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("users");
  if (featureError) return featureError;

  const { searchParams } = new URL(request.url);
  const userId = parsePositiveInt(searchParams.get("id"));
  if (!userId) {
    return NextResponse.json({ error: "수정할 사용자 ID가 필요합니다." }, { status: 400 });
  }

  try {
    const tenantType = await getServerTenantType();
    const body = (await request.json()) as UserUpdatePayload;
    const role = parseUpdateRole(body.role);
    const resetPassword = parseResetPasswordFlag(body.resetPassword);

    if (role === "invalid") {
      return NextResponse.json({ error: "role 값은 USER 또는 ADMIN 이어야 합니다." }, { status: 400 });
    }
    if (resetPassword === null) {
      return NextResponse.json({ error: "resetPassword 값은 boolean 이어야 합니다." }, { status: 400 });
    }
    if (role === null && !resetPassword) {
      return NextResponse.json({ error: "변경할 정보가 없습니다." }, { status: 400 });
    }

    let user:
      | {
          id: number;
          name: string;
          email: string | null;
          phone: string;
          role: Role;
          contactPhone?: string | null;
        }
      | null;

    if (tenantType === "police") {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          contactPhone: true,
          email: true,
          id: true,
          name: true,
          phone: true,
          role: true,
        },
      });
    } else {
      user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          id: true,
          name: true,
          phone: true,
          role: true,
        },
      });
    }

    if (!user) {
      return NextResponse.json({ error: "수정할 사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    let tempPassword: string | null = null;
    const updateData: {
      role?: Role;
      password?: string;
    } = {};

    if (role !== null) {
      updateData.role = role;
    }

    if (resetPassword) {
      tempPassword = buildTempPassword(user.phone);
      updateData.password = await bcrypt.hash(tempPassword, 12);
    }

    await prisma.user.updateMany({
      where: { id: userId },
      data: updateData,
    });

    if (role !== null) {
      try {
        await ensureScorePredictSharedIdentity({
          tenantType,
          identity: {
            legacyUserId: user.id,
            name: user.name,
            email: user.email,
            loginIdentifier: user.phone,
            contactPhone: tenantType === "police" ? user.contactPhone : undefined,
            role,
          },
        });
      } catch (error) {
        console.error("[admin/users] Failed to sync shared identity after role update.", error);
      }
    }

    return NextResponse.json({
      success: true,
      updatedUserId: userId,
      tempPassword,
    });
  } catch (error) {
    console.error("사용자 정보 수정 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "사용자 정보 수정에 실패했습니다." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("users");
  if (featureError) return featureError;

  const { searchParams } = new URL(request.url);
  const userId = parsePositiveInt(searchParams.get("id"));
  const confirmed = searchParams.get("confirm") === "true";

  if (!userId) {
    return NextResponse.json({ error: "삭제할 사용자 ID가 필요합니다." }, { status: 400 });
  }
  if (!confirmed) {
    return NextResponse.json({ error: "confirm=true 파라미터가 필요합니다." }, { status: 400 });
  }

  const sessionUserId = Number(guard.session.user.id);
  if (Number.isInteger(sessionUserId) && sessionUserId === userId) {
    return NextResponse.json({ error: "현재 로그인한 관리자 계정은 삭제할 수 없습니다." }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "삭제할 사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      const submissions = await tx.submission.findMany({
        where: { userId },
        select: { id: true },
      });
      const submissionIds = submissions.map((submission) => submission.id);

      if (submissionIds.length > 0) {
        await tx.userAnswer.deleteMany({
          where: {
            submissionId: {
              in: submissionIds,
            },
          },
        });
        await tx.subjectScore.deleteMany({
          where: {
            submissionId: {
              in: submissionIds,
            },
          },
        });
      }

      await tx.submission.deleteMany({
        where: { userId },
      });

      await tx.comment.deleteMany({
        where: { userId },
      });

      await tx.user.deleteMany({
        where: { id: userId },
      });
    });

    return NextResponse.json({
      success: true,
      deletedUserId: userId,
    });
  } catch (error) {
    console.error("사용자 삭제 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "사용자 삭제에 실패했습니다." }, { status: 500 });
  }
}
