import "server-only";
import { Role } from "@prisma/client";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";

export class SessionUserError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "SessionUserError";
    this.status = status;
  }
}

export interface VerifiedSessionUser {
  id: number;
  role: Role;
  name: string;
  username: string;
}

export async function getVerifiedSessionUser(session: Session | null): Promise<VerifiedSessionUser> {
  if (!session?.user?.id) {
    throw new SessionUserError("로그인이 필요합니다.", 401);
  }

  const userId = Number(session.user.id);
  if (!Number.isInteger(userId) || userId < 1) {
    throw new SessionUserError("사용자 정보를 확인할 수 없습니다.", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      name: true,
      phone: true,
    },
  });

  if (!user) {
    throw new SessionUserError("사용자 정보를 찾을 수 없습니다.", 401);
  }

  return {
    id: user.id,
    role: user.role,
    name: user.name,
    username: user.phone,
  };
}

export function isVerifiedAdmin(user: Pick<VerifiedSessionUser, "role">): boolean {
  return user.role === Role.ADMIN;
}
