interface ErrorPayload {
  error?: string;
}

export async function readResponseJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function getResponseErrorMessage(
  response: Response,
  fallbackMessage: string,
  data?: ErrorPayload | null
): string {
  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error;
  }

  return `${fallbackMessage} (${response.status})`;
}
