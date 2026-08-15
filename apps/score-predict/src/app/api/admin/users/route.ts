import { Prisma, type Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { prisma } from "@/lib/prisma";
import { getServerTenantType } from "@/lib/tenant.server";
import { issueAdminPasswordResetCode } from "@/lib/police/password-reset";
import {
  isValidPoliceContactPhone,
  normalizePoliceContactPhone,
  resolvePoliceContactPhone,
} from "@/lib/police/contact-phone";
import {
  countLegacyIdentityUsers,
  findLegacyIdentityUserIdsBySearch,
  findPoliceUsersByContactPhone,
  getLegacyIdentitySummaries,
  LEGACY_CONTACT_PHONE_KIND,
  LEGACY_USERNAME_KIND,
  type LegacyIdentitySummary,
} from "@/lib/police/account-identity";

export const runtime = "nodejs";

interface UserUpdatePayload {
  role?: unknown;
  resetPassword?: unknown;
  contactPhone?: unknown;
}

type EditableUser = {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  role: Role;
  contactPhone?: string | null;
};

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

function parseContactStatus(value: string | null): "missing" | "registered" | null | "invalid" {
  if (!value) return null;
  if (value === "missing" || value === "registered") return value;
  return "invalid";
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

function parseContactPhoneUpdate(value: unknown): string | null | "invalid" {
  if (value === undefined) return null;
  if (typeof value !== "string") return "invalid";
  const normalized = normalizePoliceContactPhone(value);
  return isValidPoliceContactPhone(normalized) ? normalized : "invalid";
}

async function loadEditableUser(userId: number, tenantType: "fire" | "police"): Promise<EditableUser | null> {
  if (tenantType === "police") {
    return prisma.user.findUnique({
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
  }

  return prisma.user.findUnique({
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

export async function GET(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("users");
  if (featureError) return featureError;

  try {
    const tenantType = await getServerTenantType();
    const { searchParams } = new URL(request.url);
    const page = parsePage(searchParams.get("page"));
    const limit = parseLimit(searchParams.get("limit"));
    const search = searchParams.get("search")?.trim() ?? "";
    const role = parseRole(searchParams.get("role"));
    const contactStatus = parseContactStatus(searchParams.get("contactStatus"));
    const legacySearchUserIds =
      tenantType === "police" && search
        ? await findLegacyIdentityUserIdsBySearch(search)
        : [];

    if (searchParams.get("role") && !role) {
      return NextResponse.json({ error: "role 값은 USER 또는 ADMIN 이어야 합니다." }, { status: 400 });
    }
    if (contactStatus === "invalid") {
      return NextResponse.json(
        { error: "contactStatus 값은 missing 또는 registered 이어야 합니다." },
        { status: 400 }
      );
    }
    if (contactStatus && tenantType !== "police") {
      return NextResponse.json({ error: "경찰 회원 연락처만 구분할 수 있습니다." }, { status: 400 });
    }

    const skip = (page - 1) * limit;
    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(contactStatus === "missing"
        ? { contactPhone: "" }
        : contactStatus === "registered"
          ? { NOT: { contactPhone: "" } }
          : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { phone: { contains: search } },
              ...(legacySearchUserIds.length > 0
                ? [{ id: { in: legacySearchUserIds } }]
                : []),
              ...(tenantType === "police"
                ? [{ contactPhone: { contains: search } }]
                : []),
            ],
          }
        : {}),
    };

    const [totalCount, users, missingContactCount, registeredContactCount] = await prisma.$transaction(async (tx) =>
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
            contactPhone: true,
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
        tenantType === "police" ? tx.user.count({ where: { contactPhone: "" } }) : Promise.resolve(0),
        tenantType === "police" ? tx.user.count({ where: { NOT: { contactPhone: "" } } }) : Promise.resolve(0),
      ])
    );

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const safePage = Math.min(page, totalPages);
    let identitySummaries: LegacyIdentitySummary[] = [];
    let usernameConflictCount = 0;
    let contactConflictCount = 0;
    if (tenantType === "police") {
      [identitySummaries, usernameConflictCount, contactConflictCount] =
        await Promise.all([
          getLegacyIdentitySummaries(users.map((user) => user.id)),
          countLegacyIdentityUsers(LEGACY_USERNAME_KIND),
          countLegacyIdentityUsers(LEGACY_CONTACT_PHONE_KIND),
        ]);
    }
    const identitiesByUser = new Map<number, LegacyIdentitySummary[]>();
    for (const identity of identitySummaries) {
      const identities = identitiesByUser.get(identity.userId) ?? [];
      identities.push(identity);
      identitiesByUser.set(identity.userId, identities);
    }

    return NextResponse.json({
      pagination: {
        page: safePage,
        limit,
        totalCount,
        totalPages,
      },
      contactSummary:
        tenantType === "police"
          ? {
              missingCount: missingContactCount,
              registeredCount: registeredContactCount,
              usernameConflictCount,
              contactConflictCount,
            }
          : null,
      users: users.map((user) => {
        const identities = identitiesByUser.get(user.id) ?? [];
        const legacyUsername = identities.find(
          (identity) => identity.kind === LEGACY_USERNAME_KIND
        )?.value;
        return {
          id: user.id,
          name: user.name,
          phone: legacyUsername ?? user.phone,
          contactPhone: user.contactPhone,
          deliveryPhone:
            tenantType === "police" ? resolvePoliceContactPhone(user) : user.phone,
          usernameConflict: Boolean(legacyUsername),
          contactConflict: identities.some(
            (identity) => identity.kind === LEGACY_CONTACT_PHONE_KIND
          ),
          role: user.role,
          createdAt: user.createdAt,
          submissionCount: user._count.submissions,
          commentCount: user._count.comments,
        };
      }),
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
    const contactPhone = parseContactPhoneUpdate(body.contactPhone);

    if (role === "invalid") {
      return NextResponse.json({ error: "role 값은 USER 또는 ADMIN 이어야 합니다." }, { status: 400 });
    }
    if (resetPassword === null) {
      return NextResponse.json({ error: "resetPassword 값은 boolean 이어야 합니다." }, { status: 400 });
    }
    if (contactPhone === "invalid") {
      return NextResponse.json(
        { error: "연락처는 올바른 휴대전화 번호로 입력해 주세요." },
        { status: 400 }
      );
    }
    if (contactPhone !== null && tenantType !== "police") {
      return NextResponse.json({ error: "경찰 회원 연락처만 수정할 수 있습니다." }, { status: 400 });
    }
    if (role === null && !resetPassword && contactPhone === null) {
      return NextResponse.json({ error: "변경할 정보가 없습니다." }, { status: 400 });
    }

    const user = await loadEditableUser(userId, tenantType);
    if (!user) {
      return NextResponse.json({ error: "수정할 사용자를 찾을 수 없습니다." }, { status: 404 });
    }

    let resetCode: string | null = null;
    let resetCodeExpiresAt: Date | null = null;
    const updateData: { role?: Role; contactPhone?: string } = {};

    if (role !== null) {
      updateData.role = role;
    }
    if (contactPhone !== null) {
      const duplicateContacts = await findPoliceUsersByContactPhone(contactPhone);
      if (duplicateContacts.some((duplicate) => duplicate.id !== userId)) {
        return NextResponse.json(
          { code: "CONTACT_EXISTS", error: "이미 다른 회원이 사용 중인 연락처입니다." },
          { status: 409 }
        );
      }
      updateData.contactPhone = contactPhone;
    }

    if (resetPassword) {
      const adminUserId = Number(guard.session.user.id);
      const issued = await issueAdminPasswordResetCode({
        userId,
        adminUserId,
        requestLike: request,
      });
      resetCode = issued.code;
      resetCodeExpiresAt = issued.expiresAt;
    }

    if (role !== null || contactPhone !== null) {
      await prisma.user.updateMany({ where: { id: userId }, data: updateData });
    }

    return NextResponse.json({
      success: true,
      updatedUserId: userId,
      resetCode,
      resetCodeExpiresAt,
      deliveryPhone:
        tenantType === "police"
          ? contactPhone ?? resolvePoliceContactPhone(user)
          : user.phone,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { code: "CONTACT_EXISTS", error: "이미 다른 회원이 사용 중인 연락처입니다." },
        { status: 409 }
      );
    }
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
    const tenantType = await getServerTenantType();
    const user = await loadEditableUser(userId, tenantType);
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
