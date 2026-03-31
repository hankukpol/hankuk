"use client";

import { AdminRosterPanel } from "@/components/admin/admin-roster-panel";
import { AdminStepScreen } from "@/components/admin/admin-step-screen";
import { SectionCard } from "@/components/ui/section-card";

export function AdminRosterScreen() {
  return (
    <AdminStepScreen
      step="roster"
      title="명단 관리"
      description="면접 회차별 등록 명단을 업로드하고 교체 여부를 검수합니다."
    >
      {({ sessionId, sessions, setSessionId }) => (
        <div className="space-y-6">
          <SectionCard
            title="업로드 전 확인"
            description="명단 파일과 대상 회차를 맞춘 뒤 업로드하는 단계입니다."
          >
            <p className="text-sm leading-6 text-slate-600">
              면접 회차를 잘못 선택하면 이후 본인 인증, 개인지원, 조 편성
              결과가 모두 다른 집합으로 연결됩니다. 업로드 전에 회차와 파일을 함께 다시
              확인하세요.
            </p>
          </SectionCard>

          <AdminRosterPanel
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
