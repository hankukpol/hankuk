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
import { ensureScorePredictSharedIdentity } from "@/lib/shared-auth";
import { prisma } from "@/lib/prisma";
import {
  consumeFixedWindowRateLimit,
  getFixedWindowRateLimitState,
  resetFixedWindowRateLimit,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import {
  DEFAULT_TENANT_TYPE,
  TENANT_COOKIE,
  TENANT_HEADER,
  normalizeTenantType,
  type TenantType,
} from "@/lib/tenant";
import { normalizePhone, normalizeUsername } from "@/lib/validations";
import { getCookieDomain, withConfiguredCookieDomain } from "@/lib/cookie-domain";

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

const nextAuthSecret = process.env.NEXTAUTH_SECRET ?? "";
const isProduction = process.env.NODE_ENV === "production";
const isNextBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const cookieDomain = getCookieDomain();

function buildSharedNextAuthCookies() {
  if (!cookieDomain) {
    return undefined;
  }

  const securePrefix = isProduction ? "__Secure-" : "";
  const csrfPrefix = isProduction ? "__Secure-" : "";

  return {
    sessionToken: {
      name: `${securePrefix}next-auth.session-token`,
      options: withConfiguredCookieDomain({
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: isProduction,
      }),
    },
    callbackUrl: {
      name: `${securePrefix}next-auth.callback-url`,
      options: withConfiguredCookieDomain({
        sameSite: "lax" as const,
        path: "/",
        secure: isProduction,
      }),
    },
    csrfToken: {
      name: `${csrfPrefix}next-auth.csrf-token`,
      options: withConfiguredCookieDomain({
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: isProduction,
      }),
    },
    pkceCodeVerifier: {
      name: `${securePrefix}next-auth.pkce.code_verifier`,
      options: withConfiguredCookieDomain({
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: isProduction,
        maxAge: 60 * 15,
      }),
    },
    state: {
      name: `${securePrefix}next-auth.state`,
      options: withConfiguredCookieDomain({
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: isProduction,
        maxAge: 60 * 15,
      }),
    },
    nonce: {
      name: `${securePrefix}next-auth.nonce`,
      options: withConfiguredCookieDomain({
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: isProduction,
      }),
    },
  };
}

function isInsecureSecret(value: string): boolean {
  if (INSECURE_SECRETS.has(value)) return true;
  return value.length < 32;
}

if (!nextAuthSecret || isInsecureSecret(nextAuthSecret)) {
  if (isProduction && !isNextBuildPhase) {
    throw new Error(
      "[auth] NEXTAUTH_SECRET가 설정되지 않았거나 기본값입니다. 프로덕션에서는 반드시 안전한 값으로 변경해야 합니다."
    );
  }

  console.warn(
    "[auth] 경고: NEXTAUTH_SECRET가 기본값입니다. 프로덕션 배포 전 반드시 변경해야 합니다."
  );
}

const FIRE_LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const FIRE_LOGIN_FAILURE_LIMIT = 5;
const LOGIN_IP_WINDOW_MS = 60 * 1000;
const LOGIN_IP_LIMIT = 20;
const POLICE_ADMIN_LOGIN_IP_WINDOW_MS = 60 * 1000;
const POLICE_ADMIN_LOGIN_IP_LIMIT = 5;

const FIRE_LOGIN_PHONE_FAILURE_NAMESPACE = "auth-login-phone-failure";
const FIRE_LOGIN_PHONE_LOCK_NAMESPACE = "auth-login-phone-lock";
const POLICE_LOGIN_USERNAME_FAILURE_NAMESPACE = "auth-login-username-failure";
const POLICE_LOGIN_USERNAME_LOCK_NAMESPACE = "auth-login-username-lock";

type AuthUser = User & {
  role: Role;
  phone?: string;
  username?: string;
  sharedUserId?: string;
};

function readRequestHeader(
  request: { headers?: Headers | Record<string, string | string[] | undefined> } | undefined,
  name: string
) {
  const headers = request?.headers;
  if (!headers) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  const lowerName = name.toLowerCase();
  for (const [key, rawValue] of Object.entries(headers)) {
    if (key.toLowerCase() !== lowerName) {
      continue;
    }

    return Array.isArray(rawValue) ? rawValue[0] : rawValue;
  }

  return undefined;
}

function readCookieValue(cookieHeader: string | undefined, cookieName: string) {
  if (!cookieHeader) {
    return undefined;
  }

  const prefix = `${cookieName}=`;
  const entry = cookieHeader.split(/;\s*/).find((item) => item.startsWith(prefix));
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : undefined;
}

function resolveTenantFromAuthRequest(
  request: { headers?: Headers | Record<string, string | string[] | undefined> } | undefined
): TenantType {
  const tenantHeader = readRequestHeader(request, TENANT_HEADER);
  if (tenantHeader) {
    return normalizeTenantType(tenantHeader) ?? DEFAULT_TENANT_TYPE;
  }

  const cookieHeader = readRequestHeader(request, "cookie");
  const cookieTenant = readCookieValue(cookieHeader, TENANT_COOKIE);
  if (cookieTenant) {
    return normalizeTenantType(cookieTenant) ?? DEFAULT_TENANT_TYPE;
  }

  return DEFAULT_TENANT_TYPE;
}

function getFirePhoneRateLimitState(phone: string) {
  return getFixedWindowRateLimitState({
    namespace: FIRE_LOGIN_PHONE_LOCK_NAMESPACE,
    key: phone,
    limit: 1,
    windowMs: FIRE_LOGIN_FAILURE_WINDOW_MS,
  });
}

function recordFireLoginFailure(phone: string) {
  const failureState = consumeFixedWindowRateLimit({
    namespace: FIRE_LOGIN_PHONE_FAILURE_NAMESPACE,
    key: phone,
    limit: FIRE_LOGIN_FAILURE_LIMIT,
    windowMs: FIRE_LOGIN_FAILURE_WINDOW_MS,
  });

  if (!failureState.allowed || failureState.remaining === 0) {
    consumeFixedWindowRateLimit({
      namespace: FIRE_LOGIN_PHONE_LOCK_NAMESPACE,
      key: phone,
      limit: 1,
      windowMs: FIRE_LOGIN_FAILURE_WINDOW_MS,
    });
  }
}

function clearFireLoginFailures(phone: string) {
  resetFixedWindowRateLimit({
    namespace: FIRE_LOGIN_PHONE_FAILURE_NAMESPACE,
    key: phone,
  });
  resetFixedWindowRateLimit({
    namespace: FIRE_LOGIN_PHONE_LOCK_NAMESPACE,
    key: phone,
  });
}

function getPoliceUsernameRateLimitState(username: string) {
  return getPersistentFixedWindowRateLimitState({
    namespace: POLICE_LOGIN_USERNAME_LOCK_NAMESPACE,
    key: username,
    limit: 1,
    windowMs: FIRE_LOGIN_FAILURE_WINDOW_MS,
  });
}

async function recordPoliceLoginFailure(username: string) {
  const failureState = await consumePersistentFixedWindowRateLimit({
    namespace: POLICE_LOGIN_USERNAME_FAILURE_NAMESPACE,
    key: username,
    limit: FIRE_LOGIN_FAILURE_LIMIT,
    windowMs: FIRE_LOGIN_FAILURE_WINDOW_MS,
  });

  if (!failureState.allowed || failureState.remaining === 0) {
    await consumePersistentFixedWindowRateLimit({
      namespace: POLICE_LOGIN_USERNAME_LOCK_NAMESPACE,
      key: username,
      limit: 1,
      windowMs: FIRE_LOGIN_FAILURE_WINDOW_MS,
    });
  }
}

async function clearPoliceLoginFailures(username: string) {
  await Promise.all([
    resetPersistentFixedWindowRateLimit({
      namespace: POLICE_LOGIN_USERNAME_FAILURE_NAMESPACE,
      key: username,
    }),
    resetPersistentFixedWindowRateLimit({
      namespace: POLICE_LOGIN_USERNAME_LOCK_NAMESPACE,
      key: username,
    }),
  ]);
}

async function authorizeFireUser(
  credentials: Record<string, string | undefined>,
  request: { headers?: Headers | Record<string, string | string[] | undefined> } | undefined
): Promise<AuthUser | null> {
  const phone = normalizePhone(credentials.phone ?? "");
  const password = credentials.password?.trim();
  const clientIp = getClientIp(request as Request);

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

  const phoneRateLimit = getFirePhoneRateLimitState(phone);
  if (!phoneRateLimit.allowed) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      password: true,
      role: true,
    },
  });

  if (!user) {
    recordFireLoginFailure(phone);
    return null;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    recordFireLoginFailure(phone);
    return null;
  }

  clearFireLoginFailures(phone);

  let sharedUserId: string | undefined;
  try {
    const result = await ensureScorePredictSharedIdentity({
      tenantType: "fire",
      identity: {
        legacyUserId: user.id,
        name: user.name,
        email: user.email,
        loginIdentifier: user.phone,
        role: user.role,
      },
      password,
    });
    sharedUserId = result.sharedUserId;
  } catch (error) {
    console.error("[auth] Failed to sync fire shared identity.", error);
  }

  return {
    id: String(user.id),
    name: user.name,
    role: user.role,
    phone: user.phone,
    sharedUserId,
  };
}

