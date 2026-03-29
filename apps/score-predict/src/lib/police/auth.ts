import "server-only";
import type { Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { isAdminMfaEnabled, verifyAdminTotp } from "@/lib/police/admin-mfa";
import {
  consumePersistentFixedWindowRateLimit,
  getPersistentFixedWindowRateLimitState,
  resetPersistentFixedWindowRateLimit,
} from "@/lib/police/persistent-rate-limit";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/request-ip";
import { normalizeUsername } from "@/lib/validations";

const INSECURE_SECRETS = new Set([
  "change-this-to-a-long-random-string",
  "secret",
  "nextauth-secret",
  "nextauth_secret",
  "dev-secret",
  "admin",
  "password",
  "",
]);

// 짧거나 예측 가능한 패턴의 시크릿 감지
function isInsecretSecret(value: string): boolean {
  if (INSECURE_SECRETS.has(value)) return true;
  // 32바이트(256bit) 미만은 보안 취약
  if (value.length < 32) return true;
  return false;
}

const nextAuthSecret = process.env.NEXTAUTH_SECRET ?? "";
const isProduction = process.env.NODE_ENV === "production";
const isNextBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

if (!nextAuthSecret || isInsecretSecret(nextAuthSecret)) {
  if (isProduction && !isNextBuildPhase) {
    throw new Error(
      "[auth] NEXTAUTH_SECRET\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uAC70\uB098 \uAE30\uBCF8\uAC12\uC785\uB2C8\uB2E4. \uD504\uB85C\uB355\uC158\uC5D0\uC11C\uB294 \uBC18\uB4DC\uC2DC \uC548\uC804\uD55C \uAC12\uC73C\uB85C \uBCC0\uACBD\uD574\uC57C \uD569\uB2C8\uB2E4."
    );
  }

  console.warn(
    "[auth] \uACBD\uACE0: NEXTAUTH_SECRET\uAC00 \uAE30\uBCF8\uAC12\uC785\uB2C8\uB2E4. \uD504\uB85C\uB355\uC158 \uBC30\uD3EC \uC804 \uBC18\uB4DC\uC2DC \uBCC0\uACBD\uD574\uC57C \uD569\uB2C8\uB2E4."
  );
}

const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_IP_WINDOW_MS = 60 * 1000;
const LOGIN_IP_LIMIT = 20;

// 관리자 로그인 전용 — 일반 로그인보다 4배 엄격 (관리자 계정 무차별 대입 방지)
const ADMIN_LOGIN_IP_WINDOW_MS = 60 * 1000;
const ADMIN_LOGIN_IP_LIMIT = 5;

const LOGIN_USERNAME_FAILURE_NAMESPACE = "auth-login-username-failure";
const LOGIN_USERNAME_LOCK_NAMESPACE = "auth-login-username-lock";

type AppUser = User & {
  role: Role;
  username: string;
};

function getUsernameRateLimitState(username: string) {
  return getPersistentFixedWindowRateLimitState({
    namespace: LOGIN_USERNAME_LOCK_NAMESPACE,
    key: username,
    limit: 1,
    windowMs: LOGIN_FAILURE_WINDOW_MS,
  });
}

async function recordLoginFailure(username: string) {
  const failureState = await consumePersistentFixedWindowRateLimit({
    namespace: LOGIN_USERNAME_FAILURE_NAMESPACE,
    key: username,
    limit: LOGIN_FAILURE_LIMIT,
    windowMs: LOGIN_FAILURE_WINDOW_MS,
  });

  if (!failureState.allowed || failureState.remaining === 0) {
    await consumePersistentFixedWindowRateLimit({
      namespace: LOGIN_USERNAME_LOCK_NAMESPACE,
      key: username,
      limit: 1,
      windowMs: LOGIN_FAILURE_WINDOW_MS,
    });
  }
}

async function clearLoginFailures(username: string) {
  await Promise.all([
    resetPersistentFixedWindowRateLimit({ namespace: LOGIN_USERNAME_FAILURE_NAMESPACE, key: username }),
    resetPersistentFixedWindowRateLimit({ namespace: LOGIN_USERNAME_LOCK_NAMESPACE, key: username }),
  ]);
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24,
  },
  // 세션 쿠키 보안 명시 설정 (NextAuth 기본값에 의존하지 않고 명시적으로 강제)
  cookies: {
    sessionToken: {
      // 운영 환경: __Secure- 접두사(HTTPS 전용 강제), 개발: 일반 이름
      name: isProduction
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,    // JS에서 쿠키 접근 차단 (XSS 방어)
        sameSite: "lax",   // CSRF 방어
        path: "/",
        secure: isProduction, // 운영에서만 HTTPS 전용
      },
    },
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "\uC544\uC774\uB514 \uB85C\uADF8\uC778",
      credentials: {
        username: {
          label: "\uC544\uC774\uB514",
          type: "text",
          placeholder: "\uC544\uC774\uB514\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
        },
        password: {
          label: "\uBE44\uBC00\uBC88\uD638",
          type: "password",
        },
        adminOnly: {
          label: "\uAD00\uB9AC\uC790 \uC804\uC6A9",
          type: "text",
        },
        adminOtp: {
          label: "\uAD00\uB9AC\uC790 2\uCC28 \uC778\uC99D",
          type: "text",
        },
      },
      async authorize(credentials, request) {
        const username = normalizeUsername(credentials?.username ?? "");
        const password = credentials?.password?.trim() ?? "";
        const adminOnly = credentials?.adminOnly === "true";
        const adminOtp = credentials?.adminOtp?.trim() ?? "";
        const clientIp = getClientIp(request);

        const ipRateLimit = await consumePersistentFixedWindowRateLimit({
          namespace: "auth-login-ip",
          key: clientIp,
          limit: LOGIN_IP_LIMIT,
          windowMs: LOGIN_IP_WINDOW_MS,
        });
        if (!ipRateLimit.allowed) {
          return null;
        }

        // 관리자 로그인 시도는 별도 엄격한 IP 레이트리밋 적용
        if (adminOnly) {
          const adminIpRateLimit = await consumePersistentFixedWindowRateLimit({
            namespace: "auth-admin-login-ip",
            key: clientIp,
            limit: ADMIN_LOGIN_IP_LIMIT,
            windowMs: ADMIN_LOGIN_IP_WINDOW_MS,
          });
          if (!adminIpRateLimit.allowed) {
            return null;
          }
        }

        if (!username || !password) {
          return null;
        }

        const usernameRateLimit = await getUsernameRateLimitState(username);
        if (!usernameRateLimit.allowed) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { phone: username },
          select: {
            id: true,
            name: true,
            phone: true,
            password: true,
            role: true,
          },
        });
        if (!user) {
          await recordLoginFailure(username);
          return null;
        }

        if (adminOnly && user.role !== "ADMIN") {
          await recordLoginFailure(username);
          return null;
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          await recordLoginFailure(username);
          return null;
        }

        if (user.role === "ADMIN" && isAdminMfaEnabled() && !verifyAdminTotp(adminOtp)) {
          await recordLoginFailure(username);
          return null;
        }

        await clearLoginFailures(username);

        return {
          id: String(user.id),
          name: user.name,
          role: user.role,
          username: user.phone,
        } satisfies AppUser;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const authUser = user as AppUser;
        token.id = authUser.id;
        token.role = authUser.role;
        token.username = authUser.username;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : "";
        session.user.role = (token.role as Role | undefined) ?? "USER";
        session.user.username = typeof token.username === "string" ? token.username : "";
      }

      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
