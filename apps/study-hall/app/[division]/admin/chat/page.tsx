import { StaffChatPanel } from "@/components/chat/StaffChatPanel";
import { requireDivisionAdminAccess } from "@/lib/auth";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listChatMessages } from "@/lib/services/chat.service";

type AdminChatPageProps = {
  params: {
    division: string;
  };
};

export default async function AdminChatPage({ params }: AdminChatPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "staffChat");
  const session = await requireDivisionAdminAccess(params.division, ["ADMIN", "SUPER_ADMIN"]);
  const page = await listChatMessages(params.division, session, { limit: 50 });

  return (
    <div className="admin-flat-page">
      <section>
        <h1 className="admin-page-title">직원 채팅</h1>
        <p className="admin-page-description">
          이 지점의 관리자와 조교가 함께 쓰는 대화방입니다. 학생에게는 보이지 않습니다.
        </p>
      </section>

      <StaffChatPanel
        divisionSlug={params.division}
        viewerId={session.id}
        viewerRole={session.role}
        initialMessages={page.chatMessages}
        initialHasMoreBefore={page.hasMoreBefore}
        initialSyncedAt={page.syncedAt}
        variant="admin"
      />
    </div>
  );
}
