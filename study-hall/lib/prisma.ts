import { PrismaClient } from "@prisma/client/index";

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

    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "1");
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
