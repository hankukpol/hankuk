"use client";

import { RefreshCw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="admin-main admin-content-frame admin-flat-page">
      <section>
        <h1 className="admin-page-title">화면을 불러오지 못했습니다</h1>
        <p className="admin-page-description">잠시 후 다시 시도해 주세요.</p>
      </section>
      <div>
        <button type="button" onClick={reset} className="admin-button">
          <RefreshCw className="h-5 w-5" />다시 시도
        </button>
      </div>
    </main>
  );
}
