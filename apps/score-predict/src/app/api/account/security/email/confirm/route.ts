import { NextResponse } from "next/server";
import { hashSecret } from "@/lib/police/password-recovery";
import { prisma } from "@/lib/prisma";
import { requireTenantSessionRoute } from "@/lib/tenant-session.server";
import { isValidEmail, normalizeEmail, normalizeResetCode } from "@/lib/validations";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const current = await requireTenantSessionRoute();
  if ("error" in current) return current.error;
  const userId = Number(current.session.user.id);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = normalizeEmail(typeof body.email === "string" ? body.email : "");
  const code = normalizeResetCode(typeof body.code === "string" ? body.code : "");
  if (!Number.isInteger(userId) || userId < 1 || !isValidEmail(email) || code.length !== 8) {
    return NextResponse.json({ error: "이메일과 인증코드를 확인해 주세요." }, { status: 400 });
  }

  const now = new Date();
  const tokenHash = hashSecret(code);
  const token = await prisma.passwordResetToken.findFirst({
    where: {
      userId,
      tokenHash,
      purpose: "EMAIL_VERIFICATION",
      channel: "EMAIL",
      targetEmail: email,
      usedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (!token) {
    return NextResponse.json({ error: "유효하지 않거나 만료된 인증코드입니다." }, { status: 400 });
  }

  const duplicate = await prisma.user.findFirst({
    where: { email, id: { not: userId } },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: "이미 다른 계정에서 사용 중인 이메일입니다." }, { status: 409 });
  }

  const changed = await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) return false;

    await tx.user.update({
      where: { id: userId },
      data: { email, emailVerifiedAt: now, credentialVersion: { increment: 1 } },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId, purpose: "EMAIL_VERIFICATION", usedAt: null },
      data: { usedAt: now },
    });
    return true;
  });
  if (!changed) {
    return NextResponse.json({ error: "이미 사용했거나 만료된 인증코드입니다." }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message: "이메일 인증이 완료되었습니다. 보안을 위해 다시 로그인해 주세요.",
  });
}
