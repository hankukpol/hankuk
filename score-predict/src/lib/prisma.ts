import "server-only";
import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

const RETRYABLE_CONNECTION_ERROR_CODES = new Set(["P1001", "P1008", "P1011", "P1017"]);

function isRetryablePrismaConnectionError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    RETRYABLE_CONNECTION_ERROR_CODES.has(error.code)
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withPrismaConnectionRetry<T>(
  operation: () => Promise<T>,
  label = "prisma operation"
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isRetryablePrismaConnectionError(error)) {
      throw error;
    }

    console.warn(`${label} hit a transient Prisma connection error (${error.code}). Retrying once.`);
    await prisma.$disconnect().catch(() => undefined);
    await wait(150);
    return operation();
  }
}
