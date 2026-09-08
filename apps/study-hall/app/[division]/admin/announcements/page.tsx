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
    <div className="admin-flat-page">
      <section>
        <h1 className="admin-page-title">공지사항</h1>
      </section>

      <AnnouncementManager
        divisionSlug={params.division}
        initialAnnouncements={announcements}
        canManageGlobal={session.role === "SUPER_ADMIN"}
      />
    </div>
  );
}
