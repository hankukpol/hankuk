import type { ReactNode } from "react";

import { StaffChatWatcher } from "@/components/chat/StaffChatWatcher";
import { AdminShell } from "@/components/layout/AdminShell";
import { requireDivisionAdminAccess } from "@/lib/auth";
import { getChatUnreadSummary } from "@/lib/services/chat.service";
import { getDivisionBySlug } from "@/lib/services/division.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

type AdminLayoutProps = {
  children: ReactNode;
  params: {
    division: string;
  };
};

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const [session, division, featureSettings] = await Promise.all([
    requireDivisionAdminAccess(params.division, ["ADMIN", "SUPER_ADMIN"]),
    getDivisionBySlug(params.division),
    getDivisionFeatureSettings(params.division),
  ]);

  if (!division) {
    return children;
  }

  // 감시자가 레이아웃에 있어야 어느 화면에서든 새 메시지를 알 수 있다.
  const chatEnabled = featureSettings.featureFlags.staffChat;
  const unread = chatEnabled ? await getChatUnreadSummary(params.division, session) : null;

  return (
    <AdminShell
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
    </AdminShell>
  );
}
