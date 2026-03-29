import "server-only";
import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { consumeFixedWindowRateLimit, getFixedWindowRateLimitState, resetFixedWindowRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { normalizePhone } from "@/lib/validations";

const INSECURE_SECRETS = new Set([
  "change-this-to-a-long-random-string",
  "secret",
  "nextauth-secret",
  "",
]);

const nextAuthSecret = process.env.NEXTAUTH_SECRET ?? "";
const isProduction = process.env.NODE_ENV === "production";
const isNextBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (!nextAuthSecret || INSECURE_SECRETS.has(nextAuthSecret)) {
  if (isProduction && !isNextBuildPhase) {
    throw new Error(
      "[auth] NEXTAUTH_SECRET이 설정되지 않았거나 기본값입니다. " +
        "프로덕션 환경에서는 반드시 안전한 랜덤 문자열로 변경해 주세요."
    );
  }
  console.warn(
    "[auth] 경고: NEXTAUTH_SECRET이 기본값입니다. 프로덕션 배포 전 반드시 변경하세요."
  );
}

const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_IP_WINDOW_MS = 60 * 1000;
const LOGIN_IP_LIMIT = 20;

const LOGIN_PHONE_FAILURE_NAMESPACE = "auth-login-phone-failure";
const LOGIN_PHONE_LOCK_NAMESPACE = "auth-login-phone-lock";

function getPhoneRateLimitState(phone: string) {
  return getFixedWindowRateLimitState({
    namespace: LOGIN_PHONE_LOCK_NAMESPACE,
    key: phone,
    limit: 1,
    windowMs: LOGIN_FAILURE_WINDOW_MS,
  });
}

function recordLoginFailure(phone: string) {
  const failureState = consumeFixedWindowRateLimit({
    namespace: LOGIN_PHONE_FAILURE_NAMESPACE,
    key: phone,
    limit: LOGIN_FAILURE_LIMIT,
    windowMs: LOGIN_FAILURE_WINDOW_MS,
  });

  if (!failureState.allowed || failureState.remaining === 0) {
    consumeFixedWindowRateLimit({
      namespace: LOGIN_PHONE_LOCK_NAMESPACE,
      key: phone,
      limit: 1,
      windowMs: LOGIN_FAILURE_WINDOW_MS,
    });
  }
}

function clearLoginFailures(phone: string) {
  resetFixedWindowRateLimit({
    namespace: LOGIN_PHONE_FAILURE_NAMESPACE,
    key: phone,
  });
  resetFixedWindowRateLimit({
    namespace: LOGIN_PHONE_LOCK_NAMESPACE,
    key: phone,
  });
}
export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "연락처 로그인",
      credentials: {
        phone: {
          label: "연락처",
          type: "text",
          placeholder: "010-1234-5678",
        },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials, request) {
        const phone = normalizePhone(credentials?.phone ?? "");
        const password = credentials?.password?.trim();
        const clientIp = getClientIp(request);

        const ipRateLimit = consumeFixedWindowRateLimit({
          namespace: "auth-login-ip",
          key: clientIp,
          limit: LOGIN_IP_LIMIT,
          windowMs: LOGIN_IP_WINDOW_MS,
        });
        if (!ipRateLimit.allowed) {
          return null;
        }

        if (!phone || !password) {
          return null;
        }

        const phoneRateLimit = getPhoneRateLimitState(phone);
        if (!phoneRateLimit.allowed) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { phone },
          select: {
            id: true,
            name: true,
            phone: true,
            password: true,
            role: true,
          },
        });

        if (!user) {
          recordLoginFailure(phone);
          return null;
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          recordLoginFailure(phone);
          return null;
        }

        clearLoginFailures(phone);

        return {
          id: String(user.id),
          name: user.name,
          phone: user.phone,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: Role }).role;
        token.phone = (user as { phone: string }).phone;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : "";
        session.user.role = (token.role as Role | undefined) ?? "USER";
        session.user.phone = typeof token.phone === "string" ? token.phone : "";
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
