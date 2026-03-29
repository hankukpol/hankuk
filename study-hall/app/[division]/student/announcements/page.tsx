import { notFound, redirect } from "next/navigation";
import { BellRing } from "lucide-react";

import { StudentAnnouncementBoard } from "@/components/announcements/StudentAnnouncementBoard";
import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import {
  PortalMetricCard,
  PortalSectionHeader,
  portalSectionClass,
} from "@/components/student-view/StudentPortalUi";
import { requireDivisionStudentAccess } from "@/lib/auth";
import { isNotFoundError } from "@/lib/errors";
import { listAnnouncements } from "@/lib/services/announcement.service";
import { getDivisionFeatureSettings, getDivisionTheme } from "@/lib/services/settings.service";
import { getStudentDetail } from "@/lib/services/student.service";

type StudentAnnouncementsPageProps = {
  params: {
    division: string;
  };
};

export default async function StudentAnnouncementsPage({
  params,
}: StudentAnnouncementsPageProps) {
  const session = await requireDivisionStudentAccess(params.division);

  try {
    const [division, student, settings] = await Promise.all([
      getDivisionTheme(params.division),
      getStudentDetail(params.division, session.studentId),
      getDivisionFeatureSettings(params.division),
    ]);

    if (!settings.featureFlags.announcements) {
      redirect(`/${params.division}/student`);
    }

    const announcements = await listAnnouncements(params.division);

    const pinnedCount = announcements.filter((announcement) => announcement.isPinned).length;

    return (
      <StudentPortalFrame
        division={{ slug: params.division, ...division }}
        student={student}
        current="announcements"
        attendanceEnabled={settings.featureFlags.attendanceManagement}
        announcementsEnabled={settings.featureFlags.announcements}
        pointsEnabled={settings.featureFlags.pointManagement}
        examsEnabled={settings.featureFlags.examManagement}
        title="공지사항 게시판"
        description="지점 공지와 전체 공지를 게시판 형태로 확인할 수 있습니다."
      >
        <section className="grid grid-cols-2 gap-2.5">
          <PortalMetricCard
            label="전체 공지"
            value={`${announcements.length}건`}
            caption="현재 학생에게 노출되는 공지 기준"
          />
          <PortalMetricCard
            label="중요 공지"
            value={`${pinnedCount}건`}
            caption="상단 고정으로 표시되는 공지"
            valueToneClassName="text-amber-700"
          />
        </section>

        <section className={portalSectionClass}>
          <PortalSectionHeader
            title="학생 공지 게시판"
            description="일반 게시판처럼 목록에서 공지를 선택하고 아래에서 내용을 확인할 수 있습니다."
            icon={<BellRing className="h-5 w-5" />}
          />

          <div className="mt-3">
            <StudentAnnouncementBoard announcements={announcements} />
          </div>
        </section>
      </StudentPortalFrame>
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      notFound();
    }

    throw error;
  }
}
