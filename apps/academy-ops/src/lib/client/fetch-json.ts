type JsonErrorPayload = {
  error?: string;
};

type FetchJsonOptions = {
  defaultError?: string;
  timeoutError?: string;
};

function normalizeErrorMessage(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function buildNonJsonErrorMessage(
  response: Response,
  text: string,
  fallback: string,
  timeoutError: string,
) {
  const normalized = normalizeErrorMessage(text);
  const lower = normalized.toLowerCase();
  const looksLikeHtml =
    lower.startsWith("<!doctype") ||
    lower.startsWith("<html") ||
    lower.startsWith("<body");
  const looksLikeTimeout =
    response.status === 408 ||
    response.status === 504 ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("statement timeout") ||
    lower.startsWith("an error occurred");

  if (looksLikeTimeout) {
    return timeoutError;
  }

  if (looksLikeHtml) {
    return response.ok
      ? "서버 응답 형식이 올바르지 않습니다."
      : "서버에서 JSON 대신 오류 페이지를 반환했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (!response.ok && normalized) {
    return normalized;
  }

  return response.ok ? "서버 응답 형식이 올바르지 않습니다." : fallback;
}

export async function fetchJson<T>(
  url: string | URL,
  init?: RequestInit,
  options: FetchJsonOptions = {},
) {
  const response = await fetch(url, init);
  const text = await response.text();
  const defaultError = options.defaultError ?? "요청 처리에 실패했습니다.";
  const timeoutError =
    options.timeoutError ??
    "서버 처리 시간이 초과되었습니다. 저장 작업이 길어져 응답이 끊겼습니다. 잠시 후 다시 시도해 주세요.";
  let payload = {} as T & JsonErrorPayload;

  if (text.trim()) {
    try {
      payload = JSON.parse(text) as T & JsonErrorPayload;
    } catch {
      throw new Error(
        buildNonJsonErrorMessage(response, text, defaultError, timeoutError),
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      payload.error ??
        buildNonJsonErrorMessage(response, text, defaultError, timeoutError),
    );
  }

  return payload as T;
}