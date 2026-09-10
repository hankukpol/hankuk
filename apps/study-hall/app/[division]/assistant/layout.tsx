import type { ReactNode } from "react";

import { StaffChatWatcher } from "@/components/chat/StaffChatWatcher";
import { AdminShell } from "@/components/layout/AdminShell";
import { AssistantBottomNav } from "@/components/layout/AssistantBottomNav";
import { requireDivisionAssistantAccess } from "@/lib/auth";
import { getChatUnreadSummary } from "@/lib/services/chat.service";
import { getDivisionBySlug } from "@/lib/services/division.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

type AssistantLayoutProps = {
  children: ReactNode;
  params: {
    division: string;
  };
};

/**
 * DESIGN.md 5.1 · 8 — 조교도 관리자와 같은 셸을 쓴다.
 * 1024px 이상은 256px 검은 사이드바, 미만은 상단 헤더의 `조교 메뉴` 버튼으로 펼친다.
 * 메뉴 목록과 경로만 조교용으로 바뀌고 레이아웃·여백·본문 폭은 관리자와 동일하다.
 */
export default async function AssistantLayout({ children, params }: AssistantLayoutProps) {
  const [session, division, featureSettings] = await Promise.all([
    requireDivisionAssistantAccess(params.division),
    getDivisionBySlug(params.division),
    getDivisionFeatureSettings(params.division),
  ]);

  if (!division) {
    return children;
  }

  const chatEnabled = featureSettings.featureFlags.staffChat;
  const unread = chatEnabled ? await getChatUnreadSummary(params.division, session) : null;

  return (
    <AdminShell
      role="assistant"
      divisionSlug={division.slug}
      divisionName={division.name}
      divisionColor={division.color}
      adminName={session.name}
      viewerId={session.id}
      viewerRole={session.role}
      featureFlags={featureSettings.featureFlags}
    >
      <StaffChatWatcher
        divisionSlug={division.slug}
        divisionId={division.id}
        divisionName={division.name}
        viewerId={session.id}
        enabled={chatEnabled}
        initialUnreadCount={unread?.unreadCount ?? 0}
      />
      {children}
      <AssistantBottomNav
        divisionSlug={division.slug}
        phoneSubmissionsEnabled={featureSettings.featureFlags.phoneSubmissions}
      />
    </AdminShell>
  );
}
