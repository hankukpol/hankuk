import { AnnouncementManager } from "@/components/announcements/AnnouncementManager";
import { requireDivisionAdminAccess } from "@/lib/auth";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listAnnouncements } from "@/lib/services/announcement.service";

type AdminAnnouncementsPageProps = {
  params: {
    division: string;
  };
};


export default async function AdminAnnouncementsPage({ params }: AdminAnnouncementsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "announcements");
  const session = await requireDivisionAdminAccess(params.division, ["ADMIN", "SUPER_ADMIN"]);
  const announcements = await listAnnouncements(params.division, { includeScheduled: true });

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white px-6 py-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">공지사항</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          직렬 공지와 전체 공지를 게시판 형태로 함께 관리합니다. 선택한 글은 우측 상세 패널에서 확인하고 바로 수정하거나 삭제할 수 있습니다.
        </p>
      </section>

      <AnnouncementManager
        divisionSlug={params.division}
        initialAnnouncements={announcements}
        canManageGlobal={session.role === "SUPER_ADMIN"}
      />
    </div>
  );
}
