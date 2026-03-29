const DEFAULT_PUBLIC_ERROR_MESSAGE =
  "문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";

export function shouldExposeErrorDetails() {
  return process.env.NODE_ENV !== "production";
}

export function getDisplayErrorMessage(
  error: unknown,
  fallback = DEFAULT_PUBLIC_ERROR_MESSAGE,
) {
  if (shouldExposeErrorDetails() && error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function getDisplayErrorDetails(error: unknown) {
  if (!shouldExposeErrorDetails() || !(error instanceof Error)) {
    return null;
  }

  return [error.message, error.stack].filter(Boolean).join("\n\n");
}

export function getServerErrorLogMessage(error: unknown) {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
