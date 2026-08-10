import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { isMailerConfigured, sendAccountCodeEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { requireTenantSessionRoute } from "@/lib/tenant-session.server";
import { validatePasswordStrength } from "@/lib/validations";

export const runtime = "nodejs";

function getUserId(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET() {
  const current = await requireTenantSessionRoute();
  if ("error" in current) return current.error;
  const userId = getUserId(current.session.user.id);
  if (!userId) return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true, phone: true },
  });
  if (!user) return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });

  return NextResponse.json({
    identity: user.phone,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt,
    mailerConfigured: isMailerConfigured(current.tenantType),
  });
}

export async function PUT(request: Request) {
  const current = await requireTenantSessionRoute();
  if ("error" in current) return current.error;
  const userId = getUserId(current.session.user.id);
  if (!userId) return NextResponse.json({ error: "사용자 정보를 확인할 수 없습니다." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const nextPassword = validatePasswordStrength(
    typeof body.newPassword === "string" ? body.newPassword : ""
  );
  if (!currentPassword || !nextPassword.isValid || !nextPassword.data) {
    return NextResponse.json(
      { error: nextPassword.errors[0] ?? "현재 비밀번호와 새 비밀번호를 확인해 주세요." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, password: true, phone: true },
  });
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 400 });
  }

  const password = await bcrypt.hash(nextPassword.data, 12);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { password, credentialVersion: { increment: 1 } },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
  });

  if (user.email && isMailerConfigured(current.tenantType)) {
    void sendAccountCodeEmail({
      tenantType: current.tenantType,
      purpose: "PASSWORD_CHANGED",
      to: user.email,
      name: user.name,
      identity: user.phone,
    }).catch((error) => console.error("[account-security] password notification failed.", error));
  }

  return NextResponse.json({
    success: true,
    message: "비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인해 주세요.",
  });
}
