"use client";

import { useState } from "react";

import { AdminGroupSyncPanel } from "@/components/admin/admin-group-sync-panel";
import { AdminRoomBulkPanel } from "@/components/admin/admin-room-bulk-panel";
import { AdminStepScreen } from "@/components/admin/admin-step-screen";
import { SectionCard } from "@/components/ui/section-card";

export function AdminGroupsScreen() {
  const [opsVersion, setOpsVersion] = useState(0);

  return (
    <AdminStepScreen
      step="groups"
      title="조 편성"
      description="외부 도구에서 만든 조 편성 결과를 가져오고 선택한 예약의 방을 한 번에 생성합니다."
    >
      {({ sessionId, sessions, setSessionId }) => (
        <div className="space-y-6">
          <SectionCard
            title="작업 흐름"
            description="CSV 다운로드부터 결과 업로드, 방 생성까지 한 단계에서 처리합니다."
          >
            <p className="text-sm leading-6 text-slate-600">
              먼저 조 편성용 CSV를 내려받아 외부 도구에서 편성한 뒤, 결과 파일을
              다시 업로드하세요. 업로드 후 필요하면 대기자를 포함해 관리자 방을
              일괄 생성할 수 있습니다.
            </p>
          </SectionCard>

          <AdminGroupSyncPanel
            key={`group-sync-${opsVersion}`}
            adminKey=""
            sessions={sessions}
            sessionId={sessionId}
            onSessionIdChange={setSessionId}
            hideSessionField
            onImported={() => setOpsVersion((current) => current + 1)}
          />

          <AdminRoomBulkPanel
            key={`room-bulk-${opsVersion}`}
            adminKey=""
            sessions={sessions}
            sessionId={sessionId}
            onSessionIdChange={setSessionId}
            hideSessionField
            onCreated={() => setOpsVersion((current) => current + 1)}
          />
        </div>
      )}
    </AdminStepScreen>
  );
}
