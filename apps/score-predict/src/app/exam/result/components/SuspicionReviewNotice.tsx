"use client";

import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { ResultResponse } from "@/app/exam/result/types";

interface SuspicionReviewNoticeProps {
  status: ResultResponse["submission"]["suspicionStatus"];
}

export default function SuspicionReviewNotice({ status }: SuspicionReviewNoticeProps) {
  if (status === "CLEAR") return null;

  const excluded = status === "EXCLUDED";
  const Icon = excluded ? ShieldAlert : AlertTriangle;

  return (
    <section
      className={`rounded-xl border p-5 ${
 excluded
 ? "border-rose-200 bg-rose-50 text-rose-900"
 : "border-amber-200 bg-amber-50 text-amber-900"
 }`}
      role="status"
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="user-notice-title">
            {excluded ? "통계 제외 성적입니다" : "성적을 검토하고 있습니다"}
          </h2>
          <p className="mt-1 text-sm leading-6">
            점수, 과목별 점수와 과락 여부는 정상적으로 확인할 수 있습니다. 관리자 확인이
            완료될 때까지 표본 등수, 백분위, 결과 공유와 합격예측은 제공되지 않습니다.
          </p>
          <p className={`mt-2 text-xs ${excluded ? "text-rose-700" : "text-amber-700"}`}>
            답안을 정상적으로 입력했다면 학원 관리자에게 확인을 요청해 주세요.
          </p>
        </div>
      </div>
    </section>
  );
}
