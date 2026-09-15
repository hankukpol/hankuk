"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ArrivalRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function arrivalRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init, cache: "no-store", credentials: "same-origin",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ArrivalRequestError(body?.error ?? "요청을 처리하지 못했습니다. 다시 시도해 주세요.", response.status);
  if (body === null) throw new Error("응답을 읽지 못했습니다. 다시 시도해 주세요.");
  return body as T;
}

export function arrivalError(error: unknown) {
  if (error instanceof TypeError || (error instanceof Error && /failed to fetch|fetch failed|networkerror|load failed|network request failed/i.test(error.message))) {
    return "서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 입력하거나 재시도해 주세요.";
  }
  return error instanceof Error ? error.message : "통신에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.";
}

/** Each URL owns its response; polling never replaces selection or form state. */
export function useArrivalQuery<T>(url: string | null, pollMs = 0) {
  const [snapshot, setSnapshot] = useState<{ url: string; data: T } | null>(null);
  const [failure, setFailure] = useState<{ url: string; error: unknown } | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const currentUrl = useRef(url);
  currentUrl.current = url;

  const reload = useCallback(async (replace = true) => {
    if (!url || (!replace && active.current)) return null;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const requestGeneration = ++generation.current;
    setLoading(true);
    try {
      const data = await arrivalRequest<T>(url, { signal: controller.signal });
      if (controller.signal.aborted || requestGeneration !== generation.current || currentUrl.current !== url) return null;
      setSnapshot({ url, data });
      setFailure(null);
      return data;
    } catch (error) {
      if (!controller.signal.aborted && requestGeneration === generation.current && currentUrl.current === url) setFailure({ url, error });
      return null;
    } finally {
      if (active.current === controller) { active.current = null; setLoading(false); }
    }
  }, [url]);

  // A mutation's authoritative response also invalidates any earlier GET.
  const accept = useCallback((data: T) => {
    if (!url) return;
    active.current?.abort();
    active.current = null;
    ++generation.current;
    setSnapshot({ url, data });
    setFailure(null);
    setLoading(false);
  }, [url]);

  useEffect(() => {
    void reload();
    const poll = () => { if (document.visibilityState === "visible") void reload(false); };
    const timer = pollMs > 0 ? window.setInterval(poll, pollMs) : undefined;
    if (pollMs > 0) document.addEventListener("visibilitychange", poll);
    return () => {
      active.current?.abort();
      active.current = null;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [reload, pollMs]);

  return { data: snapshot?.url === url ? snapshot.data : null, error: failure?.url === url ? failure.error : null, loading, reload, accept };
}

export function shiftArrivalDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function shiftArrivalMonth(month: string, months: number) {
  const value = new Date(`${month}-01T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString().slice(0, 7);
}
