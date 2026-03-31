type JsonInit = ResponseInit & {
  headers?: HeadersInit;
};

type LoggedErrorDetails = Record<string, unknown>;

type InternalErrorOptions = {
  error: unknown;
  scope: string;
  status?: number;
  headers?: HeadersInit;
  details?: LoggedErrorDetails;
};

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

export function jsonResponse(data: unknown, init?: JsonInit) {
  return Response.json(data, {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...init?.headers,
    },
  });
}

export function errorResponse(message: string, status = 400, init?: JsonInit) {
  return jsonResponse({ message }, { status, ...init });
}

export function logRouteError(
  scope: string,
  error: unknown,
  details?: LoggedErrorDetails,
) {
  const normalizedError =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : error;

  console.error(`[${scope}]`, {
    ...details,
    error: normalizedError,
  });
}

export function internalErrorResponse(
  message: string,
  { error, scope, status = 500, headers, details }: InternalErrorOptions,
) {
  logRouteError(scope, error, details);

  return errorResponse(message, status, { headers });
}
