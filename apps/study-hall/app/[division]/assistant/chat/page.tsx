import { redirect } from "next/navigation";

import { StaffChatPanel } from "@/components/chat/StaffChatPanel";
import { requireDivisionAssistantAccess } from "@/lib/auth";
import { listChatMessages } from "@/lib/services/chat.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

type AssistantChatPageProps = {
  params: {
    division: string;
  };
};

export default async function AssistantChatPage({ params }: AssistantChatPageProps) {
  const session = await requireDivisionAssistantAccess(params.division);
  const settings = await getDivisionFeatureSettings(params.division);

  // 조교 쪽에는 redirectIfDivisionFeatureDisabled 관례가 없어 assistant/page.tsx 방식을 따른다.
  if (!settings.featureFlags.staffChat) {
    redirect(`/${params.division}/assistant`);
  }

  const page = await listChatMessages(params.division, session, { limit: 50 });

  return (
    <div className="admin-flat-page">
      <section>
        <h1 className="admin-page-title">직원 채팅</h1>
        <p className="admin-page-description">관리자와 조교가 함께 쓰는 대화방입니다.</p>
      </section>

      <StaffChatPanel
        divisionSlug={params.division}
        viewerId={session.id}
        viewerRole={session.role}
        initialMessages={page.chatMessages}
        initialHasMoreBefore={page.hasMoreBefore}
        initialSyncedAt={page.syncedAt}
        variant="assistant"
      />
    </div>
  );
}
