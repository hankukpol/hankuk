"use client";

import Link from "next/link";
import {
  getDisplayErrorDetails,
  getDisplayErrorMessage,
} from "@/lib/error-display";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const details = getDisplayErrorDetails(error);

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl border border-ink/10 bg-white p-8 text-center shadow-sm">
        <p className="text-6xl font-bold tracking-tight text-ink/10">500</p>
        <h1 className="mt-4 text-2xl font-semibold text-ink">오류가 발생했습니다</h1>
        <p className="mt-3 text-sm leading-7 text-slate">
          {getDisplayErrorMessage(error, "관리자 화면을 처리하는 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.")}
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate">Digest {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="btn-ripple inline-flex items-center bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
          >
            다시 시도
          </button>
          <Link
            href="/admin"
            className="btn-ripple inline-flex items-center border border-ink/10 px-5 py-2.5 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            대시보드로
          </Link>
        </div>
        {details ? (
          <pre className="mt-6 whitespace-pre-wrap break-all border border-red-200 bg-red-50 p-4 text-left text-sm text-red-800">
            {details}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
