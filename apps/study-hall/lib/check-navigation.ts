export const CHECK_NAVIGATION_EVENT = "study-hall:check-navigation";
export const CHECK_SAFETY_CHANGED = "study-hall:check-safety-changed";
export type CheckNavigationDetail = { action: () => void };
const guards = new Set<() => boolean>();

export function registerCheckGuard(isBlocked: () => boolean) {
  guards.add(isBlocked);
  return () => { guards.delete(isBlocked); };
}

export function hasPendingCheckChanges() {
  return Array.from(guards).some((guard) => guard());
}

export function requestCheckNavigation(action: () => void) {
  if (typeof window === "undefined") { action(); return; }
  const event = new CustomEvent<CheckNavigationDetail>(CHECK_NAVIGATION_EVENT, {
    cancelable: true, detail: { action },
  });
  if (window.dispatchEvent(event)) action();
}

export async function fetchCheck(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(input, { ...init, cache: "no-store", signal: controller.signal });
    // Include a stalled response body in the timeout, not just response headers.
    await response.clone().arrayBuffer();
    return response;
  } catch (error) {
    if (controller.signal.aborted) throw new Error("응답이 지연되고 있습니다. 입력은 유지됩니다. 연결을 확인한 뒤 다시 저장해 주세요.");
    throw error;
  } finally { clearTimeout(timer); }
}
