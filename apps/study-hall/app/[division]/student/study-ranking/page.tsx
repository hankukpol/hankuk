import { notFound } from "next/navigation";

import { StudentStudyRankingPanel } from "@/components/study-time/StudentStudyRankingPanel";
import { StudentPortalFrame } from "@/components/student-view/StudentPortalFrame";
import { requireDivisionStudentAccess } from "@/lib/auth";
import { isNotFoundError } from "@/lib/errors";
import { getKstMonth } from "@/lib/study-time-meta";
import { getDivisionFeatureSettings, getDivisionTheme } from "@/lib/services/settings.service";
import { getStudentDetail } from "@/lib/services/student.service";
import { getStudentStudyTimeRanking } from "@/lib/services/study-time.service";

type StudentStudyRankingPageProps = {
  params: {
    division: string;
  };
};

export default async function StudentStudyRankingPage({
  params,
}: StudentStudyRankingPageProps) {
  const session = await requireDivisionStudentAccess(params.division);

  try {
    const month = getKstMonth();
    const [division, student, settings, initialRanking] = await Promise.all([
      getDivisionTheme(params.division),
      getStudentDetail(params.division, session.studentId),
      getDivisionFeatureSettings(params.division),
      getStudentStudyTimeRanking(params.division, session.studentId, month),
    ]);

    return (
      <StudentPortalFrame
        division={{ slug: params.division, ...division }}
        student={student}
        current="study-ranking"
        attendanceEnabled={settings.featureFlags.attendanceManagement}
        announcementsEnabled={settings.featureFlags.announcements}
        pointsEnabled={settings.featureFlags.pointManagement}
        examsEnabled={settings.featureFlags.examManagement}
        title="학습 랭킹"
        description="월별 익명 학습시간 랭킹과 내 순위를 확인합니다."
      >
        <StudentStudyRankingPanel
          divisionSlug={params.division}
          initialRanking={initialRanking}
        />
      </StudentPortalFrame>
    );
  } catch (error) {
    if (isNotFoundError(error)) {
      notFound();
    }

    throw error;
  }
}
