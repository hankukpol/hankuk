type JsonInit = ResponseInit & {
  headers?: HeadersInit;
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

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ message }, { status });
}
