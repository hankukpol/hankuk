"use client";

import { AdminRoomOpsPanel } from "@/components/admin/admin-room-ops-panel";
import { AdminStepScreen } from "@/components/admin/admin-step-screen";
import { SectionCard } from "@/components/ui/section-card";

export function AdminRoomsScreen() {
  return (
    <AdminStepScreen
      step="rooms"
      title="방 관리"
      description="생성된 방을 최종 점검하고 운영 중 수정 사항을 처리합니다."
    >
      {({ sessionId, sessions, setSessionId }) => (
        <div className="space-y-6">
          <SectionCard
            title="운영 포인트"
            description="방 이름, 인원, 비밀번호, 공지, 상태를 마지막 단계에서 정리합니다."
          >
            <p className="text-sm leading-6 text-slate-600">
              이 화면은 실시간 운영 점검과 예외 처리 중심입니다. 이미 생성된 방을
              수정하거나 멤버 상태를 조정하고, 현장 공지를 정리하는 용도로
              사용하세요.
            </p>
          </SectionCard>

          <AdminRoomOpsPanel
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
