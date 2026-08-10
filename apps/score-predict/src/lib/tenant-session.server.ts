import "server-only";
import type { Session } from "next-auth";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { SCORE_PREDICT_SESSION_VERSION } from "@/lib/auth-session";
import { getServerTenantType } from "@/lib/tenant.server";
import type { TenantType } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export interface TenantSession {
  session: Session;
  tenantType: TenantType;
}

export async function getCurrentTenantSessionContext(): Promise<TenantSession | null> {
  const [session, tenantType] = await Promise.all([
    getServerSession(authOptions),
    getServerTenantType(),
  ]);

  if (
    !session?.user?.id ||
    session.user.tenantType !== tenantType ||
    session.user.sessionVersion !== SCORE_PREDICT_SESSION_VERSION
  ) {
    return null;
  }

  const userId = Number(session.user.id);
  if (!Number.isInteger(userId) || userId < 1) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credentialVersion: true },
  });
  if (!user || session.user.credentialVersion !== user.credentialVersion) {
    return null;
  }

  return { session, tenantType };
}

export async function getCurrentTenantSession(): Promise<Session | null> {
  const current = await getCurrentTenantSessionContext();
  return current?.session ?? null;
}

export async function requireTenantSessionRoute() {
  const current = await getCurrentTenantSessionContext();
  if (!current) {
    return {
      error: NextResponse.json(
        { error: "현재 경찰·소방 서비스에 다시 로그인해 주세요." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      ),
    };
  }

  return current;
}
