import { Prisma } from "@prisma/client/index";
import { ZodError } from "zod";

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

export class RateLimitError extends AppError {
  constructor(message: string) {
    super(message, 429, "RATE_LIMITED");
  }
}

export function badRequest(message: string) {
  return new ValidationError(message);
}

export function unauthorized(message: string) {
  return new UnauthorizedError(message);
}

export function forbidden(message: string) {
  return new ForbiddenError(message);
}

export function notFound(message: string) {
  return new NotFoundError(message);
}

export function conflict(message: string) {
  return new ConflictError(message);
}

export function tooManyRequests(message: string) {
  return new RateLimitError(message);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

function getLegacyStatusFromMessage(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("찾을 수 없습니다") ||
    normalized.includes("not found") ||
    normalized.includes("division not found") ||
    normalized.includes("period not found")
  ) {
    return 404;
  }

  if (
    normalized.includes("권한") ||
    normalized.includes("접근할 수 없습니다") ||
    normalized.includes("최고 관리자만")
  ) {
    return 403;
  }

  if (
    normalized.includes("이미 ") ||
    normalized.includes("중복") ||
    normalized.includes("같은 이름") ||
    normalized.includes("해당 날짜에는 이미 휴가") ||
    normalized.includes("이미 다른 학생에게 배정된 좌석")
  ) {
    return 409;
  }

  if (
    normalized.includes("잠시 후 다시 시도해주세요") ||
    normalized.includes("rate_limited")
  ) {
    return 429;
  }

  return null;
}

export function getErrorStatus(error: unknown, defaultStatus = 400) {
  if (isAppError(error)) {
    return error.status;
  }

  if (error instanceof ZodError) {
    return 400;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return 409;
    }
  }

  if (error instanceof Error) {
    const legacyStatus = getLegacyStatusFromMessage(error.message);
    return legacyStatus ?? defaultStatus;
  }

  return 500;
}

export function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? fallbackMessage;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallbackMessage;
}

export function isNotFoundError(error: unknown) {
  return getErrorStatus(error, 400) === 404;
}
