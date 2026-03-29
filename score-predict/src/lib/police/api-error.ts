import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

const SCHEMA_MISMATCH_CODES = new Set(["P2021", "P2022"]);

const SCHEMA_MISMATCH_MESSAGE =
  "The database schema is behind the deployed code. Do not reset any data. Apply only the pending migrations with `prisma migrate deploy`.";

export function isSchemaMismatchError(
  error: unknown
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    SCHEMA_MISMATCH_CODES.has(error.code)
  );
}

export function toApiErrorMessage(error: unknown, fallbackMessage: string): string {
  if (isSchemaMismatchError(error)) {
    return SCHEMA_MISMATCH_MESSAGE;
  }

  return fallbackMessage;
}

export function toApiErrorResponse(
  error: unknown,
  fallbackMessage: string,
  status = 500
) {
  return NextResponse.json(
    { error: toApiErrorMessage(error, fallbackMessage) },
    { status }
  );
}
