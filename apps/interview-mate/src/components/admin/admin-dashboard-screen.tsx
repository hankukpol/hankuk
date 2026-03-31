"use client";

import { AdminExportPanel } from "@/components/admin/admin-export-panel";
import { AdminStatsPanel } from "@/components/admin/admin-stats-panel";
import { AdminStepScreen } from "@/components/admin/admin-step-screen";
import { SectionCard } from "@/components/ui/section-card";

export function AdminDashboardScreen() {
  return (
    <AdminStepScreen
      step="dashboard"
      title="현황판"
      description="면접 회차별 운영 통계와 CSV 내보내기를 확인합니다."
    >
      {({ sessionId, sessions, setSessionId }) => (
        <div className="space-y-6">
          <SectionCard
            title="운영 체크"
            description="현재 선택한 면접 회차 기준으로 운영 상태를 빠르게 확인합니다."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm text-slate-500">선택 회차</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  {sessions.find((session) => session.id === sessionId)?.name ??
                    "회차 선택 필요"}
                </p>
              </div>
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm text-slate-500">활용</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">통계 확인</p>
                <p className="mt-1 text-xs text-slate-500">
                  배정, 대기, 예약 현황 요약
                </p>
              </div>
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-sm text-slate-500">내보내기</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  CSV 다운로드
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  예약과 조 편성 결과 검수
                </p>
              </div>
            </div>
          </SectionCard>

          <AdminStatsPanel
            adminKey=""
            sessions={sessions}
            sessionId={sessionId}
            onSessionIdChange={setSessionId}
            hideSessionField
          />

          <AdminExportPanel
            adminKey=""
            sessions={sessions}
            sessionId={sessionId}
            onSessionIdChange={setSessionId}
            hideSessionField
          />
        </div>
      )}
    </AdminStepScreen>
  );
}
