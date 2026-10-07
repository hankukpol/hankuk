import { PrismaClient } from "@prisma/client/index";

import { assertLocalRuntimeDoesNotUseRemoteDatabase } from "@/lib/local-env-guard";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function isLocalRuntime() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    process.env.NODE_ENV !== "production" ||
    appUrl.includes("localhost") ||
    appUrl.includes("127.0.0.1")
  );
}

function getRuntimeDatabaseUrl() {
  const value = process.env.DATABASE_URL;

  if (!value) {
    return undefined;
  }

  assertLocalRuntimeDoesNotUseRemoteDatabase(value);

  if (isLocalRuntime()) {
    return value;
  }

  try {
    const url = new URL(value);

    if (!url.hostname.endsWith(".pooler.supabase.com")) {
      return value;
    }

    if (url.port === "" || url.port === "5432") {
      url.port = "6543";
    }

    if (!url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }

    // 함수 인스턴스 하나가 쓰는 연결 수. 1 이면 화면 하나의 동시 조회(Promise.all)가 한 줄로 서고,
    // 트랜잭션 중 다른 조회를 하는 코드가 자기 연결을 기다리며 멈출 수 있다(2026-09-17 휴가 QA).
    // 트랜잭션 풀러(6543)가 실제 DB 연결을 나눠 쓰므로 4 로 둔다. 운영에서 조정하려면 PRISMA_CONNECTION_LIMIT.
    if (!url.searchParams.has("connection_limit")) {
      const configured = Number(process.env.PRISMA_CONNECTION_LIMIT);
      url.searchParams.set("connection_limit", String(Number.isInteger(configured) && configured > 0 ? configured : 4));
    }

    return url.toString();
  } catch {
    return value;
  }
}

const runtimeDatabaseUrl = getRuntimeDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: runtimeDatabaseUrl
      ? {
          db: {
            url: runtimeDatabaseUrl,
          },
        }
      : undefined,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    errorFormat: "pretty",
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
