"use client";

import Link from "next/link";
import { ArrivalRequestError, arrivalError } from "./arrival-client";

export function ArrivalFeedback({ error, loading, onRetry, loginHref }: {
  error?: unknown; loading?: boolean; onRetry?: () => void; loginHref?: string;
}) {
  const denied = error instanceof ArrivalRequestError && (error.status === 401 || error.status === 403);
  if (error) return <div className="admin-notice admin-notice-danger space-y-2" role="alert">
    <p className="break-keep">{denied ? "접근 권한 또는 로그인 상태를 확인해 주세요. " : ""}{arrivalError(error)}</p>
    <div className="flex flex-wrap gap-3">
      {onRetry && <button type="button" className="admin-text-action" onClick={onRetry} disabled={loading}>다시 시도</button>}
      {denied && loginHref && <Link className="admin-text-action" href={loginHref}>다시 로그인</Link>}
    </div>
  </div>;
  if (loading) return <p className="admin-help" role="status">불러오는 중입니다.</p>;
  return null;
}