async function authorizePoliceUser(
  credentials: Record<string, string | undefined>,
  request: { headers?: Headers | Record<string, string | string[] | undefined> } | undefined
): Promise<AuthUser | null> {
  const username = normalizeUsername(credentials.username ?? "");
  const password = credentials.password?.trim() ?? "";
  const adminOnly = credentials.adminOnly === "true";
  const adminOtp = credentials.adminOtp?.trim() ?? "";
  const clientIp = getClientIp(request as Request);

  const ipRateLimit = await consumePersistentFixedWindowRateLimit({
    namespace: "auth-login-ip",
    key: clientIp,
    limit: LOGIN_IP_LIMIT,
    windowMs: LOGIN_IP_WINDOW_MS,
  });
  if (!ipRateLimit.allowed) {
    return null;
  }

  if (adminOnly) {
    const adminIpRateLimit = await consumePersistentFixedWindowRateLimit({
      namespace: "auth-admin-login-ip",
      key: clientIp,
      limit: POLICE_ADMIN_LOGIN_IP_LIMIT,
      windowMs: POLICE_ADMIN_LOGIN_IP_WINDOW_MS,
    });
    if (!adminIpRateLimit.allowed) {
      return null;
    }
  }

  if (!username || !password) {
    return null;
  }

  const usernameRateLimit = await getPoliceUsernameRateLimitState(username);
  if (!usernameRateLimit.allowed) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { phone: username },
    select: {
      contactPhone: true,
      id: true,
      email: true,
      name: true,
      phone: true,
      password: true,
      role: true,
    },
  });
  if (!user) {
    await recordPoliceLoginFailure(username);
    return null;
  }

  if (adminOnly && user.role !== "ADMIN") {
    await recordPoliceLoginFailure(username);
    return null;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    await recordPoliceLoginFailure(username);
    return null;
  }

  if (user.role === "ADMIN" && isAdminMfaEnabled() && !verifyAdminTotp(adminOtp)) {
    await recordPoliceLoginFailure(username);
    return null;
  }

  await clearPoliceLoginFailures(username);

  let sharedUserId: string | undefined;
  try {
    const result = await ensureScorePredictSharedIdentity({
      tenantType: "police",
      identity: {
        legacyUserId: user.id,
        name: user.name,
        email: user.email,
        loginIdentifier: user.phone,
        contactPhone: user.contactPhone,
        role: user.role,
      },
      password,
    });
    sharedUserId = result.sharedUserId;
  } catch (error) {
    console.error("[auth] Failed to sync police shared identity.", error);
  }

  return {
    id: String(user.id),
    name: user.name,
    role: user.role,
    username: user.phone,
    sharedUserId,
  };
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24,
  },
  cookies: buildSharedNextAuthCookies(),
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "로그인",
      credentials: {
        phone: {
          label: "연락처",
          type: "text",
          placeholder: "010-1234-5678",
        },
        username: {
          label: "아이디",
          type: "text",
          placeholder: "아이디를 입력해 주세요.",
        },
        password: { label: "비밀번호", type: "password" },
        adminOnly: {
          label: "관리자 전용",
          type: "text",
        },
        adminOtp: {
          label: "관리자 2차 인증",
          type: "text",
        },
      },
      async authorize(credentials, request) {
        const tenantType = resolveTenantFromAuthRequest(request);
        const normalizedCredentials = credentials as Record<string, string | undefined>;

        if (tenantType === "police") {
          return authorizePoliceUser(normalizedCredentials, request);
        }

        return authorizeFireUser(normalizedCredentials, request);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const authUser = user as AuthUser;
        token.id = authUser.id;
        token.role = authUser.role;
        token.phone = authUser.phone;
        token.username = authUser.username;
        token.sharedUserId = authUser.sharedUserId;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : "";
        session.user.role = (token.role as Role | undefined) ?? "USER";
        session.user.phone = typeof token.phone === "string" ? token.phone : "";
        session.user.username = typeof token.username === "string" ? token.username : "";
        session.user.sharedUserId =
          typeof token.sharedUserId === "string" ? token.sharedUserId : "";
      }

      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
