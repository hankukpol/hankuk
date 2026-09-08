import { randomUUID } from "node:crypto";

const ERROR_TYPES = new Set([
  "Error", "TypeError", "RangeError", "SyntaxError", "TimeoutError", "AbortError",
  "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError",
  "PrismaClientInitializationError", "PrismaClientValidationError",
]);

/** Deliberately exclude messages, payloads and SQL: they can contain credentials or student data. */
export function logServerError(scope: string, error: unknown): string {
  const errorId = randomUUID();
  const type = error instanceof Error && ERROR_TYPES.has(error.name) ? error.name : "UnknownError";
  const code = error && typeof error === "object" && "code" in error &&
    typeof error.code === "string" && /^(P\d{4}|E[A-Z]{2,24})$/.test(error.code)
    ? error.code : undefined;
  console.error(JSON.stringify({
    event: "study-hall.error",
    errorId,
    scope: scope.replace(/[\r\n\t]/g, " ").slice(0, 160),
    type,
    ...(code ? { code } : {}),
  }));
  return errorId;
}
