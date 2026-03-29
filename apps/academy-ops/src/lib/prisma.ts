import { Prisma, PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export function getPrisma() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!globalThis.prismaGlobal) {
    globalThis.prismaGlobal = createPrismaClient();
  }

  return globalThis.prismaGlobal;
}

const PRISMA_READ_RETRY_DELAY_MS = 75;
const PRISMA_READ_RETRY_COUNT = 2;
const PRISMA_READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

export function isRetryablePrismaReadError(error: unknown) {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P1017") ||
    (error instanceof Prisma.PrismaClientInitializationError &&
      /Can't reach database server|Server has closed the connection|Connection terminated/i.test(
        error.message,
      ))
  );
}

export async function withPrismaReadRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= PRISMA_READ_RETRY_COUNT || !isRetryablePrismaReadError(error)) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, PRISMA_READ_RETRY_DELAY_MS * (attempt + 1)));
    }
  }
}

function createPrismaClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (!PRISMA_READ_OPERATIONS.has(operation)) {
            return query(args);
          }

          return withPrismaReadRetry(() => query(args));
        },
      },
    },
  }) as PrismaClient;
}
